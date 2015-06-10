//qb4olap.js

var express = require('express');
var fs = require('fs');
var session = require('express-session');
var cache = require('memory-cache');
var bodyParser = require('body-parser');
var compress = require('compression');


//var credentials = require('./credentials.js');
var backend = require('./models/sparql-backend.js');
var operators = require('./models/qb4olap-operators.js');

var util = require('util');
var oursecret = 'qb4olapfing';
var expressHandlebars  = require('express-handlebars');
var Handlebars = require('handlebars');


var Datacube = require('./models/Datacube');
var Hierarchy = require('./models/Hierarchy');
var Dimension = require('./models/Dimension');

var sampleQueries = require('./data/sample-queries.json');
var storedcubes = require('./data/stored-cubes.json');


var app = express();

//use compression
app.use(compress());

// use express-session with a secret
app.use(session({secret: oursecret, 
                 saveUninitialized: true,
                 resave: true}));


// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
  extended: false
}));

// parse application/json
app.use(bodyParser.json());


// set up handlebars view engine

var hbs = expressHandlebars.create({
  defaultLayout: 'main',
  handlebars: Handlebars,
  helpers: {
    section: function(name, options){
			if(!this._sections) this._sections = {};
			this._sections[name] = options.fn(this);
			return null;
		},
	
	showDimensions: function(dimensions, options) {

		var renderDimension = function(dimension, dimordinal ,options) {
			var danchor = "dim"+dimordinal;

			var d = new Dimension (dimension.uri, dimension.name, dimension.levels, dimension.hierarchies);
			var hordinal = 0
			var out = "<li><a class=\"collapsed\" data-toggle=\"collapse\" data-target=\"#"+danchor+"\" aria-expanded=\"false\" href=\"javascript:;\">";                  
			out += "<i class=\"fa fa-fw fa-circle\"></i>";
			out += options.fn(d);
			out +="<i class=\"fa fa-fw fa-chevron-down\"></i></a>";
			out += "<ul id=\""+danchor+"\" class=\"collapse\" style=\"height: 0px; list-style: none; padding-left: 1;\" aria-expanded=\"false\">";
			dimension.hierarchies.forEach(function (hierarchy){
				var h = new Hierarchy(hierarchy.uri, hierarchy.name, hierarchy.lattice);
				var orderedLevels = h.traverse();
				var hanchor = "hier"+dimordinal*10+hordinal;
				hordinal++;
				out += "<li><a class=\"collapsed\" data-toggle=\"collapse\" data-target=\"#"+hanchor+"\" aria-expanded=\"false\" href=\"javascript:;\">";
				out += "<i class=\"fa fa-fw fa-sitemap\"></i>";
				out += options.fn(h);
				out +="<i class=\"fa fa-fw fa-chevron-down\"></i></a>";
				out += "<ul id=\""+hanchor+"\" class=\"collapse\" style=\"height: 0px; list-style: none; padding-left: 2;\" aria-expanded=\"false\">";

				orderedLevels.forEach(function (ol){
					out += "<li>";
					for (var p = 0; p < ol.pos; p++) {
						out += "<i class=\"fa fa-fw fa-square\"></i>";
					}
					var level = d.getLevel(ol.level);
					out += options.fn(level);
					out += "</li>";
				})
				//close level list
				out += "</ul></li>";
			})
			
			out += "</ul></li>";
			return out;
		};
		var dims = "<ul style=\"list-style: none; padding-left: 0;\">";
		for (var i = 0; i < dimensions.length; i++) {
		   dims += renderDimension (dimensions[i],i,options);
		}
		dims += "</ul>";
		return new Handlebars.SafeString(dims);
	},
	
	showMeasures: function(measures, options) {

		var renderMeasure = function(measure, measureordinal, options) {
			var manchor = "meas"+measureordinal;
			var out = "<li><a class=\"collapsed\" data-toggle=\"collapse\" data-target=\"#"+manchor+"\" aria-expanded=\"false\" href=\"javascript:;\">";                  
			out += "<i class=\"fa fa-fw fa-tachometer\"></i>";
			out += measure.uri;
			out +="<i class=\"fa fa-fw fa-chevron-down\"></i></a>";
			out += "<ul id=\""+manchor+"\" class=\"collapse\" style=\"height: 0px; list-style: none; padding-left: 1;\" aria-expanded=\"false\">";
			out += "<li><i class=\"fa fa-fw fa-square\"></i>Name: "+measure.name+"</li>";
			out += "<li><i class=\"fa fa-fw fa-square\"></i>Aggregation Func.: "+measure.aggfunc+"</li>";
			out += "<li><i class=\"fa fa-fw fa-square\"></i>Type: "+measure.datatype+"</li>";
			out += "</ul></li>";
			return out;
		};
		var meas = "<ul style=\"list-style: none; padding-left: 0;\">";
		for(var i=0; i<measures.length; i++){
				 meas += renderMeasure (measures[i],i,options);
		}		
		meas += "</ul>";
		return new Handlebars.SafeString(meas);
	},

	showCubes: function(cubes,target,options){

		var renderCube = function(cube, options){
		
			var href = "getcompletecube?cubeselect="+encodeURIComponent(cube.uri)+"&target="+target;

			if(cube.selected){
				var style = "class=\"list-group-item active\">";
			}else{
				var style = "class=\"list-group-item\">";
			};

			var out = "<a href=\""+href+"\""+style;
			out+= "<h3 class=\"list-group-item-heading\">"+cube.name+"</h3>";
			out+= "<p class=\"list-group-item-text\"> URI:"+cube.uri+"</p>";
			out+= "<p class=\"list-group-item-text\"> \#Obs:"+cube.numobs+"</p>";
			out+= "</a>"
			return out;
		};

		var cubs = "<div class=\"list-group\">";
		cubes.forEach(function(cube){
			cubs += renderCube(cube,options);
		});
		cubs += "</div>";
        return new Handlebars.SafeString(cubs);        
	},

	saveInstance: function(instance, options){
		instanceJSON = JSON.stringify(instance);
		//console.log("INSTANCES en el server: "+instanceJSON);

		script = "<script type='text/javascript'> var cubeinstance="+instanceJSON+"</script>";
		return new Handlebars.SafeString(script);	

	},

	createTableRows: function(variables, data, options){

		var rows = '';

		data.forEach(function(row){
			rows += "<tr>";
			Object.getOwnPropertyNames(row).forEach(function(varname) {
				rows += "<td>"+row[varname].value+"</td>";
  				});
			rows += "</tr>";
				
		});
		return new Handlebars.SafeString(rows);

	},
	createTableHeaders: function(variables, options){

		var hs = '';
		variables.forEach(function(varname){
			hs += "<th data-field=\""+varname+"\">"+varname+"</th>";	
		});
		return new Handlebars.SafeString(hs);
	},

	saveResultColumns: function(columns, options){
		colsJSON = JSON.stringify(columns);
		script = "<script type='text/javascript'> var sparqlcols="+colsJSON+"</script>";
		return new Handlebars.SafeString(script);	
	},

	getResultsTableHeaders: function(columns, options){

		var hs = '';
		columns.forEach(function(column){
			hs += "<th data-field=\""+column.colvar+"\" data-sortable=\"true\">"+column.colname+"</th>";
		});
		console.log("TABLE HEADERS: "+ util.inspect(hs, { showHidden: false, depth: null, colors:true }));
		return new Handlebars.SafeString(hs);
	},
	showQuery: function(query, options) {

			var querytext = "";
			querytext += "QUERY \n";
			query.query.forEach(function(operation){
				if ( (operation.qloperator=="ROLLUP") || (operation.qloperator=="DRILLDOWN")){
				querytext += operation.statement+"="+operation.qloperator+"("+operation.source+","+operation.dimension+","+operation.level+");\n";
				}
				if(operation.qloperator=="SLICE"){
					if(operation.condType == "dimension"){
						querytext += operation.statement+"= SLICE("+operation.source+",D("+operation.dimension+"));\n";
					}else{
						querytext += operation.statement+"= SLICE("+operation.source+",M("+operation.measure+"));\n";
					}
				}
				if(operation.qloperator=="DICE"){
					// TODO aux function that transforms the condition tree into a string
					querytext += operation.statement+"= DICE("+operation.source+","+operation.dicecondition.operator+");\n";
				}
			});
			return new Handlebars.SafeString(querytext);
	},
	showSparqlQuery: function(query, options){
			//console.log("showsparql in handle");
			return new Handlebars.SafeString(query);
	}
	}
});

// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');


app.enable('view cache');

app.set('port', process.env.PORT || 3000);
app.use(express.static(__dirname + '/public'));


app.use(require('cors')());
app.use('/api', require('cors')());

app.use(function(req, res, next){
	//res.locals.showTests = app.get('env') !== 'production' && req.query.test === '1';
	//this allows handlebars to access session
	res.locals.session = req.session;
	next();
});

//routes

var sess;

app.get('/', function(req, res) {
	res.render('home');
});
app.get('/about', function(req, res) {
	res.render('about',{
		fort: fortune.getFortune(),
		pageTestScript: '/qa/tests-about.js'
	});
});


app.get('/explorer', function(req, res){
	
	if(typeof req.session.state === 'undefined'){
   		req.session.state = {};
 	};
	res.render('explorer');
});


app.get('/queries', function(req, res){

	if(typeof req.session.state === 'undefined'){
   		req.session.state = {};
 	};
	res.render('queries');
});


app.get('/getcubes', function(req, res) {

	sess=req.session;
	//default endpoint
	var endpoint = "http://www.fing.edu.uy/inco/grupos/csi/sparql";
	var target = req.query.target;
	if(req.query.endpoint) 	{endpoint = req.query.endpoint;}
	sess.state.endpoint = endpoint;			

	//if cubes are in session, use them
	if (sess.cubes){
		res.render(target);
	}else{
		//get the cubes from cache
		c = cache.get('cubes');
		if (c){
			sess.cubes = c;
			res.render(target);
		//if cubes are not cached yet, try to get from file	
		}else{
			if(storedcubes.cubes){
				//if file is not old enough use it
				if (!reloadStoredCubes()){
					sess.cubes = storedcubes.cubes;
					cache.put('cubes',storedcubes.cubes,43200000);
					res.render(target);
				
				}else{
					backend.getCubes(endpoint, function (err, cubelist) {
						if (cubelist)
						{	
							//console.log(util.inspect(cubelist, { showHidden: false, depth: null, colors:true }));
							cache.put('cubes',cubelist,43200000);
							storeCubes(Date.now(),cubelist);
							sess.cubes = cubelist;
							res.render(target);
						}
						else
						{	res.render(target, {error:err});
						}
					});
				}
			}
		}
	}
});


app.get('/getcubestructure', function(req, res) {
	sess=req.session;
	var cubeuri = req.query.cubeselect;

	sess.cubes.forEach(function(cube){
		cube.selected = (cube.uri == cubeuri);
	})

	var selectedcube = sess.cubes.filter(function(c){
        return c.selected;});  
	var dataset = selectedcube[0].dataset;
	var schemagraph = selectedcube[0].schemagraph; 
	var instancegraph = selectedcube[0].instancegraph; 
	
	sess=req.session;
	sess.state.cube = cubeuri;
	sess.state.dataset = dataset;
	sess.state.schemagraph = schemagraph;
	sess.state.instancegraph = instancegraph;
	if(sess.state.endpoint && sess.state.cube)
    {	backend.getCubeSchema(sess.state.endpoint, sess.state.cube,sess.state.schemagraph, function (err, datacube) {
   		sess.schema = datacube;
   		sess.queries = getSampleQueries(dataset);
   		console.log(req.originalUrl);
    	res.render('queries');
	});
	}	
});


app.get('/getcompletecube', function(req, res) {
	sess=req.session;

	var cubeuri = req.query.cubeselect;
	var target = req.query.target;
	
	//console.log("cubeuri: "+cubeuri+", target:"+target);
	//console.log ("session.cubes" + JSON.stringify(sess.cubes));

	sess.cubes.forEach(function(cube){
		cube.selected = (cube.uri == cubeuri);
	});


	var selectedcube = sess.cubes.filter(function(c){
        return c.selected;});  
	var dataset = selectedcube[0].dataset;
	var schemagraph = selectedcube[0].schemagraph;
	var instancegraph = selectedcube[0].instancegraph; 
	
	sess=req.session;
	sess.state.cube = cubeuri;
	sess.state.dataset = dataset;
	sess.state.schemagraph = schemagraph;
	sess.state.instancegraph = instancegraph;

	if(sess.state.endpoint && sess.state.cube)
    {	backend.getCubeSchema(sess.state.endpoint, sess.state.cube,sess.state.dataset,sess.state.schemagraph, function (err, cubeschema) {
    	cubeschema.instancegraph = instancegraph;
    	cubeschema.schemagraph = schemagraph;
   		sess.schema = cubeschema;
   		sess.queries = getSampleQueries(cubeuri);
   		backend.getCubeInstances(sess.state.endpoint, sess.state.cube,sess.state.schemagraph,sess.state.instancegraph, function (err, cubeinstances) {
   			sess.instances = cubeinstances;
	    	res.render(target);
			});
   		});
	}	
});

app.get('/simplifyquery', function(req, res) {

	var querytext = req.query.querypanel;
	var query = req.query.parsedquery;
	
	sess=req.session;
	if(sess.schema){
		sess.querytext = querytext;
		sess.originalquery = query;
		operators.getSimplifiedQuery(sess.state.endpoint, sess.schema, query, function (err, simplified) {
			sess.simplequery = simplified;
			res.render('queries', {editoraccordion:true});
		});
	} else{
		res.render('queries');
	}
});

app.get('/getsparqlquery', function(req, res) {
	sess=req.session;
	if(sess.schema && sess.simplequery){
		operators.getSparqlQuery(sess.state.endpoint, sess.schema, sess.simplequery, function (err,spquery) {
			sess.sparqlcols = spquery.columns;
			//console.log("QUERY COLS FROM GETSPQUERY:" +util.inspect(spquery.columns, { showHidden: false, depth: null, colors:true }));
			sess.sparqlquery = spquery.sparqlquery;
			res.render('queries', {sparqlaccordion:true});
		});

	}else{
		res.render('queries');
	}
});


app.get('/runsparql', function(req, res) {
	sess=req.session;
	var sparqlquery = req.query.sparqlquery;
	
	//console.log("QUERY: "+sparqlquery);
	//console.log(sess.state.endpoint);

	if(sparqlquery && sess.state.endpoint){
		backend.runSparql(sess.state.endpoint,sparqlquery,0, function (err, content) {		
			res.end(JSON.stringify(backend.processResults(content)));
		});
	}
});

app.get('/runsparqlquery', function(req, res) {
	sess=req.session;
	var sparqlquery = req.query.sparqlquerypanel;

	if(sparqlquery && sess.state.endpoint){
		backend.runSparql(sess.state.endpoint,sparqlquery,0, function (err, content) {
			//TODO need to send metadata for each column
			sess.queryresults = content;
			res.render('queries', {resultsaccordion:true});
			//res.render('queryresults', {vars:content.head.vars, results:content.results.bindings});
		});
	}
});



app.listen(app.get('port'), function(){
	console.log( 'Express started on http://localhost:' +
		app.get('port') + '; press Ctrl-C to terminate.' );
});



// sample Queries
function getSampleQueries(cube){
	return  sampleQueries.queries.filter(function(query){
        return query.cube == cube;}
        );
}

// keep stored cubes updated
function reloadStoredCubes(){
    var stored = storedcubes.timestamp;
    //console.log(stored);
    //console.log(Date.now());
	var age = Math.abs(Date.now() - stored) / 3600000;
	//console.log("AGE:"+age);
	return (age>12);
}

function storeCubes(timestamp,cubelist){
	var toStore = {
		timestamp:timestamp,
		cubes:cubelist
	}
	var outputFilename = './data/stored-cubes.json';

	fs.writeFile(outputFilename, JSON.stringify(toStore, null, 4), function(err) {
	    if(err) {
	      console.log(err);
	    } else {
	      console.log("JSON saved to " + outputFilename);
	    }
	}); 

}


/*
// middleware to add weather data to context
app.use(function(req, res, next){
	if(!res.locals.partials) res.locals.partials = {};
	res.locals.partials.weather = getWeatherData();
	next();
});
*/	

/*
// api
var Attraction = require('./models/attraction.js');
var rest = require('connect-rest');
rest.get('/attractions', function(req, content, cb){
	Attraction.find({ approved: true }, function(err, attractions){
		if(err) return cb({ error: 'Internal error.' });
		cb(null, attractions.map(function(a){
			return {
				name: a.name,
				description: a.description,
				location: a.location,
			};
		}));
	});
});
rest.post('/attraction', function(req, content, cb){
	var a = new Attraction({
		name: req.body.name,
		description: req.body.description,
		location: { lat: req.body.lat, lng: req.body.lng },
		history: {
			event: 'created',
			email: req.body.email,
			date: new Date(),
		},
		approved: false,
	});
	a.save(function(err, a){
		if(err) return cb({ error: 'Unable to add attraction.' });
		cb(null, { id: a._id });
	});
});
rest.get('/attraction/:id', function(req, content, cb){
	Attraction.findById(req.params.id, function(err, a){
		if(err) return cb({ error: 'Unable to retrieve attraction.' });
		cb(null, {
			name: a.name,
			description: a.description,
			location: a.location,
		});
	});
});
// API configuration
var apiOptions = {
	context: '/',
	domain: require('domain').create(),
};

// link API into pipeline
app.use(rest.rester(apiOptions));
*/


// 404 catch-all handler (middleware)
app.use(function(req, res, next){
	res.status(404);
	res.render('404');
});
// 500 error handler (middleware)
app.use(function(err, req, res, next){
	console.error(err.stack);
	res.status(500);
	res.render('500');
});
