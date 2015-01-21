//qb4olap.js

var express = require('express');
var bodyParser = require('body-parser');
var fortune = require('./lib/fortune.js');
var credentials = require('./credentials.js');
var cube = require('./models/cube.js');
var util = require('util');

var app = express();


// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
  extended: true
}));

// parse application/json
app.use(bodyParser.json());


// set up handlebars view engine
var handlebars = require('express-handlebars').create({
	defaultLayout:'main',
	helpers: {
	section: function(name, options){
		if(!this._sections) this._sections = {};
		this._sections[name] = options.fn(this);
		return null;
	}
}
});

app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');



app.set('port', process.env.PORT || 3000);
app.use(express.static(__dirname + '/public'));


app.use(require('cors')());
app.use('/api', require('cors')());

app.use(function(req, res, next){
	res.locals.showTests = app.get('env') !== 'production' && req.query.test === '1';
	next();
});

//routes


app.get('/', function(req, res) {
	res.render('home');
});
app.get('/about', function(req, res) {
	res.render('about',{
		fort: fortune.getFortune(),
		pageTestScript: '/qa/tests-about.js'
	});
});

app.get('/query', function(req, res){
	res.render('qlquery');
});

app.get('/explorer', function(req, res){
	res.render('explorer');
});

app.post('/getcubes', function(req, res) {
	var endpoint = req.body.endpoint;
	cube.getCubes(endpoint, function (err, content) {
		res.render('explorer', {cubes:content});
	});
});


app.post('/getcubestructure', function(req, res) {
	cube.getCubeStructure(req, function (err, content) {
		res.render('explorer', {structure:content});
	});
});

app.get('/sparql', function(req, res){
	cube.runSparql(function (err, content) {
        //console.log(util.inspect(content, { showHidden: false, depth: null, colors:true }));
        res.render('sparql', {data:content});
	});
});

app.get('/test', function(req,res){
	res.render('jquery-test');
});


app.listen(app.get('port'), function(){
	console.log( 'Express started on http://localhost:' +
		app.get('port') + '; press Ctrl-C to terminate.' );
});



// mocked weather data
function getWeatherData(){
	return {
		locations: [
		{
			name: 'Portland',
			forecastUrl: 'http://www.wunderground.com/US/OR/Portland.html',
			iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
			weather: 'Overcast',
			temp: '54.1 F (12.3 C)',
		},
		{
			name: 'Bend',
			forecastUrl: 'http://www.wunderground.com/US/OR/Bend.html',
			iconUrl: 'http://icons-ak.wxug.com/i/c/k/partlycloudy.gif',
			weather: 'Partly Cloudy',
			temp: '55.0 F (12.8 C)',
		},
		{
			name: 'Manzanita',
			forecastUrl: 'http://www.wunderground.com/US/OR/Manzanita.html',
			iconUrl: 'http://icons-ak.wxug.com/i/c/k/rain.gif',
			weather: 'Light Rain',
			temp: '55.0 F (12.8 C)',
		},
		],
	};
}

// middleware to add weather data to context
app.use(function(req, res, next){
	if(!res.locals.partials) res.locals.partials = {};
	res.locals.partials.weather = getWeatherData();
	next();
});


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
