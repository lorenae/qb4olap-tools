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
                select ?schemagraph ?cubeuri ?cname  ?dataset \
                where {GRAPH ?schemagraph { \
                        ?cubeuri a qb:DataStructureDefinition.\
                        ?dataset qb:structure ?cubeuri. \
                        OPTIONAL {?cubeuri rdfs:label ?cname}}}";
       
    return this.runSparql(endpoint, query, 0,function processCubes(error,content){
        var cubelist = [];
        content.results.bindings.forEach(function(row){
            var schemagraph = row.schemagraph.value;
            var dataset =  row.dataset.value;
            var cubeuri  = row.cubeuri.value;
            var cubename = row.hasOwnProperty('cname') ? row.cname.value : parseURL(cubeuri).hash;
            cubelist.push({schemagraph:schemagraph,dataset:dataset, uri:cubeuri, name:cubename, selected:false});
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
    return this.runSparql(endpoint, query, 0,function processChilds(error,content){
        var childlist = [];
        content.results.bindings.forEach(function(row){
            childlist.push({level:childlevel, value:row.clm.value});
        });
    callback(error, childlist);    
    });
};




// pre: endpoint is the URL of a SPARQL endpoint, cubeuri is the URI of a datacube in the endpoint, schemagraph is the named graph where the schema is stored
// post: returns a Datacube and a Cuboid object that represents the structure of the datacube.

exports.getCubeSchema = function(endpoint, cubeuri, dataset, schemagraph, callback){
    var query = "prefix qb: <http://purl.org/linked-data/cube#> prefix qb4o: <http://purl.org/qb4olap/cubes#> \
                SELECT ?cname ?d ?dname ?h ?hname ?l1 ?l1name ?l2 ?l2name ?card ?m ?f\
                FROM <"+schemagraph+"> \
                WHERE { <"+cubeuri+"> qb:component ?c1,?c2. \
                ?c1 qb4o:level ?l.\
                ?c2 qb:measure ?m. \
                ?h qb4o:hasLevel ?l. \
                ?h qb4o:inDimension ?d. \
                ?ih1 a qb4o:HierarchyStep;qb4o:inHierarchy ?h.\
                ?ih1 a qb4o:HierarchyStep; qb4o:childLevel ?l1; qb4o:parentLevel ?l2 ; qb4o:pcCardinality ?card.\
                OPTIONAL { <"+cubeuri+"> rdfs:label ?cname }\
                OPTIONAL { ?d rdfs:label ?dname }\
                OPTIONAL { ?h rdfs:label ?hname }\
                OPTIONAL { ?l1 rdfs:label ?l1name }\
                OPTIONAL { ?l2 rdfs:label ?l2name }\
                OPTIONAL { ?c2 qb4o:aggregateFunction ?f }\
                }\
                order by ?d ?h";
    
    return this.runSparql(endpoint, query, 0, function processStructure(error,content){
        // assign values to empty variables
        var cubename = content.results.bindings[0].hasOwnProperty('cname') ? content.results.bindings[0].cname.value : parseURL(cubeuri).hash;             
        var dc = new Datacube(cubename,cubeuri,dataset);

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
                dimension = new Dimension(duri,dname,[],[]);
                dc.addDimension(dimension);
            }         
            dimension = dc.getDimension(duri);
            //add levels to the dimension
            if (!dimension.existsLevel(child.uri)) {dimension.addLevel(child);}
            if (!dimension.existsLevel(parent.uri)) {dimension.addLevel(parent);}
            //if hierarchy does not exist in dimension, create it
            var hierarchy;
            if (!dimension.existsHierarchy(huri)){
                hierarchy = new Hierarchy(huri,hname,[]);
                dimension.addHierarchy(hierarchy);
            } 
            hierarchy = dimension.getHierarchy(huri);
            //add a new edge to the hierarchy lattice
            hierarchy.addEdgeToLattice(child, parent, cardinality);
        });

    callback(error, dc);
    });              
}


// pre: endpoint is the URL of a SPARQL endpoint, cubeuri is the URI of a datacube in the endpoint,schemagraph is the named graph where the schema is stored
// post: returns a Datacube and a Cuboid object that represents the structure of the datacube.

exports.getCubeInstances = function(endpoint, cubeuri, schemagraph, callback){
    var query = "prefix qb: <http://purl.org/linked-data/cube#> prefix qb4o: <http://purl.org/qb4olap/cubes#> \
                SELECT ?d ?dname ?h ?hname ?l1 ?l1name ?l2 ?l2name ?lm1 ?lm1name ?lm2 ?lm2name \
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
                        ?ih1 a qb4o:HierarchyStep;qb4o:inHierarchy ?h.\
                        ?ih1 a qb4o:HierarchyStep; qb4o:childLevel ?l1; qb4o:parentLevel ?l2. \
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
                FILTER(lang(?lm1name) = \"en\")\
                FILTER(lang(?lm2name) = \"en\")\
                }\
                order by ?d ?h";
    
    return this.runSparql(endpoint, query, 0,function processInstances(error,content){
                          
        var instances = {
            nodes:[],
            links:[]
        };

        //aux structure to map URIs into integer IDs
        var nodesMap= [], memberCount = 0;

        content.results.bindings.forEach(function(row){
            var duri = row.d.value;
            var dname = row.hasOwnProperty('dname') ? row.dname.value : this.parseURL(duri).hash;             
            var huri = row.h.value;
            var hname = row.hasOwnProperty('hname') ? row.hname.value : this.parseURL(huri).hash;             
            var l1uri = row.l1.value;
            var l1name = row.hasOwnProperty('l1name') ? row.l1name.value : this.parseURL(l1uri).hash;                   
            var l2uri = row.l2.value;
            var l2name = row.hasOwnProperty('l2name') ? row.l2name.value : this.parseURL(l2uri).hash;
            var lm1uri = row.lm1.value;
            var lm1name = row.hasOwnProperty('lm1name') ? row.lm1name.value : this.parseURL(lm1uri).hash;                   
            var lm2uri = row.lm2.value;
            var lm2name = row.hasOwnProperty('lm2name') ? row.lm2name.value : this.parseURL(lm2uri).hash;


            var childmap = nodesMap.filter(function(map) {
                return (map.member == lm1uri && map.level == l1uri && map.hierarchy == huri);
                //return (map.member == lm1uri && map.level == l1uri );
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
        });

    //console.log("INSTANCES en el server: ");
    //console.log(instances);
    callback(error, instances);
    });              
}




function parseURL(url) {

    var parsed = url.split('#');   
    return {
        pre: parsed[0],
        hash: parsed[1]
    };
}

  






