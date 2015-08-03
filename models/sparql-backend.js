//sparql-backend.js

var util = require('util');
var SparqlClient = require('sparql-client');

// if set to true uses proxySrv as proxy
var withProxy= true;
var proxySrv = "http://httpproxy.fing.edu.uy:3128";


var Datacube = require('../models/Datacube');
var Attribute = require('../models/Attribute');
var Dimension = require('../models/Dimension');
var Hierarchy = require('../models/Hierarchy');
var Level = require('../models/Level');
var Measure = require('../models/Measure');


//cardinality constants.
//cardinality constants.
var ONE_TO_MANY = "1 to N";
var MANY_TO_MANY = "N to N";
var MANY_TO_ONE = "N to 1";
var ONE_TO_ONE = "1 to 1";

//aggregation functions.
var SUM ="SUM";
var MIN ="MIN";
var MAX ="MAX";
var AVG ="AVG";



//functions

// wrapper to sparql-client execute method.
// pre: query is a SPARQL query, endpoint is the URL of a SPARQL endpoint
// post: returns JSON as provided by method execute in sparql-client module
exports.runSparql = function(endpoint, query, timeout, callback){
    var client;
    if(withProxy){
        //console.log("with proxy. endpoint: "+endpoint);
        client = new SparqlClient(endpoint,{proxy:proxySrv, timeout:timeout});
    }else{
        client = new SparqlClient(endpoint,{timeout:timeout});
    }
  
    client.query(query).execute(function (error, content) {
        callback(error, content);
    });
};

// pre: endpoint is the URL of a SPARQL endpoint
// post: returns the list of URIs of the datacubes (qb:DataSetStructure) in the endpoint
exports.getCubes = function(endpoint, callback){
    var query = "PREFIX qb: <http://purl.org/linked-data/cube#> \
        PREFIX dct:      <http://purl.org/dc/terms/>\
        select ?schemagraph ?cubeuri ?cname ?dataset ?instancegraph ?numobs \
        where {\
            GRAPH ?schemagraph { \
                ?cubeuri a qb:DataStructureDefinition.\
                ?dataset qb:structure ?cubeuri. \
                OPTIONAL {?dataset dct:title ?cname}} .\
                {   SELECT distinct ?instancegraph ?dataset (count(?o) AS ?numobs)\
                    WHERE { \
                        GRAPH ?instancegraph{ \
                            ?o qb:dataSet ?dataset}\
                }}}";
       
    //console.log(query);
       
    return this.runSparql(endpoint, query, 30000,function processCubes(error,content){
        var cubelist = [];
        if (content){
            content.results.bindings.forEach(function(row){
                var schemagraph = row.schemagraph.value;
                var dataset =  row.dataset.value;
                var cubeuri  = row.cubeuri.value;
                var cubename = row.hasOwnProperty('cname') ? row.cname.value : parseURL(cubeuri).hash;
                var instancegraph = row.instancegraph.value;
                var numobs = row.numobs.value;
                cubelist.push({
                    schemagraph:schemagraph,
                    dataset:dataset, 
                    uri:cubeuri, 
                    name:cubename, 
                    instancegraph:instancegraph, 
                    numobs:numobs,
                    selected:false});
            });
        }
        
    callback(error, cubelist);    
    });
};

// pre: endpoint is the URL of a SPARQL endpoint, cubeuri is the URI of a datacube in the endpoint, schemagraph is the named graph where the schema is stored
// post: returns a Datacube and a Cuboid object that represents the structure of the datacube.

exports.getCubeSchema = function(endpoint, cubeuri, dataset, schemagraph, callback){
       var query = "PREFIX qb: <http://purl.org/linked-data/cube#> \
                PREFIX qb4o: <http://purl.org/qb4olap/cubes#> \
                PREFIX dct: <http://purl.org/dc/terms/>\
                SELECT ?cname ?d ?dname ?h ?hname ?l ?lname ?la ?laname ?larange ?l1 ?l1name ?la1 ?la1name ?la1range ?l2 ?l2name ?rup ?card ?m ?f ?mrange\
                FROM <"+schemagraph+">   WHERE { <"+cubeuri+"> qb:component ?c1,?c2.\
                ?ds qb:structure <"+cubeuri+"> . ?c1 qb4o:level ?l.\
				?c2 qb:measure ?m. ?c2 qb4o:aggregateFunction ?f .\
				OPTIONAL {?m rdfs:range ?mrange }\
				?h qb4o:hasLevel ?l.\
				?h qb4o:inDimension ?d.\
				?ds dct:title ?cname .\
				?d rdfs:label ?dname.\
				?h rdfs:label ?hname .\
				?l rdfs:label ?lname .\
				OPTIONAL {?ih1 a qb4o:HierarchyStep;qb4o:inHierarchy ?h; qb4o:childLevel ?l1; qb4o:parentLevel ?l2 ; qb4o:pcCardinality ?card.} \
				OPTIONAL {?ih1 qb4o:rollup ?rup}\
				OPTIONAL {?l qb4o:hasAttribute ?la. ?la rdfs:label ?laname. ?la rdfs:range ?larange}\
                OPTIONAL {?l1 qb4o:hasAttribute ?la1. ?la1 rdfs:label ?la1name. ?la1 rdfs:range ?la1range}\
                OPTIONAL { ?l1 rdfs:label ?l1name }\
                OPTIONAL { ?l2 rdfs:label ?l2name }\
                }";
    //console.log("schema query: "+ query);
    
    return this.runSparql(endpoint, query, 0, function processStructure(error,content){
        // assign values to empty variables
        var cubename = content.results.bindings[0].hasOwnProperty('cname') ? content.results.bindings[0].cname.value : parseURL(cubeuri).hash;             
        var dc = new Datacube(cubename,cubeuri,dataset);

        content.results.bindings.forEach(function(row){
            var duri = row.d.value;
            var dname = row.hasOwnProperty('dname') ? row.dname.value : parseURL(duri).hash;             
            var huri = row.h.value;
            var hname = row.hasOwnProperty('hname') ? row.hname.value : parseURL(huri).hash;             
            var muri = row.m.value;
            var measuretype = row.hasOwnProperty('mrange')? row.mrange.value:'';
           
            var a = row.hasOwnProperty('f') ? row.f.value : "http://purl.org/qb4olap/cubes#sum";
            var luri = row.l.value;
            var lname = row.hasOwnProperty('lname') ? row.lname.value : parseURL(luri).hash;
            var lauri = row.hasOwnProperty('la') ? row.la.value : null;
            var laname = row.hasOwnProperty('laname') ? row.laname.value : (lauri != null ? parseURL(lauri).hash : null);  
            var larange = row.hasOwnProperty('larange') ? row.larange.value : null;                                           
            var l1uri = row.hasOwnProperty('l1') ? row.l1.value: null;
            var l1name = row.hasOwnProperty('l1name') ? row.l1name.value : (l1uri != null ? parseURL(l1uri).hash : null);                   
            var l2uri = row.hasOwnProperty('l2') ? row.l2.value: null;
            var l2name = row.hasOwnProperty('l2name') ? row.l2name.value : (l2uri != null ? parseURL(l2uri).hash : null);
            var rup = row.hasOwnProperty('rup') ? row.rup.value : "http://www.w3.org/2004/02/skos/core#broader";
            var la1uri = row.hasOwnProperty('la1') ? row.la1.value: null;
            var la1name = row.hasOwnProperty('la1name') ? row.la1name.value : (la1uri != null ? parseURL(la1uri).hash : null);  
            var la1range = row.hasOwnProperty('la1range') ? row.la1range.value : null;  
            var la2uri = row.hasOwnProperty('la2') ? row.la2.value: null;
            var la2name = row.hasOwnProperty('la2name') ? row.la2name.value : (la2uri != null ? parseURL(la2uri).hash : null);  
            var la2range = row.hasOwnProperty('la2range') ? row.la2range.value : null;       
            var c = row.hasOwnProperty('card') ? row.card.value : "http://purl.org/qb4olap/cubes#ManyToOne";                   
            var aggfunc;
            switch(a){
                case "http://purl.org/qb4olap/cubes#sum": aggfunc= SUM; break;
                case "http://purl.org/qb4olap/cubes#avg": aggfunc= AVG; break;
                case "http://purl.org/qb4olap/cubes#min": aggfunc= MIN; break;                                              
                case "http://purl.org/qb4olap/cubes#max": aggfunc= MAX; break;
                default: aggfunc= SUM;                                                 
            }
            //if measure does not exist create it
            if (!dc.existsMeasure(muri)){
                var mname = parseURL(muri).hash;
                var measure = new Measure(muri, mname,aggfunc,measuretype);
                dc.addMeasure(measure);
            }          

            
            var cardinality;
            switch(c){
                case "http://purl.org/qb4olap/cubes#OneToMany": cardinality= ONE_TO_MANY; break;
                case "http://purl.org/qb4olap/cubes#ManyToMany": cardinality= MANY_TO_MANY; break;
                case "http://purl.org/qb4olap/cubes#ManyToOne": cardinality= MANY_TO_ONE; break;                                                                     
                case "http://purl.org/qb4olap/cubes#OneToOne": cardinality= ONE_TO_ONE; break;
                default: cardinality= ONE_TO_MANY;                                              
            }
            //if dimension does not exist create it
            var dimension;
            if (!dc.existsDimension(duri)){
                dimension = new Dimension(duri,dname,[],[]);
                dc.addDimension(dimension);
            }         
            dimension = dc.getDimension(duri);

             //process level info            
            var child,parent,childuri,childname = null;
            var atr,atrname,atrrange = null;

            if (l1uri != null ) {
                childuri = l1uri;
                childname = l1name;
                atr = la1uri;
                atrname = la1name;
                atrrange = la1range;
            } else{
                childuri = luri;
                childuti = lname;
                atr = lauri;
                atrname = laname;
                atrrange = larange;
            }
            //if hierarchy does not exist in dimension, create it
            var hierarchy;
            if (!dimension.existsHierarchy(huri)){
                hierarchy = new Hierarchy(huri,hname,[]);
                dimension.addHierarchy(hierarchy);
            }
            hierarchy = dimension.getHierarchy(huri);
            hierarchy.addEdgeToLatticeByuri(childuri, l2uri, cardinality,rup);

            

            //add levels to the dimension
            if (!dimension.existsLevel(childuri)) {
                child = new Level(childuri, childname);
                child.addAttribute(new Attribute(atrname, atr, atrrange));
                dimension.addLevel(child);
            }
            child = dimension.getLevel(childuri);
            if (!child.existsAttribute(atr)){
                child.addAttribute(new Attribute(atrname, atr, atrrange));
            }
            

            if (l2uri != null){
                if (!dimension.existsLevel(l2uri)){
                    parent = new Level(l2uri, l2name);
                    //parent.addAttribute(new Attribute(la2name, la2uri, la2range)); 
                    dimension.addLevel(parent);
                }else{
                    //parent = dimension.getLevel(l2uri);
                    //parent.addAttribute(new Attribute(la2name, la2uri, la2range)); 
                }
            }

        });

    callback(error, dc);
    });              
}


// pre: endpoint is the URL of a SPARQL endpoint, cubeuri is the URI of a datacube in the endpoint,schemagraph is the named graph where the schema is stored
// post: returns a Datacube and a Cuboid object that represents the structure of the datacube.

exports.getCubeInstances = function(endpoint, cubeuri, schemagraph, instancegraph, callback){
    var query = "prefix qb: <http://purl.org/linked-data/cube#> prefix qb4o: <http://purl.org/qb4olap/cubes#> \
                SELECT ?d ?dname ?h ?hname ?l1 ?l1name ?l2 ?l2name ?lm1 ?lm1name ?lm2 ?lm2name \
                FROM <"+schemagraph+"> \
                FROM <"+instancegraph+"> \
                WHERE { \
                    ?lm1 qb4o:memberOf ?l1.\
                    ?lm1 skos:broader ?lm2.\
                    ?lm2 qb4o:memberOf ?l2.\
                    {\
                        SELECT ?d ?dname ?h ?hname ?l1 ?l1name ?l2 ?l2name \
                        FROM <"+schemagraph+"> \
                        WHERE { <"+cubeuri+"> qb:component ?c1.\
                        ?c1 qb4o:level ?l.\
                        ?h qb4o:hasLevel ?l.\
                        ?h qb4o:inDimension ?d. \
                        ?ih1 a qb4o:HierarchyStep;qb4o:inHierarchy ?h; qb4o:childLevel ?l1; qb4o:parentLevel ?l2 ; qb4o:pcCardinality ?card.\
                        OPTIONAL { ?d rdfs:label ?dname }\
                        OPTIONAL { ?h rdfs:label ?hname }\
                        OPTIONAL { ?l1 rdfs:label ?l1name }\
                        OPTIONAL { ?l1 skos:prefLabel ?l1name }\
                        OPTIONAL { ?l2 rdfs:label ?l2name }\
                        OPTIONAL { ?l2 skos:prefLabel ?l2name }\
                        }\
                    }\
                OPTIONAL{?lm1 skos:prefLabel ?lm1name}\
                OPTIONAL{?lm2 skos:prefLabel ?lm2name}\
                FILTER(lang(?lm1name) = \"en\" || lang(?lm1name) = \"\")\
                FILTER(lang(?lm2name) = \"en\" || lang(?lm2name) = \"\")\
                }\
                order by ?d ?h";
    
    //console.log(query);
    return this.runSparql(endpoint, query, 0,function processInstances(error,content){
                          
        var instances = {
            nodes:[],
            links:[]
        };

        //aux structure to map URIs into integer IDs
        var nodesMap= [], memberCount = 0;

        content.results.bindings.forEach(function(row){
            var duri = row.d.value;
            var dname = row.hasOwnProperty('dname') ? row.dname.value : parseURL(duri).hash;             
            var huri = row.h.value;
            var hname = row.hasOwnProperty('hname') ? row.hname.value : parseURL(huri).hash;  
            var l1uri = row.l1.value;
            var l1name = row.hasOwnProperty('l1name') ? row.l1name.value : parseURL(l1uri).hash;                   
            var l2uri = row.l2.value;
            var l2name = row.hasOwnProperty('l2name') ? row.l2name.value : parseURL(l2uri).hash;             
            var lm1uri = row.lm1.value;
            var lm1name = row.hasOwnProperty('lm1name') ? row.lm1name.value : parseURL(lm1uri).hash;                   
            var lm2uri = row.lm2.value;
            var lm2name = row.hasOwnProperty('lm2name') ? row.lm2name.value : parseURL(lm2uri).hash;


            
            var childmap = nodesMap.filter(function(map) {
                return (map.member == lm1uri && map.level == l1uri && map.hierarchy == huri);
                });
            
            //if the node does not exist
            if (childmap.length == 0) {
                idchild = memberCount++;
                nodesMap.push({
                    member:lm1uri, 
                    level:l1uri,
                    hierarchy:huri,
                    id:idchild
                });

                var childnode = {
                id:idchild,
                uri:lm1uri,
                name:lm1name, 
                level:l1name, 
                hierarchy:hname,
                dimension:dname
                };
                instances.nodes.push(childnode);

            } else{
                idchild = childmap[0].id;
            }

            if (lm2uri != null){
                var parentmap = nodesMap.filter(function(map) {
                    return (map.member == lm2uri && map.level == l2uri && map.hierarchy == huri);
                    //return (map.member == lm2uri && map.level == l2uri );
                    });

                if (parentmap.length == 0) {
                    idparent = memberCount++;
                    nodesMap.push({
                        member:lm2uri, 
                        level:l2uri,
                        hierarchy:huri,
                        id:idparent
                    });

                    var parentnode = {
                    id:idparent,
                    uri:lm2uri,
                    name:lm2name, 
                    level:l2name, 
                    hierarchy:hname,
                    dimension:dname
                    };

                    instances.nodes.push(parentnode);
                } else{
                    idparent = parentmap[0].id;
                }         
                instances.links.push({
                        source:idchild,
                        target:idparent
                });   
            }
        });

    //console.log("INSTANCES en el server: ");
    //console.log(instances);
    callback(error, instances);
    });              
}

// pre: content is the results of runSparql. An object with properties head and results, and results contains bindings.
// post: returns an array that, for each binding, returns the variable and its value
exports.processResults= function(content){
    var results=[];
    //var length = 0;
    if (content){
        content.results.bindings.forEach(function (row){
            //length ++;
            var newRow ={};
            Object.getOwnPropertyNames(row).forEach(function(prop){
                //console.log("prop"+prop);
                //console.log(util.inspect(row, { showHidden: false, depth: null, colors:true }));
                newRow[prop] = row[prop].value;
            });
            results.push(newRow);
        });    
    }
    //console.log("RESULT size:"+length);
    return results;
}


function parseURL(url) {

    var parsed = url.split('#');   
    return {
        pre: parsed[0],
        hash: parsed[1]
    };
}
