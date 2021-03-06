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
var storedcompletecubes = require('./data/stored-completecubes.json');

var defendpoint = "https://www.fing.edu.uy/inco/grupos/csi/sparql";
var cubesFile = './data/stored-cubes.json';
var completeCubesFile = './data/stored-completecubes.json';

var app = express();

//time in ms to keep cubes in local cache
//1 hour
var cubetimeout = 3600000;

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

		var prettyprinttype = function(type){
			if (type == null){
				return type;
			}else{
				return type.replace('http://www.w3.org/2001/XMLSchema#', 'xsd:');
			}
		}

		var renderDimension = function(dimension, dimordinal ,options) {
			var danchor = "dim"+dimordinal;

			var d = new Dimension (dimension.uri, dimension.name, dimension.levels, dimension.hierarchies);
			////console.log("Dimension : "+util.inspect(d, { showHidden: false, depth: null, colors:true }));
			var hordinal = 0
			var out = "<li class=\"schema\" title=\""+ d.uri+"\"><a class=\"collapsed\" data-toggle=\"collapse\" data-target=\"#"+danchor+"\" aria-expanded=\"false\" href=\"javascript:;\">";                  
			out += "<i class=\"fa fa-fw fa-circle\"></i>";
			out += d.name;
			out +="<i class=\"fa fa-fw fa-chevron-down\"></i></a>";
			out += "<ul id=\""+danchor+"\" class=\"collapse\" style=\"height: 0px; list-style: none; padding-left: 1;\" aria-expanded=\"false\">";
			dimension.hierarchies.forEach(function (hierarchy){
				var h = new Hierarchy(hierarchy.uri, hierarchy.name, hierarchy.lattice, hierarchy.steps);
				var orderedLevels = h.traverse();
				
				var hanchor = "hier"+dimordinal*10+hordinal;
				hordinal++;
				out += "<li class=\"schema\" title=\""+ h.uri+"\"><a class=\"collapsed\" data-toggle=\"collapse\" data-target=\"#"+hanchor+"\" aria-expanded=\"false\" href=\"javascript:;\">";
				out += "<i class=\"fa fa-fw fa-sitemap\"></i>";
				out += h.name;
				out +="<i class=\"fa fa-fw fa-chevron-down\"></i></a>";
				out += "<ul id=\""+hanchor+"\" class=\"collapse\" style=\"height: 0px; list-style: none; padding-left: 2;\" aria-expanded=\"false\">";
				var lordinal = 0;

				orderedLevels.forEach(function (ol){
					////console.log("ol : "+util.inspect(ol, { showHidden: false, depth: null, colors:true }));
					
					var level = d.getLevel(ol.level);
					////console.log("level : "+util.inspect(level, { showHidden: false, depth: null, colors:true }));
					var attribs = level.attribs;
					if(attribs.length>0){
						var lanchor = "lev"+dimordinal*100+hordinal*10+lordinal;
						lordinal++;
						out += "<li class=\"schema\" title=\""+ level.uri+"\"><a class=\"collapsed\" data-toggle=\"collapse\" data-target=\"#"+lanchor+"\" aria-expanded=\"false\" href=\"javascript:;\">";
						for (var p = 0; p < ol.pos; p++) {
							out += "<i class=\"fa fa-fw fa-square\"></i>";
						}
						out += level.name;
						out +="<i class=\"fa fa-fw fa-chevron-down\"></i></a>";
						//atribute list
						out += "<ul id=\""+lanchor+"\" class=\"collapse\" style=\"height: 0px; list-style: none; padding-left: 2;\" aria-expanded=\"false\">";
						attribs.forEach(function(a){
							out += "<li class=\"schema\" title=\""+ a.uri+"\">";
							out += "<i class=\"fa fa-fw fa-square\"></i>";
							out += a.name+ " ( "+prettyprinttype(a.datatype)+" ) ";
							out += "</li>";
						});
						out += "</ul></li>";
					}else{
						out += "<li class=\"schema\" title=\""+ level.uri+"\">";
						for (var p = 0; p < ol.pos; p++) {
							out += "<i class=\"fa fa-fw fa-square\"></i>";
						}
						out += level.name;
						out += "</li>";
					}
					
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

		var prettyprinttype = function(type){
			var t = type.replace('http://www.w3.org/2001/XMLSchema#', 'xsd:');
			return t;
		}
		var renderMeasure = function(measure, measureordinal, options) {
			var manchor = "meas"+measureordinal;
			var out = "<li title=\""+ measure.uri+"\" ><a class=\"collapsed\" data-toggle=\"collapse\" data-target=\"#"+manchor+"\" aria-expanded=\"false\" href=\"javascript:;\">";                  
			out += "<i class=\"fa fa-fw fa-tachometer\"></i>";
			out += measure.name;
			out +="<i class=\"fa fa-fw fa-chevron-down\"></i></a>";
			out += "<ul id=\""+manchor+"\" class=\"collapse\" style=\"height: 0px; list-style: none; padding-left: 1;\" aria-expanded=\"false\">";
			out += "<li><i class=\"fa fa-fw fa-square\"></i>Aggregation Function: "+measure.aggfunc+"</li>";
			out += "<li><i class=\"fa fa-fw fa-square\"></i>Type: "+prettyprinttype(measure.datatype)+"</li>";
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
			out+= "<h4 class=\"list-group-item-heading\"><i class=\"fa fa-shield fa-rotate-270\"></i> "+cube.name+"</h4>";
			out+= "<p class=\"list-group-item-text\"> <b>Schema IRI: </b>"+cube.uri+"</p>";
			out+= "<p class=\"list-group-item-text\"> <b>Dataset IRI: </b>"+cube.dataset+"</p>";
			
			out+= "<p class=\"list-group-item-text\"> <b>Schema graph: </b>"+cube.schemagraph+"</p>";
			out+= "<p class=\"list-group-item-text\"> <b>Instance graph: </b>"+cube.instancegraph+"</p>";
			
			out+= "<p class=\"list-group-item-text\"> <b>QB4OLAP version: </b>"+cube.qb4olapversion+"</p>";
			out+= "<p class=\"list-group-item-text\"> <b>Number of observations: </b>"+cube.numobs+"</p>";
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
		////console.log("INSTANCES en el server: "+instanceJSON);
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
		////console.log("TABLE HEADERS: "+ util.inspect(hs, { showHidden: false, depth: null, colors:true }));
		return new Handlebars.SafeString(hs);
	},
	showQuery: function(query, options) {

		var renderCondition = function(dicecondition){
			var operators = ['AND','OR'];
		    var strcond = null;
		    if (dicecondition.nodetype == "leaf"){
		        if(dicecondition.args[0].condType == "attribute"){
		            strcond = dicecondition.args[0].dimension+"|"+ dicecondition.args[0].level+"|"+dicecondition.args[0].attribute+" "+dicecondition.operator+" "+dicecondition.args[1];
		        }else if (dicecondition.args[0].condType == "measure"){
		            strcond = dicecondition.args[0].measure+" "+ dicecondition.operator +" "+dicecondition.args[1];
		        }
		    }else{
		        //if its a binary operator
		        if (operators.indexOf(dicecondition.operator) > -1){
		            var cleft = renderCondition(dicecondition.args[0]);
		            var cright = renderCondition(dicecondition.args[1]);
		            
		            if (dicecondition.operator == "AND") binoper = "&&";
		            if (dicecondition.operator == "OR") binoper = "||";
		            strcond = "(("+cleft +") "+ dicecondition.operator+" ("+cright+"))";
		        }
		    }
		    return strcond;
		};		

		var querytext = "QUERY \n";
		query.query.forEach(function(operation){
			if ( (operation.qloperator=="ROLLUP") || (operation.qloperator=="DRILLDOWN")){
			querytext += operation.statement+"="+operation.qloperator+"("+operation.source+","+operation.dimension+","+operation.level+");\n";
			}
			if(operation.qloperator=="SLICE"){
				if(operation.condType == "dimension"){
					querytext += operation.statement+"= SLICE("+operation.source+","+operation.dimension+");\n";
				}else{
					querytext += operation.statement+"= SLICE("+operation.source+",MEASURES("+operation.measure+"));\n";
				}
			}
			if(operation.qloperator=="DICE"){
				////console.log("DICE  "+util.inspect(operation.dicecondition, { showHidden: false, depth: null, colors:true }));
				// TODO aux function that transforms the condition tree into a string
				querytext += operation.statement+"= DICE("+operation.source+","+renderCondition(operation.dicecondition)+");\n";
			}
		});
		return new Handlebars.SafeString(querytext.replace(/^\s\s*/, ''));
	},
	showQLQuery: function(query,options){
		return new Handlebars.SafeString(query.replace(/^\s\s*/, '')); 
	},
	showSparqlQuery: function(query, options){
			////console.log("showsparql in handle");
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
	res.render('home',{ layout: 'ppal' });
});
app.get('/home', function(req, res) {
	res.render('home',{ layout: 'ppal' });
});

app.get('/explorer', function(req, res){
	
	if(typeof req.session.state === 'undefined'){
   		req.session.state = {};
 	};
	res.render('explorer',{ layout: 'explorer' });
});


app.get('/queries', function(req, res){

	if(typeof req.session.state === 'undefined'){
   		req.session.state = {};
 	};
	res.render('queries',{ layout: 'queries' });
});


app.get('/getcubes', function(req, res) {

	//flag to check if the endpoint has changed
	var endpchanged = true;
	//target, either query or explorer	
	var target = req.query.target;
	//force refresh cubes if true
	var refresh = req.query.refresh;

	
	sess=req.session;
	////console.log("query endp: "+req.query.endpoint);
	////console.log("session endp: "+sess.state.endpoint);
	////console.log("refresh:"+req.query.refresh);
	if(req.query.endpoint) 	{
		if (sess.state.endpoint){
			endpchanged = (sess.state.endpoint != req.query.endpoint);
		}
		////console.log("change: "+endpchanged);
		sess.state.endpoint = req.query.endpoint;
	}else{
		sess.state.endpoint = defendpoint;	
	}

	var actualendpoint = sess.state.endpoint;
	////console.log("session endp: "+sess.state.endpoint);
	if (!refresh){
		if(!endpchanged && sess.cubes){
			//if cubes are in session, use them
			res.render(target,{ layout: target });
		}else{
			//get the cubes from cache
			//use the endpoint URL as key
			c = cache.get(actualendpoint);
			if (c){
				sess.cubes = c;
				res.render(target);
			//if cubes are not in memory-cache or timeout has passed, try to get from file-cache
			}else{
				if(storedcubes[actualendpoint] && !reloadStoredCubes(storedcubes[actualendpoint].timestamp)){
					//if file is not old enough use it
						sess.cubes = storedcubes[actualendpoint].cubes;
						cache.put(actualendpoint,storedcubes[actualendpoint].cubes,cubetimeout);
						res.render(target,{ layout: target });
				}else{
					backend.getCubes(actualendpoint, function (err, cubelist) {
					if (cubelist)
						{	
							////console.log(util.inspect(cubelist, { showHidden: false, depth: null, colors:true }));
							cache.put(actualendpoint,cubelist,cubetimeout);
							storeCubes(storedcubes,Date.now(),actualendpoint,cubelist);
							if(sess.state.completecubes){
								sess.state.completecubes =removeCompleteCubesFromSession(sess.state.completecubes,actualendpoint);	
							}
							removeCompleteCubesFromFile(storedcompletecubes,actualendpoint);
							sess.cubes = cubelist;
							res.render(target,{layout: target });
						}
						else{
							////console.log("error: "+err);
							res.render(target, {layout:target, error:err});
						}
					});
				}
			}
		}
	}else{
		//force refresh 
		backend.getCubes(actualendpoint, function (err, cubelist) {
		if (cubelist)
			{	
				////console.log(util.inspect(cubelist, { showHidden: false, depth: null, colors:true }));
				cache.put(actualendpoint,cubelist,cubetimeout);
				storeCubes(storedcubes,Date.now(),actualendpoint,cubelist);
				if(sess.state.completecubes){
					sess.state.completecubes =removeCompleteCubesFromSession(sess.state.completecubes,actualendpoint);	
				}
				removeCompleteCubesFromFile(storedcompletecubes,actualendpoint);
				sess.cubes = cubelist;
				res.render(target,{layout: target });
			}
			else{
				////console.log("error: "+err);
				res.render(target, {layout:target, error:err});
			}
		});

	}
});

/*

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
   		////console.log(req.originalUrl);

    	res.render('queries');
	});
	}	
});
*/

app.get('/getcompletecube', function(req, res) {
	sess=req.session;

	var cubeuri = req.query.cubeselect;
	var target = req.query.target;

	sess.cubes.forEach(function(cube){
		cube.selected = (cube.uri == cubeuri);
	});

	var selectedcube = sess.cubes.filter(function(c){
        return c.selected;});  
	var dataset = selectedcube[0].dataset;
	var schemagraph = selectedcube[0].schemagraph;
	var instancegraph = selectedcube[0].instancegraph; 
	var qb4olapversion = selectedcube[0].qb4olapversion; 
	
	////console.log("CUBE:" +util.inspect(selectedcube[0], { showHidden: false, depth: null, colors:true }));

	sess=req.session;
	sess.state.cube = cubeuri;
	sess.state.dataset = dataset;
	sess.state.schemagraph = schemagraph;
	sess.state.instancegraph = instancegraph;
	sess.state.qb4olapversion = qb4olapversion;
	sess.queries = getSampleQueries(cubeuri);
	var actualendpoint = sess.state.endpoint;

	var completecubes = sess.state.completecubes;

	function contains(array,obj) {
    	return (array.indexOf(obj) != -1);
	}

	//if is in the session, use it
	if (completecubes && completecubes[actualendpoint] && completecubes[actualendpoint][cubeuri] && !reloadCompleteStoredCubes(completecubes[actualendpoint][cubeuri].timestamp) ){  
		////console.log("GET COMPLETE CUBE: getting from session");
		var thisCube = sess.state.completecubes[actualendpoint][cubeuri];
		sess.schema = thisCube.schema;
		sess.instances = thisCube.instances;
		if (target == 'queries'){
			res.render('queries', {layout:'queries', queriesaccordion:true});
		}else{
			res.render(target,{ layout: target });
		}
	//if is not in the session but is in the stored file and is still fresh, use it	
	}else if(storedcompletecubes[actualendpoint] && storedcompletecubes[actualendpoint][cubeuri] &&!reloadCompleteStoredCubes(storedcompletecubes[actualendpoint][cubeuri].timestamp)){
		////console.log("GET COMPLETE CUBE: getting from file cache");
		sess.state.completecubes= storedcompletecubes[actualendpoint];
		var thisCube = sess.state.completecubes[cubeuri];
		sess.schema = thisCube.schema;
		sess.instances = thisCube.instances;
		if (target == 'queries'){
			res.render('queries', {layout:'queries', queriesaccordion:true});
		}else{
			res.render(target,{ layout:target });
		}
	//else, go to the SPARQL backend	
	}else if(sess.state.endpoint && sess.state.cube){
		    ////console.log("GET COMPLETE CUBE: going to backend");
	    	backend.getCubeSchema(sess.state.endpoint, sess.state.cube,sess.state.qb4olapversion,sess.state.dataset,sess.state.schemagraph, function (err, cubeschema) {
			cubeschema.instancegraph = instancegraph;
			cubeschema.schemagraph = schemagraph;
	    	//set the schema

	   		sess.schema = cubeschema;
	   		//set the queries
	   		
	   		if(cubeuri != 'http://www.fing.edu.uy/inco/cubes/schemas/ssb_qb4olap#dsd'){
		   		////console.log("SCHEMA:" +util.inspect(cubeschema, { showHidden: false, depth: null, colors:true }));
		   		////console.log("version en ppal "+sess.state.qb4olapversion);
		   		backend.getCubeInstances(sess.state.endpoint, sess.state.cube,sess.state.schemagraph,sess.state.instancegraph,sess.state.qb4olapversion, 
		   			function (err, cubeinstances) {
		   			//set the instances
		   			sess.instances = cubeinstances;
		   			var toSession = {timestamp:Date.now(),schema:sess.schema,instances:cubeinstances};
		   			if (!completecubes){
		   				completecubes = {};	
		   			}
		   			if (!completecubes[actualendpoint]){
		   				completecubes[actualendpoint] ={};
		   			}
		   			completecubes[actualendpoint][cubeuri]= toSession;
		   			sess.state.completecubes= completecubes; 
		   			storeCompleteCubes(completecubes,Date.now(),actualendpoint,cubeuri,toSession);
		   			if (target == 'queries'){
		   				res.render('queries', {layout:'queries',queriesaccordion:true});
		   			}else{
		   				res.render(target,{ layout: target });
		   			}
					});
		   		
			}else{
				   var instances = {
            		nodes:[],
            		links:[]	
        			};
				    //set the instances
		   			sess.instances = instances;
		   			var toSession = {schema:sess.schema,instances:{}};
		   			if (!completecubes){
		   				completecubes = {};	
		   			}
		   			if (!completecubes[actualendpoint]){
		   				completecubes[actualendpoint] ={};
		   			}
		   			completecubes[actualendpoint][cubeuri]= toSession;
		   			sess.state.completecubes= completecubes; 
		   			storeCompleteCubes(completecubes,Date.now(),actualendpoint,cubeuri,toSession);
		   			if (target == 'queries'){
		   				res.render('queries', {layout:'queries', queriesaccordion:true});
		   			}else{
		   				res.render(target,{ layout: target });
		   			}

			}
			});
		}	
	});

app.get('/simplifyquery', function(req, res) {

	var querytext = req.query.querypanel;
	var query = req.query.parsedquery;
	
	sess=req.session;
	if(sess.schema){
		sess.querytext = querytext.replace(/^\s\s*/, '');
		sess.originalquery = query;
		////console.log("original query:" +util.inspect(query, { showHidden: false, depth: null, colors:true }));
		operators.getSimplifiedQuery(sess.state.endpoint, sess.schema, query, function (err, simplified) {
			sess.simplequery = simplified;
			res.render('queries', {layout:'queries', editoraccordion:true});
		});
	} else{
		res.render('queries', {layout:'queries'});
	}
});

app.get('/getsparqlquery', function(req, res) {
	sess=req.session;
	if(sess.schema && sess.simplequery){
		operators.getSparqlQuery(sess.state.endpoint, sess.schema, sess.simplequery, function (err,spquery) {
			sess.sparqlcols = spquery.columns;
			////console.log("QUERY COLS FROM GETSPQUERY:" +util.inspect(spquery.columns, { showHidden: false, depth: null, colors:true }));
			sess.sparqlquery = spquery.sparqlquery;
			res.render('queries', {layout:'queries', sparqlaccordion:true});
		});

	}else{
		res.render('queries', {layout:'queries'});
	}
});

app.get('/getbettersparqlquery', function(req, res) {
	sess=req.session;
	if(sess.schema && sess.simplequery){
		operators.getBetterSparqlQuery(sess.state.endpoint, sess.schema, sess.simplequery, function (err,spquery) {
			sess.sparqlcols = spquery.columns;
			////console.log("QUERY COLS FROM GETSPQUERY:" +util.inspect(spquery.columns, { showHidden: false, depth: null, colors:true }));
			sess.sparqlquery = spquery.sparqlquery;
			res.render('queries', {layout:'queries', sparqlaccordion:true});
		});

	}else{
		res.render('queries', {layout:'queries'});
	}
});


app.get('/runsparql', function(req, res) {
	sess=req.session;
	var sparqlquery = req.query.sparqlquery;
	
	////console.log("QUERY: "+sparqlquery);
	////console.log(sess.state.endpoint);

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
			res.render('queries', {layout:'queries', resultsaccordion:true});
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

// checks if the cube list stored in the file-cache for a certain endpoint needs tobe updated
function reloadStoredCubes(timestamp){
    //computes the age in milliseconds
	var age = Math.abs(Date.now() - timestamp);
	////console.log("AGE:"+age);
	return (age>cubetimeout);
}

// checks if the cube instances stored in the file-cache for a certain endpoint needs tobe updated
function reloadCompleteStoredCubes(timestamp){
    
	var age = Math.abs(Date.now() - timestamp);
	////console.log("AGE:"+age);
	return (age>cubetimeout);
}

//stores or updates complete cubes (schema and instances) associated to an endpoint in the file-cache
function storeCompleteCubes(completecubes,timestamp,endpoint,cubeuri,update){

	completecubes[endpoint][cubeuri] = update;

	fs.writeFile(completeCubesFile, JSON.stringify(completecubes, null, 2), function(err) {
	    if(err) {
	      ////console.log(err);
	    } else {
	      ////console.log("JSON saved to " + completeCubesFile);
	    }
	}); 
}

//stores or updates cube list associated to an endpoint in the file-cache
function storeCubes(storedcubes,timestamp,endpoint,cubelist){
	storedcubes[endpoint] ={
		timestamp:timestamp,
		cubes:cubelist
	}

	fs.writeFile(cubesFile, JSON.stringify(storedcubes, null, 2), function(err) {
	    if(err) {
	      ////console.log(err);
	    } else {
	      ////console.log("JSON saved to " + cubesFile);
	    }
	}); 
}

//removes all stored complete cubes for a certain endpoint
function removeCompleteCubesFromFile(completecubes,endpoint){
	if (completecubes[endpoint]){
		completecubes[endpoint]={};

		fs.writeFile(completeCubesFile, JSON.stringify(completecubes, null, 2), function(err) {
		    if(err) {
		      ////console.log(err);
		    } else {
		      ////console.log("JSON saved to " + completeCubesFile);
		    }
		}); 	
	}
}

//removes all stored complete cubes for a certain endpoint
function removeCompleteCubesFromSession(completecubes,endpoint){
	if (completecubes[endpoint]){
		completecubes[endpoint]={};	
	}
	return completecubes;
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
