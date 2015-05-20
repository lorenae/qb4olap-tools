//qb4olap-operators.js

var util = require('util');
var backend = require('../models/sparql-backend.js');


var Datacube = require('../models/Datacube');
var Dimension = require('../models/Dimension');
var Hierarchy = require('../models/Hierarchy');
var Level = require('../models/Level');
var Measure = require('../models/Measure');

var SPARQLquery = require('../models/SPARQLquery');


//pre: datacube is the cube structure, query is a QL query
//post: returns a simplified version of the query
exports.getSimplifiedQuery = function(endpoint, datacube, query, callback){

    var simplequery = new Object();    
    //classify query into IPO, IPO SLICE, IPO DICE, IPO SLICE DICE
    var inputquery = JSON.parse(query);
    
    simplequery.prefixes = inputquery.prefixes;
    simplequery.query = [];
    var source = inputquery.query[0].source;

    //apply simplification rules in each case
    var queryType = getQueryType(inputquery);
    simplequery.type = queryType;
    

    switch(queryType){
                //IPO only
                case 1: 
                    var stcount = 1;
                    datacube.dimensions.forEach(function(dim){
                        // group operations by dimension, preserving order
                        var ipodim = inputquery.query.filter(function(operation){
                            return operation.dimension == dim.uri;
                        });
                        if (ipodim.length>0){
                            // consider the level reached by the last operation for each dimension (target level)
                            var bottomLevel = dim.levels[dim.levels.length-1];
                            var targetLevel = ipodim[ipodim.length-1].level;
                            // if target level is different than the bottom level for that dimension, 
                            // rewrite the sequence of IPOs as a ROLLUP from bottom up to target level
                            // else, remove all the IPOs for that dimension
                            if( targetLevel != bottomLevel){
                                var newIPO = new Object();
                                newIPO.statement = "$C"+stcount++;
                                newIPO.qloperator = "ROLLUP";
                                newIPO.dimension = dim.uri;
                                newIPO.bottomLevel = bottomLevel;
                                newIPO.targetLevel = targetLevel;
                                newIPO.level = targetLevel;
                                if(simplequery.query.length==0){
                                    newIPO.source = source;
                                }else{
                                    newIPO.source = simplequery.query[simplequery.query.length-1].statement;
                                }
                                simplequery.query.push(newIPO);
                            }                           
                        }
                    });
                    break;
                //IPO & SLICE    
                case 2: 
                    var stcount = 1;
                    //first push SLICE operations over measures.
                    var slicemeas = inputquery.query.filter(function(operation){
                        return ((operation.qloperator == "SLICE") && (operation.condType == "measure"));
                    });                        
                    slicemeas.forEach(function(slice){
                        slice.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                                slice.source = source;
                            }else{
                                slice.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(slice);
                    }); 
                    datacube.dimensions.forEach(function(dim){
                        var slicedim = inputquery.query.filter(function(operation){
                            return ((operation.qloperator == "SLICE") && (operation.dimension == dim.uri));
                        });
                        // if exists a slice over a dimension, only keep the slice
                        if (slicedim.length>0){
                            var newSLICE = new Object();
                                newSLICE.statement = "$C"+stcount++;
                                newSLICE.qloperator = "SLICE";
                                newSLICE.condType = "dimension";
                                newSLICE.dimension = dim.uri;
                                if(simplequery.query.length==0){
                                    newSLICE.source = source;
                                }else{
                                    newSLICE.source = simplequery.query[simplequery.query.length-1].statement;
                                }
                                simplequery.query.push(newSLICE);
                        }else{
                            // group IPO operations by dimension, preserving order
                            var ipodim = inputquery.query.filter(function(operation){
                            return (((operation.qloperator == "ROLLUP")||(operation.qloperator == "DRILLDOWN")) && (operation.dimension == dim.uri));
                            });
                            // if exists IPO operations for a dimension and there is no slice over it
                            if (ipodim.length>0){
                                // consider the level reached by the last operation for each dimension (target level)
                                var bottomLevel = dim.levels[dim.levels.length-1];
                                var targetLevel = ipodim[ipodim.length-1].level;
                                // if target level is different than the bottom level for that dimension, 
                                // rewrite the sequence of IPOs as a ROLLUP from bottom up to target level
                                // else, remove all the IPOs for that dimension
                                if( targetLevel != bottomLevel){
                                    var newIPO = new Object();
                                    newIPO.statement = "$C"+stcount++;
                                    newIPO.qloperator = "ROLLUP";
                                    newIPO.dimension = dim.uri;
                                    newIPO.level = targetLevel;
                                    if(simplequery.query.length==0){
                                        newIPO.source = source;
                                    }else{
                                        newIPO.source = simplequery.query[simplequery.query.length-1].statement;
                                    }
                                    simplequery.query.push(newIPO);
                                }                           
                            }
                        }
                    }); 
                    break;
                //IPO & DICE    
                case 3: 
                    simplequery = inputquery; 
                    break;  
                //IPO & SLICE & DICE                                              
                case 4: simplequery = inputquery; 
                    break;
                default: simplequery = inputquery;                                                 
            }
            
    callback('', simplequery);    
};




//pre: datacube is the cube structure, query is a simplified QL query
//post: returns a SPARQL query equivalent to QL query
exports.getSparqlQuery = function(endpoint, datacube, simplequery, callback){
        
    var sparqlquery = '';
    var stubquery = "SELECT *  WHERE { ?s ?p ?o } LIMIT 2";

    switch(simplequery.type){
        //IPO only
        case 1:
        sparqlquery = getIPOSparqlQuery(endpoint, datacube, simplequery);
        //sparqlquery = stubquery;
        break;
        //IPO + SLICE
        case 2: sparqlquery = stubquery;
        break;
        default: sparqlquery = stubquery;
    }
    callback('', sparqlquery);
};

//pre: datacube is the cube structure, simplequery is a simplified QL query
//post: returns a SPARQL query that implements a QL query only composed by IPO operations
function getIPOSparqlQuery(endpoint, datacube, simplequery){
    
    var sparqlIPO =  new SPARQLquery([],"select",[],[],[],[],'');
    var sparqlStr;

   //the seeds for variable generation and the counters
    var levelMemSeed = "lm";
    var levelMemCounter = 1;

    var parentLevelMemSeed = "plm";
    var parentLevelMemCounter = 1;

    var measureSeed = "m";
    var measureCounter = 1;
    var agSeed = "ag";
    var agCounter = 1;

    sparqlIPO.addPrefix("qb","http://purl.org/linked-data/cube#");
    sparqlIPO.addPrefix("qb4o","http://purl.org/qb4olap/cubes#");
    sparqlIPO.addPrefix("skos","http://www.w3.org/2004/02/skos/core#");

    sparqlIPO.addPattern("?o","a","qb:Observation");
    sparqlIPO.addPattern("?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));

    //PROCESS MEASURES
    datacube.measures.forEach(function(m){
        var mi = sparqlIPO.getNewVariable(measureSeed, measureCounter);
        measureCounter++;
        var agi = sparqlIPO.getNewVariable(agSeed, agCounter);
        agCounter++;
        //link observations with measure values
        sparqlIPO.addPattern("?o",escapeAbsoluteIRI(m.uri),mi);
        //add the aggregation function to the result
        sparqlIPO.addExpresionToResult("("+m.aggfunc+"("+mi+" as "+agi+"))");
    });


    //PROCESS DIMENSIONS
    datacube.dimensions.forEach(function(d){
        var dim = new Dimension(d.uri, d.name, d.levels, d.hierarchies);
        
        var lmi = sparqlIPO.getNewVariable(levelMemSeed, levelMemCounter);
        levelMemCounter++;
        //get the bottom level in the dimension
        var dimBottomLevel = dim.getBottomLevel().uri;
        //link observations with values at the bottomLevel
        sparqlIPO.addPattern("?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
        sparqlIPO.addPattern(lmi,"qb4o:memberOf",escapeAbsoluteIRI(dimBottomLevel));
        //if exists, get the only ROLLUP on that dimension
        var r = simplequery.query.filter(function(oper){
            return oper.dimension == dim.uri;
        });

        //exists a rollup on this dimension
        if (r.length>0){
            var rollup = r[0];
            var targetLevel = rollup.targetLevel;
            var bottomLevel = rollup.bottomLevel.uri;
            //find the shortest between this 2 levels
            var levelPath = dim.getShortestPath(bottomLevel, targetLevel);
            levelPath.path.forEach(function(actual){
                var actualLevel = actual.level;
                var plmi = sparqlIPO.getNewVariable(parentLevelMemSeed, parentLevelMemCounter);
                if(actualLevel != bottomLevel){
                    parentLevelMemCounter++;
                    sparqlIPO.addPattern(lmi,"skos:broader",plmi);
                    sparqlIPO.addPattern(plmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                    lmi = plmi;
                }
                if(actualLevel == targetLevel){
                    sparqlIPO.addVariableToResult(plmi);
                    sparqlIPO.addVariableToGroupBy(plmi);
                }
            });
        //doesnt exist a rollup on this dimension    
        }else{
            sparqlIPO.addVariableToResult(lmi);
            sparqlIPO.addVariableToGroupBy(lmi);
        }
    });//end processing dimensions
    sparqlStr = sparqlIPO.toString();
    console.log("QUERY in qb4olap-operators: "+sparqlStr);

    return sparqlStr;
}


function escapeAbsoluteIRI(iri){
    return "<"+iri+">";
}


//returns true if the dice condition has a condition over a measure, false if not.
function existsConditionOverMeasure(dicecondition) {
  
    var result= false;
        console.log("dicecondition en existsConditionOverMeasure");
        console.log(util.inspect(dicecondition, { showHidden: false, depth: null, colors:true }));

    if (dicecondition.nodetype == "internal"){
        var recCall = dicecondition.args.map(existsConditionOverMeasure);
        //console.log("dice checks array: "+recCall);
        result = recCall.reduce(function(a, b) {
        return a || b;
        });
    }
    if (dicecondition.nodetype == "leaf"){
        result = dicecondition.args.filter(function(arg){
            return arg.condType =='measure';}
        ).length > 0;
    };

    return result;
}


//Receives a dice condition and returns two lists of DICE operations. One that contains operations exclusively
//on level and the other that refers to measures

function splitDiceAnd(dicecondition, originalstatement, dicemeasurelist, dicelevellist) {

    var newDICE = new Object();
        newDICE.qloperator = "DICE";    
        newDICE.statement = originalstatement;
        newDICE.source = "";

 
    if (dicecondition.operator=='AND'){     
        newDICE.dicecondition = dicecondition.args[0];
        splitDiceAnd(dicecondition.args[1], originalstatement, dicemeasurelist, dicelevellist);
    }
    else{
        newDICE.dicecondition = dicecondition;
    }

    if(existsConditionOverMeasure(newDICE.dicecondition)){
        dicemeasurelist.unshift(newDICE);}
    else{ 
        dicelevellist.unshift(newDICE);}
}


//returns true if the dice operation has a condition over level level, false if not
function refersToLevel(dicecondition, level) {

    var operators = ['AND','OR'];
    var result;

    if (operators.indexOf(dicecondition.operator) > -1){
        var recCall = dicecondition.args.map(function(aux) {
            return refersToLevel(aux,level);
        });
        //console.log("dicecondition checks array: "+recCall);
        result = recCall.reduce(function(a, b) {
            return a || b;
        });
    }
    else {
//        console.log("en el ELSE de refersToLevel: ");
//        console.log(util.inspect(dicecondition.args, { showHidden: false, depth: null, colors:true }));
        result = dicecondition.args.filter(function(arg){
            return ((Object.keys(arg).indexOf('level') >-1) && (arg['level'] == level))
        }).length > 0;
    };
    return result;
}



function parseURL(url) {

    var parsed = url.split('#');   
    return {
        pre: parsed[0],
        hash: parsed[1]
    };
}


//classify query into IPO, IPO SLICE, IPO DICE, IPO SLICE DICE
function getQueryType(inputquery){

    var ipo = false;
    var slice = false;
    var dice = false;

    inputquery.query.forEach(function(row){
        if ((row.qloperator == "ROLLUP")||(row.qloperator == "DRILLDOWN")) ipo= true;
        if (row.qloperator == "SLICE") slice=true;
        if (row.qloperator == "DICE") dice=true;
    });

    if (ipo && !slice && !dice) return 1;
    if (ipo && slice && !dice) return 2;
    if (ipo && !slice && dice) return 3;
    if (ipo && slice && dice) return 4;
    if (!ipo) return 0;
    
}

  






