//qb4olap.js

var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var credentials = require('./credentials.js');
var backend = require('./models/sparql-backend.js');
var operators = require('./models/qb4olap-operators.js');

var util = require('util');
var oursecret = 'qb4olapfing';
var expressHandlebars  = require('express-handlebars');
var Handlebars = require('handlebars');


var Datacube = require('./models/Datacube');
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
			var out = "<li><a class=\"collapsed\" data-toggle=\"collapse\" data-target=\"#"+danchor+"\" aria-expanded=\"false\" href=\"javascript:;\">";                  
			out += "<i class=\"fa fa-fw fa-sitemap\"></i>";
			out += options.fn(dimension);
			out +="<i class=\"fa fa-fw fa-caret-down\"></i></a>";
			out += "<ul id=\""+danchor+"\" class=\"collapse\" style=\"height: 0px;\" aria-expanded=\"false\">";
			dimension.levels.forEach( function(level) {
				out += "<li>";
				out += options.fn(level);
				out += "</li>";
			});
			out += "</ul></li>";
			//console.log(util.inspect(out, { showHidden: false, depth: null, colors:true }));	
			return out;
		};
		var dims = "<ul style=\"list-style: none; padding-left: 0;\">";
		for (var d = 0; d < dimensions.length; d++) {
		   dims += renderDimension (dimensions[d],d,options);
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

	showQuery: function(query, options) {

		var querytext = "";
		Object.keys(query.prefixes).forEach(function(prefix){
			querytext += "<p> PREFIX "+prefix+": "+query.prefixes[prefix] +"</p>";
		});
		querytext += "<p> QUERY </p>";

		query.query.forEach(function(operation){
			if ( (operation.qloperator=="ROLLUP") || (operation.qloperator=="DRILLDOWN")){
			querytext += "<p>"+operation.statement+"="+operation.qloperator+"("+operation.source+","+operation.dimension+","+operation.level+");</p>";
			}
			if(operation.qloperator=="SLICE"){
				if(operation.condType == "dimension"){
					querytext += "<p>"+operation.statement+"= SLICE("+operation.source+",D("+operation.dimension+"));</p>";
				}else{
					querytext += "<p>"+operation.statement+"= SLICE("+operation.source+",M("+operation.measure+"));</p>";
				}
			}
			if(operation.qloperator=="DICE"){
				// TODO aux function that turns the condition tree into a string
				querytext += "<p>"+operation.statement+"= DICE("+operation.source+","+operation.dicecondition.operator+");</p>";
			}


		});

		//console.log("simple to text"+querytext);
		return new Handlebars.SafeString(querytext);
		//return new Handlebars.SafeString(JSON.stringify(query));
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
	res.locals.showTests = app.get('env') !== 'production' && req.query.test === '1';
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
	/*
	sess=req.session;
	var state = {};
	sess.state = state;
	*/
	req.session.state = {};
	res.render('explorer');
});

app.post('/getcubes', function(req, res) {
	//default endpoint
	var endpoint = "http://www.fing.edu.uy/inco/grupos/csi/sparql";
	if(req.body.endpoint) 
		{endpoint = req.body.endpoint;
	}
	sess=req.session;
	sess.state.endpoint = endpoint;
	
	backend.getCubes(endpoint, function (err, cubelist) {
		if (cubelist)
		{	
			//console.log(util.inspect(cubelist, { showHidden: false, depth: null, colors:true }));
			sess.cubes = cubelist;
			res.render('explorer');
		}
		else
		{	res.render('explorer', {error:err});
		}
	});
});


app.post('/getcubestructure', function(req, res) {
	//pair schema-dataset
	var pair = req.body.cubeselect;
	var cube = pair.split(',')[0];
	var dataset = pair.split(',')[1];
	sess=req.session;
	sess.state.cube = cube;
	sess.state.dataset = dataset;
	if(sess.state.endpoint && sess.state.cube)
    {	backend.getCubeSchema(sess.state.endpoint, sess.state.cube, function (err, datacube) {
   		sess.schema = datacube;
   		sess.queries = getSampleQueries(dataset);
    	res.render('explorer');
	});
	}	
});

app.post('/simplifyquery', function(req, res) {

	var querytext = req.body.querypanel;
	var query = req.body.parsedquery;
	
	sess=req.session;
	if(sess.schema)

    {	
    	console.log("query text: ")
   		console.log(querytext);
   		sess.querytext = querytext;
    	sess.originalquery = query;
    	operators.getSimplifiedQuery(sess.schema, query, function (err, simplified) {
   		sess.simplequery = simplified;
   		console.log("simplified query: ")
   		console.log(util.inspect(simplified, { showHidden: false, depth: null, colors:true }));
    	res.render('explorer');
	});
	} else{
		res.render('explorer');
	}	
});

app.get('/sparql', function(req, res){
	var endpoint = 'http://www.fing.edu.uy/inco/grupos/csi/sparql';
	var query = "SELECT *  WHERE { ?s ?p ?o } LIMIT 2";
	backend.runSparql(endpoint,query, function (err, content) {
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
