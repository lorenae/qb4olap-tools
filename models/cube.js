var util = require('util');
var SparqlClient = require('sparql-client');

exports.runSparql = function(callback){
    
    //var endpoint = 'http://csi-server01:8890/sparql';
    var endpoint = 'http://www.fing.edu.uy/inco/grupos/csi/sparql';
    //var endpoint =  'http://dbpedia.org/sparql';

    var query = "SELECT *  WHERE { ?s ?p ?o } LIMIT 2";
    var proxySrv = "http://httpproxy.fing.edu.uy:3128";

    //with proxy
    //var client = new SparqlClient(endpoint,{proxy:proxySrv});

    //without proxy
    var client = new SparqlClient(endpoint);

    client.query(query).execute(function (err, content) {
        if (err) return callback(err);
        callback(null, content.results.bindings);
    });
};

exports.getCubes = function(endpoint, callback){
    
    var defendpoint = 'http://www.fing.edu.uy/inco/grupos/csi/sparql';
    //var endpoint =  'http://dbpedia.org/sparql';
    //var endpoint = 'http://csi-server01:8890/sparql';

    var query = "PREFIX qb: <http://purl.org/linked-data/cube#> select ?cube ?label where {?cube a qb:DataStructureDefinition. OPTIONAL {?cube rdfs:label ?label}}";
    //var query = "SELECT *  WHERE { ?s ?p ?o } LIMIT 2";

    var proxySrv = "http://httpproxy.fing.edu.uy:3128";

    if (!endpoint) endpoint=defendpoint;
    console.log("query: "+query);

    //create client with proxy
    //var client = new SparqlClient(endpoint,{proxy:proxySrv});

    //create client without proxy
    var client = new SparqlClient(endpoint);

    client.query(query).execute(function (err, content) {
        if (err) return callback(err);
        callback(null, content.results.bindings);
    });
};

exports.getCubeStructure = function(req, callback){
    console.log("en el server: "+req.body.cubeurl);
        
};

    /*
    var options = {
        host: 'httpproxy.fing.edu.uy',
        // proxy IP
        port: 3128,
        // proxy port
        method: 'GET',
        path: uri,
    };

     
    var req = http.request( options, 
        function (res) {
            res.on('response', 
                function (response) {
                    response.on('data', 
                        function(data) {
                            console.log('received ' + data.length + ' bytes ')
                        });
            //var jsonObject = JSON.parse(data);
            //callback(jsonObject);     
    	      };
            )});


    req.end();

    */







