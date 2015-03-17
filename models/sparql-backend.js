//sparql-backend.js

var util = require('util');
var SparqlClient = require('sparql-client');

// if set to true uses proxySrv as proxy
var withProxy= false;
var proxySrv = "http://httpproxy.fing.edu.uy:3128";


var Datacube = require('../models/Datacube');
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
exports.runSparql = function(endpoint, query, callback){
    var client;
    if(withProxy){
        //console.log("with proxy. endpoint: "+endpoint);
        client = new SparqlClient(endpoint,{proxy:proxySrv});
    }else{
        client = new SparqlClient(endpoint);
    }
  
    client.query(query).execute(function (error, content) {
        callback(error, content);
    });
};

// pre: endpoint is the URL of a SPARQL endpoint
// post: returns the list of URIs of the datacubes (qb:DataSetStructure) in the endpoint
exports.getCubes = function(endpoint, callback){
    var query = "PREFIX qb: <http://purl.org/linked-data/cube#> \
                select ?dataset ?cubeuri ?cname \
                where {?cubeuri a qb:DataStructureDefinition. \
                       ?dataset qb:structure ?cubeuri. \
                OPTIONAL {?cubeuri rdfs:label ?cname}}";
    return this.runSparql(endpoint, query, function processCubes(error,content){
        var cubelist = [];
        content.results.bindings.forEach(function(row){
            var dataset =  row.dataset.value;
            var cubeuri  = row.cubeuri.value;
            var cubename = row.hasOwnProperty('cname') ? row.cname.value : parseURL(cubeuri).hash;
            cubelist.push({dataset:dataset, uri:cubeuri, name:cubename});
        });
    callback(error, cubelist);    
    });
};

//pre: childlevel and parentlevel are the URIs of levels in the same hierarchy, parentlevelmember is a member of parentlevel
//post: returns the set of childlevel members that can reach parentlevelmember

exports.getChildLevelMembers = function(endpoint,childlevel,parentlevel,parentlevelmember, callback){
    var query = "PREFIX qb4o: <http://purl.org/qb4olap/cubes#> \
                 PREFIX skos: <http://www.w3.org/2004/02/skos/core#> \
                select ?clm \
                where { ?clm qb4o:inLevel <"+childlevel+">. \
                        ?clm skos:broader+ <"+parentlevelmember+">.\
                        <"+parentlevelmember+"> qb4o:inLevel <"+parentlevel+">.}";
    return this.runSparql(endpoint, query, function processChilds(error,content){
        var childlist = [];
        content.results.bindings.forEach(function(row){
            childlist.push({level:childlevel, value:row.clm.value});
        });
    callback(error, childlist);    
    });
};




// pre: endpoint is the URL of a SPARQL endpoint, cubeuri is the URI of a datacube in the endpoint
// post: returns a Datacube and a Cuboid object that represents the structure of the datacube.

exports.getCubeSchema = function(endpoint, cubeuri, callback){
    var query = "prefix qb: <http://purl.org/linked-data/cube#> prefix qb4o: <http://purl.org/qb4olap/cubes#> \
                SELECT ?cname ?d ?dname ?h ?hname ?l1 ?l1name ?l2 ?l2name ?card ?m ?f\
                WHERE { <"+cubeuri+"> qb:component ?c1,?c2. \
                ?c1 qb4o:level ?l.\
                ?c2 qb:measure ?m.\
                ?ih1 a qb4o:LevelInHierarchy; qb4o:levelComponent ?l; qb4o:hierarchyComponent ?h.\
                ?ih2 a qb4o:LevelInHierarchy; qb4o:levelComponent ?l1; qb4o:hierarchyComponent ?h.\
                ?ih3 a qb4o:LevelInHierarchy; qb4o:levelComponent ?l2; qb4o:hierarchyComponent ?h.\
                ?h qb4o:inDimension ?d.\
                ?pl a qb4o:HierarchyStep; qb4o:childLevel ?ih2; qb4o:parentLevel ?ih3.\
                ?pl qb4o:cardinality ?card.\
                OPTIONAL { <"+cubeuri+"> rdfs:label ?cname }\
                OPTIONAL { ?d rdfs:label ?dname }\
                OPTIONAL { ?h rdfs:label ?hname }\
                OPTIONAL { ?l1 rdfs:label ?l1name }\
                OPTIONAL { ?l2 rdfs:label ?l2name }\
                OPTIONAL { ?c2 qb4o:aggregateFunction ?f }\
                }\
                order by ?d ?h" ;

    //console.log(query);
    //return this.runSparql(endpoint, query, callback);            
    return this.runSparql(endpoint, query, function processStructure(error,content){
        // assign values to empty variables
        var cubename = content.results.bindings[0].hasOwnProperty('cname') ? content.results.bindings[0].cname.value : parseURL(cubeuri).hash;             
        var dc = new Datacube(cubename,cubeuri);

        content.results.bindings.forEach(function(row){
            var duri = row.d.value;
            var dname = row.hasOwnProperty('dname') ? row.dname.value : this.parseURL(duri).hash;             
            var huri = row.h.value;
            var hname = row.hasOwnProperty('hname') ? row.hname.value : this.parseURL(huri).hash;             
            var muri = row.m.value;
           
            var a = row.hasOwnProperty('f') ? row.f.value : "http://purl.org/qb4olap/cubes#sum";
            var l1uri = row.l1.value;
            var l1name = row.hasOwnProperty('l1name') ? row.l1name.value : this.parseURL(l1uri).hash;                   
            var l2uri = row.l2.value;
            var l2name = row.hasOwnProperty('l2name') ? row.l2name.value : this.parseURL(l2uri).hash;
            var c = row.hasOwnProperty('card') ? row.card.value : "http://purl.org/qb4olap/cubes#OneToMany";                   
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
                var measure = new Measure(muri, mname,aggfunc);
                dc.addMeasure(measure);
            }          
            //process level info            
            var child = new Level(l1uri, l1name);
            var parent = new Level(l2uri, l2name);
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
                //console.log("voy a crear Dimension: ");
                dimension = new Dimension(duri,dname);
                dc.addDimension(dimension);
                //console.log("creo DIM y la agrego: ");
                //console.log(dc);
            }         
            dimension = dc.getDimension(duri);

            //console.log("dim: ");
            //console.log(dimension);

            //add levels to the dimension
            if (!dimension.existsLevel(child.uri)) {dimension.addLevel(child);}
            if (!dimension.existsLevel(parent.uri)) {dimension.addLevel(parent);}
            
            //if hierarchy does not exist in dimension, create it
            var hierarchy;
            if (!dimension.existsHierarchy(huri)){
                //console.log("voy a crear Jerarquia: ");
                hierarchy = new Hierarchy(huri,hname);
                dimension.addHierarchy(hierarchy);
                //console.log("creo jerarquia y la agrego: ");
                //console.log(dimension);
                //console.log(dc);
            } 
            hierarchy = dimension.getHierarchy(huri);
            //console.log("voy a crear el arco en el lattice: ");
            //add a new edge to the hierarchy lattice
            hierarchy.addEdgeToLattice(child, parent, cardinality);
            //console.log("volvi: ");
        });
    //console.log("DATACUBE en el server: ");
    //console.log(dc);
    callback(error, dc);
    });              
}



function parseURL(url) {

    var parsed = url.split('#');   
    return {
        pre: parsed[0],
        hash: parsed[1]
    };
}

  






