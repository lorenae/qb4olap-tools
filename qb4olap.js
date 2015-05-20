//qb4olap.js

var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
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

var sampleQueries = require('./models/sample-queries.json');


var app = express();

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

		var renderMeasure = function(measure ,options) {
			var out = "<li>";                  
			out += "<i class=\"fa fa-fw fa-tachometer\"></i>";
			out += options.fn(measure);
			out += "</li>";
			return out;
		};
		var meas = "<ul style=\"list-style: none; padding-left: 0;\">";
		measures.forEach(function (measure){
			 meas += renderMeasure (measure,options);
		})
		meas += "</ul>";
		return new Handlebars.SafeString(meas);
	},

	saveInstance: function(instance, options){
		instanceJSON = JSON.stringify(instance);
		//console.log("INSTANCES en el server: "+instanceJSON);

		script = "<script type='text/javascript'> var cubeinstance="+instanceJSON+"</script>";
		return new Handlebars.SafeString(script);	


//		hidden = "<input id=\"instancejson\" type=\"hidden\" value=\""+instanceJSON+"\">";
//		return new Handlebars.SafeString(hidden);	
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
	//default endpoint
	var endpoint = "http://www.fing.edu.uy/inco/grupos/csi/sparql";
	var target = req.query.target;

	if(req.query.endpoint) 
		{endpoint = req.query.endpoint;
	}
	sess=req.session;
	sess.state.endpoint = endpoint;
	
	backend.getCubes(endpoint, function (err, cubelist) {
		if (cubelist)
		{	
			//console.log(util.inspect(cubelist, { showHidden: false, depth: null, colors:true }));
			sess.cubes = cubelist;
			res.render(target);
		}
		else
		{	res.render(target, {error:err});
		}
	});
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
	
	sess=req.session;
	sess.state.cube = cubeuri;
	sess.state.dataset = dataset;
	sess.state.schemagraph = schemagraph;
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
	
	sess.cubes.forEach(function(cube){
		cube.selected = (cube.uri == cubeuri);
	})

	var selectedcube = sess.cubes.filter(function(c){
        return c.selected;});  
	var dataset = selectedcube[0].dataset;
	var schemagraph = selectedcube[0].schemagraph; 
	
	sess=req.session;
	sess.state.cube = cubeuri;
	sess.state.dataset = dataset;
	sess.state.schemagraph = schemagraph;

	if(sess.state.endpoint && sess.state.cube)
    {	backend.getCubeSchema(sess.state.endpoint, sess.state.cube,sess.state.dataset,sess.state.schemagraph, function (err, cubeschema) {
   		sess.schema = cubeschema;
   		sess.queries = getSampleQueries(cubeuri);
   		backend.getCubeInstances(sess.state.endpoint, sess.state.cube,sess.state.schemagraph, function (err, cubeinstances) {
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
			sess.sparqlquery = spquery;
			res.render('queries', {sparqlaccordion:true});
		});

	}else{
		res.render('queries');
	}
});

app.get('/runsparqlquery', function(req, res) {
	sess=req.session;
	if(sess.sparqlquery && sess.state.endpoint){
		backend.runSparql(sess.state.endpoint,sess.sparqlquery,3000, function (err, content) {
			console.log(util.inspect(content, { showHidden: false, depth: null, colors:true }));
        	res.render('sparql', {data:content});
		});
	}
});


app.get('/sparql', function(req, res){
	var endpoint = 'http://www.fing.edu.uy/inco/grupos/csi/sparql';
	var query = "SELECT *  WHERE { ?s ?p ?o } LIMIT 2";
	backend.runSparql(endpoint,query, 3000, function (err, content) {
        res.render('sparql', {data:content});
	});
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
