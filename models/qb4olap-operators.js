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
                    var IPOs = [];
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
                                //console.log("DIM:" +util.inspect(dim, { showHidden: false, depth: null, colors:true }));
                                var bottomLevel = dim.levels[dim.levels.length-1];
                                var targetLevel = ipodim[ipodim.length-1].level;
                                //console.log("bottom:" +util.inspect(bottomLevel, { showHidden: false, depth: null, colors:true }));
                                //console.log("target:" +util.inspect(targetLevel, { showHidden: false, depth: null, colors:true }));

                                // if target level is different than the bottom level for that dimension, 
                                // rewrite the sequence of IPOs as a ROLLUP from bottom up to target level
                                // else, remove all the IPOs for that dimension
                                if( targetLevel != bottomLevel){
                                    var newIPO = new Object();                
                                    newIPO.qloperator = "ROLLUP";
                                    newIPO.dimension = dim.uri;
                                    newIPO.bottomLevel = bottomLevel;
                                    newIPO.targetLevel = targetLevel;
                                    newIPO.level = targetLevel;
                                    IPOs.push(newIPO);
                                }                           
                            }
                        }
                    }); 
                    
                    IPOs.forEach(function(ipo){
                        ipo.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                            ipo.source = source;
                        }else{
                            ipo.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(ipo);
                    });
                    
                    break;
                //IPO & SLICE & DICE    
                case 3: 
                    //splitDice
                    var beforedice =[];
                    var afterdice =[];

                    splitDice(inputquery.query, beforedice, afterdice);
                    var stcount = 1;
                    var IPOs = [];
                    //first push SLICE operations over measures.
                    var slicemeas = beforedice.filter(function(operation){
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
                        var slicedim = beforedice.filter(function(operation){
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
                            var ipodim = beforedice.filter(function(operation){
                            return (((operation.qloperator == "ROLLUP")||(operation.qloperator == "DRILLDOWN")) && (operation.dimension == dim.uri));
                            });
                            // if exists IPO operations for a dimension and there is no slice over it
                            if (ipodim.length>0){
                                // consider the level reached by the last operation for each dimension (target level)
                                //console.log("DIM:" +util.inspect(dim, { showHidden: false, depth: null, colors:true }));
                                var bottomLevel = dim.levels[dim.levels.length-1];
                                var targetLevel = ipodim[ipodim.length-1].level;
                                //console.log("bottom:" +util.inspect(bottomLevel, { showHidden: false, depth: null, colors:true }));
                                //console.log("target:" +util.inspect(targetLevel, { showHidden: false, depth: null, colors:true }));

                                // if target level is different than the bottom level for that dimension, 
                                // rewrite the sequence of IPOs as a ROLLUP from bottom up to target level
                                // else, remove all the IPOs for that dimension
                                if( targetLevel != bottomLevel){
                                    var newIPO = new Object();                
                                    newIPO.qloperator = "ROLLUP";
                                    newIPO.dimension = dim.uri;
                                    newIPO.bottomLevel = bottomLevel;
                                    newIPO.targetLevel = targetLevel;
                                    newIPO.level = targetLevel;
                                    IPOs.push(newIPO);
                                }                           
                            }
                        }
                    }); 
                    
                    IPOs.forEach(function(ipo){
                        ipo.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                            ipo.source = source;
                        }else{
                            ipo.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(ipo);
                    });
                    afterdice.forEach(function(dice){
                        if(dice.qloperator == "DICE"){
                            dice.statement = "$C"+stcount++;
                            if(simplequery.query.length==0){
                                dice.source = source;
                            }else{
                                dice.source = simplequery.query[simplequery.query.length-1].statement;
                            }
                            simplequery.query.push(dice);
                        }
                    });                   
                    simplequery.type = queryType; 
                    break;  
                default: simplequery = inputquery;
                    simplequery.type = queryType;                                                 
            }
            
    callback('', simplequery);    
};




//pre: datacube is the cube structure, query is a simplified QL query
//post: returns a SPARQL query equivalent to QL query
exports.getSparqlQuery = function(endpoint, datacube, simplequery, callback){
    
    var variables =[];    
    var sparqlquery = '';
    var query = {sparqlquery:stubquery, variables:variables};

    var stubquery = "SELECT *  WHERE { ?s ?p ?o } LIMIT 2";

    //console.log("QUERY TYPE: "+simplequery.type);
    //console.log("simplequery: "+util.inspect(simplequery, { showHidden: false, depth: null, colors:true }));

    switch(simplequery.type){
        //IPO only
        case 1:
        query = getNoDiceSparqlQuery(endpoint, datacube, simplequery, false);
        //sparqlquery = stubquery;
        break;
        //IPO + SLICE
        case 2:
        query = getNoDiceSparqlQuery(endpoint, datacube, simplequery, false);
        break;
        //ALL
        case 3:
        query = getDiceSparqlQuery(endpoint, datacube, simplequery, false);
        break;
        
        default:
    }
    callback('', query);
};

//pre: datacube is the cube structure, query is a simplified QL query
//post: returns a SPARQL query equivalent to QL query
exports.getBetterSparqlQuery = function(endpoint, datacube, simplequery, callback){
    
    var variables =[];    
    var sparqlquery = '';
    var query = {sparqlquery:stubquery, variables:variables};

    var stubquery = "SELECT *  WHERE { ?s ?p ?o } LIMIT 2";

    switch(simplequery.type){
        //IPO only
        case 1:
        query = getNoDiceSparqlQuery(endpoint, datacube, simplequery, true);
        //sparqlquery = stubquery;
        break;
        //IPO + SLICE
        case 2:
        query = getNoDiceSparqlQuery(endpoint, datacube, simplequery, true);
        break;
        //ALL
        case 3:
        query = getDiceSparqlQuery(endpoint, datacube, simplequery, true);
        break;
        default:
    }
    callback('', query);
};





//pre: datacube is the cube structure, simplequery is a simplified QL query that does not contain DICE ops.
//post: returns a SPARQL query that implements a QL query 
function getNoDiceSparqlQuery(endpoint, datacube, simplequery, optimize){
    
    var sparqlIPO =  new SPARQLquery([],"select",[],[],[],[],'');
    var sparqlStr;
    var meascolumns = [];
    var varcolumns = [];

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

    if (optimize){
        sparqlIPO.addPatternToGroup("o",true,"?o","a","qb:Observation");
        sparqlIPO.addPatternToGroup("o",true,"?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    }else{
        sparqlIPO.addPattern("?o","a","qb:Observation");
        sparqlIPO.addPattern("?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    };

    

    sparqlIPO.addFrom(datacube.instancegraph);                      
    sparqlIPO.addFrom(datacube.schemagraph);

    //PROCESS MEASURES
    
    //TOD if there is a slice do not include measure in the query
    datacube.measures.forEach(function(m){

        //if exists, get the only SLICE on that measure
        var sm = simplequery.query.filter(function(oper){
            return (oper.measure == m.uri && oper.qloperator == "SLICE");
        });
        

        //if doesnt exists a SLICE
        if (sm.length == 0 ){
            var mi = sparqlIPO.getNewVariable(measureSeed, measureCounter);
            measureCounter++;
            var agi = sparqlIPO.getNewVariable(agSeed, agCounter);
            agCounter++;
            //link observations with measure values
            if (optimize){
                sparqlIPO.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(m.uri),mi);
            }else{
                sparqlIPO.addPattern("?o",escapeAbsoluteIRI(m.uri),mi);
            };
            //add the aggregation function to the result
            //also add cast
            var measuretype = m.datatype;
            if (measuretype){
                //virtuoso does not have a cast to positiveInteger, use cast to integer instead
                if (measuretype == "http://www.w3.org/2001/XMLSchema#positiveInteger") measuretype = "http://www.w3.org/2001/XMLSchema#integer";
                sparqlIPO.addExpresionToResult("("+m.aggfunc+"(<"+measuretype+">("+mi+")) as "+agi+")");
            }else{
                sparqlIPO.addExpresionToResult("("+m.aggfunc+"("+mi+") as "+agi+")");
            }
            //associate the variable with the expresion to generate the table
            meascolumns.push({colvar:agi.substr(1), colname:m.aggfunc+"("+m.name+")"});
        }
    });


    //PROCESS DIMENSIONS
    datacube.dimensions.forEach(function(d){
        var dim = new Dimension(d.uri, d.name, d.levels, d.hierarchies);
        
        //if exists, get the only ROLLUP on that dimension
        var r = simplequery.query.filter(function(oper){
            return (oper.dimension == dim.uri && oper.qloperator == "ROLLUP");
        });

        //if exists, get the only SLICE on that dimension
        var s = simplequery.query.filter(function(oper){
            return (oper.dimension == dim.uri && oper.qloperator == "SLICE");
        });

        //if does not exist a slice on this dimension
        if(s.length ==0){
            var lmi = sparqlIPO.getNewVariable(levelMemSeed, levelMemCounter);
            levelMemCounter++;
            //get the bottom level in the dimension
            var dimBottomLevel = dim.getBottomLevel().uri;
            //link observations with values at the bottomLevel
            if (optimize){
                sparqlIPO.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
            }else{
                sparqlIPO.addPattern("?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
            }; 
        }

        //exists a rollup on this dimension and not exists slice
        if (r.length>0 && s.length==0){
            var rollup = r[0];
            //console.log("ROLLUP: "+util.inspect(rollup, { showHidden: false, depth: null, colors:true }));
            var targetLevel = rollup.targetLevel;
            var bottomLevel = rollup.bottomLevel.uri;
            if (optimize){
                sparqlIPO.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,"qb4o:memberOf",escapeAbsoluteIRI(dimBottomLevel));
            }else{
                sparqlIPO.addPattern(lmi,"qb4o:memberOf",escapeAbsoluteIRI(dimBottomLevel));
            };
            
            if (bottomLevel != targetLevel){
                //find the shortest path between this 2 levels
                //var levelPath = dim.getShortestPath(bottomLevel, targetLevel);
                var levelPath = dim.getLongestPath(bottomLevel, targetLevel);
                //console.log("------longest PATH: "+util.inspect(levelPath, { showHidden: false, depth: null, colors:true }));

                levelPath.path.forEach(function(actual){
                    var actualLevel = actual.level;
                    var plmi = sparqlIPO.getNewVariable(parentLevelMemSeed, parentLevelMemCounter);
                    if(actualLevel != bottomLevel){
                        parentLevelMemCounter++;
                        if (optimize){
                            sparqlIPO.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,"skos:broader",plmi);
                            sparqlIPO.addPatternToGroup(levelMemSeed+levelMemCounter,false,plmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                        }else{
                            sparqlIPO.addPattern(lmi,"skos:broader",plmi);
                            sparqlIPO.addPattern(plmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                        };
                        
                        lmi = plmi;
                    }
                    if(actualLevel == targetLevel){
                        sparqlIPO.addVariableToResult(plmi);
                        sparqlIPO.addVariableToGroupBy(plmi);
                        //associate the variable with the expresion to generate the table
                        varcolumns.push({colvar:plmi.substr(1), colname:dim.getLevel(actualLevel).name});
                    }
                });
            }else{
                sparqlIPO.addVariableToResult(lmi);
                //associate the variable with the expresion to generate the table
                varcolumns.push({colvar:lmi.substr(1), colname:dim.getBottomLevel().name});
                sparqlIPO.addVariableToGroupBy(lmi);
            }
        //doesnt exist a rollup on this dimension    
        }else if (s.length==0){
            sparqlIPO.addVariableToResult(lmi);
            //associate the variable with the expresion to generate the table
            varcolumns.push({colvar:lmi.substr(1), colname:dim.getBottomLevel().name});
            sparqlIPO.addVariableToGroupBy(lmi);
        }
    });//end processing dimensions
    sparqlstr = sparqlIPO.toString(false);
    //console.log("QUERY in qb4olap-operators: "+sparqlStr);

    var query = {sparqlquery:sparqlstr, columns:varcolumns.concat(meascolumns)};

    return query;
}

//pre: datacube is the cube structure, simplequery is a simplified QL query that contains DICE ops.
//post: returns a SPARQL query that implements a QL query 
function getDiceSparqlQuery(endpoint, datacube, simplequery, optimize){
    
    var sparqlDICE =  new SPARQLquery([],"select",[],[],[],[],'');
    var sparqlIPO =  new SPARQLquery([],"select",[],[],[],[],'');
    var sparqlStr;
    var meascolumns = [];
    var varcolumns = [];

   //the seeds for variable generation and the counters
    var levelMemSeed = "lm";
    var levelMemCounter = 1;

    var parentLevelMemSeed = "plm";
    var parentLevelMemCounter = 1;

    var measureSeed = "m";
    var measureCounter = 1;
    var agSeed = "ag";
    var agCounter = 1;

    sparqlDICE.addPrefix("qb","http://purl.org/linked-data/cube#");
    sparqlDICE.addPrefix("qb4o","http://purl.org/qb4olap/cubes#");
    sparqlDICE.addPrefix("skos","http://www.w3.org/2004/02/skos/core#");

    if (optimize){
        sparqlIPO.addPatternToGroup("o",true, "?o","a","qb:Observation");
        sparqlIPO.addPatternToGroup("o",true, "?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    }else{
        sparqlIPO.addPattern("?o","a","qb:Observation");
        sparqlIPO.addPattern("?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    };

    

    sparqlIPO.addFrom(datacube.instancegraph);                      
    sparqlIPO.addFrom(datacube.schemagraph);

    //PROCESS MEASURES
    //TODO if there is no rollup do not aggregate
    datacube.measures.forEach(function(m){
        var mi = sparqlIPO.getNewVariable(measureSeed, measureCounter);
        measureCounter++;
        var agi = sparqlIPO.getNewVariable(agSeed, agCounter);
        agCounter++;
        //link observations with measure values
        if (optimize){
            sparqlIPO.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(m.uri),mi);
        }else{
            sparqlIPO.addPattern("?o",escapeAbsoluteIRI(m.uri),mi);
        };
        //add the aggregation function to the result
        //also add cast
        var measuretype = m.datatype;
        if (measuretype){
            sparqlIPO.addExpresionToResult("("+m.aggfunc+"(<"+measuretype+">("+mi+")) as "+agi+")");    
        }else{
            sparqlIPO.addExpresionToResult("("+m.aggfunc+"("+mi+") as "+agi+")");
        }
        //add the calculated var to the outer query
        sparqlDICE.addVariableToResult(agi);
        
        //associate the variable with the expresion to generate the table
        meascolumns.push({
            colvar:agi.substr(1), 
            colname:m.aggfunc+"("+m.name+")",
            colmeas:m.uri
        });
    });


    //PROCESS DIMENSIONS
    datacube.dimensions.forEach(function(d){
        var dim = new Dimension(d.uri, d.name, d.levels, d.hierarchies);
        
        var lmi = sparqlIPO.getNewVariable(levelMemSeed, levelMemCounter);
        levelMemCounter++;
        //get the bottom level in the dimension
        var dimBottomLevel = dim.getBottomLevel().uri;
        //link observations with values at the bottomLevel
        if (optimize){
            sparqlIPO.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
        }else{
            sparqlIPO.addPattern("?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
        };       
        
        //if exists, get the only ROLLUP on that dimension
        var r = simplequery.query.filter(function(oper){
            return (oper.dimension == dim.uri && oper.qloperator == "ROLLUP");
        });

        //if exists, get the only SLICE on that dimension
        var s = simplequery.query.filter(function(oper){
            return (oper.dimension == dim.uri && oper.qloperator == "SLICE");
        });


        //exists a rollup on this dimension and not exists slice
        if (r.length>0 && s.length==0){
            var rollup = r[0];
            //console.log("ROLLUP: "+util.inspect(rollup, { showHidden: false, depth: null, colors:true }));
            var targetLevel = rollup.targetLevel;
            var bottomLevel = rollup.bottomLevel.uri;
            if (optimize){
                sparqlIPO.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,"qb4o:memberOf",escapeAbsoluteIRI(dimBottomLevel));
            }else{
                sparqlIPO.addPattern(lmi,"qb4o:memberOf",escapeAbsoluteIRI(dimBottomLevel));
            };
            
            //find the shortest path between this 2 levels
            var levelPath = dim.getShortestPath(bottomLevel, targetLevel);
            levelPath.path.forEach(function(actual){
                var actualLevel = actual.level;
                var plmi = sparqlDICE.getNewVariable(parentLevelMemSeed, parentLevelMemCounter);
                if(actualLevel != bottomLevel){
                    parentLevelMemCounter++;
                    if (optimize){
                        sparqlIPO.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,"skos:broader",plmi);
                        sparqlIPO.addPatternToGroup(levelMemSeed+levelMemCounter,false,plmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                    }else{
                        sparqlIPO.addPattern(lmi,"skos:broader",plmi);
                        sparqlIPO.addPattern(plmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                    };
                    
                    lmi = plmi;
                }
                if(actualLevel == targetLevel){
                    sparqlIPO.addVariableToResult(plmi);
                    sparqlIPO.addVariableToGroupBy(plmi);
                    //add variable to outer query
                    sparqlDICE.addVariableToResult(plmi);
                    //associate the variable with the expresion to generate the table
                    varcolumns.push({
                        colvar:plmi.substr(1), 
                        colname:dim.getLevel(actualLevel).name,
                        collevel:dim.getLevel(actualLevel).uri
                    });
                }
            });
        //doesnt exist a rollup on this dimension    
        }else if (s.length==0){
            sparqlIPO.addVariableToResult(lmi);
            //add variable to outer query
            sparqlDICE.addVariableToResult(lmi);
            //associate the variable with the expresion to generate the table
            varcolumns.push({
                colvar:lmi.substr(1), 
                colname:dim.getBottomLevel().name,
                collevel:dim.getBottomLevel().uri
            });
            sparqlIPO.addVariableToGroupBy(lmi);
        }
    });//end processing dimensions

    //create the filter conditions for each dice and add patterns
    var dices = simplequery.query.filter(function(oper){
        return (oper.qloperator == "DICE");
    });
    dices.forEach(function(dice){
        var seed = 1;
        var resdice = {bgps : []};
        getFilterFromDice(dice.dicecondition,datacube,varcolumns,meascolumns,seed,resdice);
        //console.log("dice condition:");
        //console.log(util.inspect(dice.dicecondition, { showHidden: false, depth: null, colors:true }));
        //console.log("filter from dice:");
        //console.log(util.inspect(resdice, { showHidden: false, depth: null, colors:true }));
        seed ++;
        sparqlDICE.addFilter(resdice.filtr);
        resdice.bgps.forEach(function(b){
            if (! sparqlDICE.existsPattern(b.s, b.p, b.o)){
                //console.log("bgp:");
                //console.log(util.inspect(b, { showHidden: false, depth: null, colors:true }));
                sparqlDICE.addPattern(b.s, b.p, b.o);
            }
        });
    });

    sparqlDICE.addSubquery(sparqlIPO);
    sparqlstr = sparqlDICE.toString(false);
    //console.log("QUERY in qb4olap-operators: "+sparqlStr);

    var query = {sparqlquery:sparqlstr, columns:varcolumns.concat(meascolumns)};

    return query;
}



function getFilterFromDice(dicecondition,datacube,varcolumns,meascolumns,seed,result){
    var operators = ['AND','OR'];
    if (dicecondition.nodetype == "leaf"){
        if(dicecondition.args[0].condType == "attribute"){
            //find the variable that corresponds to this level
            var levelvar = "?"+varcolumns.filter(function(v){
                return (v.collevel == dicecondition.args[0].level);
            })[0].colvar;
            var membervar = levelvar+seed;
            //create a bgp that gets the value of the attribute
            var bgp = {
                s: levelvar,
                p: "<"+dicecondition.args[0].attribute+">",
                o: membervar
            }
            
            result.bgps.push(bgp);
                        
            //add a filter on the value of the attribute
            //get the type of the attribute
            var dc = new Datacube(datacube.name, datacube.uri, datacube.dataset);
            dc.setDimensions(datacube.dimensions);
            var attype = dc.getAttributeType(dicecondition.args[0].level, dicecondition.args[0].attribute);

            if (attype == "http://www.w3.org/2001/XMLSchema#string" && dicecondition.operator == "="){
                var f = "(REGEX ("+membervar+","+dicecondition.args[1]+" , \"i\"))";
            }else{
                var f = "("+membervar + dicecondition.operator +dicecondition.args[1]+")";    
            }
            
            result.filtr = f;
        }else if (dicecondition.args[0].condType == "measure"){
            //find the variable that corresponds to this measure
            var measvar = "?"+meascolumns.filter(function(v){
                return (v.colmeas == dicecondition.args[0].measure);
            })[0].colvar;
            //add a filter on the value of the measure
            var f = "("+measvar +" "+ dicecondition.operator +" "+dicecondition.args[1]+")";
            result.filtr = f;
        }
    }else{
        //if its a binary operator
        if (operators.indexOf(dicecondition.operator) > -1){
            var rleft = {bgps : []};
            var rright = {bgps : []};
            getFilterFromDice(dicecondition.args[0],datacube,varcolumns,meascolumns,seed,rleft);
            getFilterFromDice(dicecondition.args[1],datacube,varcolumns,meascolumns,seed,rright);

            rleft.bgps.forEach(function(b){
                result.bgps.push(b);
            });
            rright.bgps.forEach(function(b){
                result.bgps.push(b);
            });
            var binoper = "";
            if (dicecondition.operator == "AND") binoper = "&&";
            if (dicecondition.operator == "OR") binoper = "||";
            var f = "("+rleft.filtr +" "+ binoper+" "+rright.filtr+")";
            result.filtr = f;
        }
    }
}

function escapeAbsoluteIRI(iri){
    return "<"+iri+">";
}


//returns true if the dice condition has a condition over a measure, false if not.
function existsConditionOverMeasure(dicecondition) {
  
    var result= false;
        //console.log("dicecondition en existsConditionOverMeasure");
        ////console.log(util.inspect(dicecondition, { showHidden: false, depth: null, colors:true }));

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

//Receives a query and splits it in two parts according to the first occurence of a DICE operation

function splitDice(query, beforedice, afterdice) {

    var dicefound = false;
    query.forEach(function(o){
        if (o.qloperator == "DICE"){
            dicefound = true;
        };
        if(!dicefound){
            beforedice.push(o);
        }else{
            afterdice.push(o);
        }

    });
    
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
        dicelevellist.unshift(newDICE);
    }
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
//        //console.log(util.inspect(dicecondition.args, { showHidden: false, depth: null, colors:true }));
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

    var ret = 0;

    inputquery.query.forEach(function(row){
        if ((row.qloperator == "ROLLUP")||(row.qloperator == "DRILLDOWN")) {ipo= ipo||true};
        if (row.qloperator == "SLICE") {slice=slice||true};
        if (row.qloperator == "DICE") {dice=dice||true};
    });

    //console.log("IPO "+ipo);
    //console.log("SLICE "+slice);
    //console.log("DICE "+dice);

    if (ipo && !slice && !dice) {ret = 1};
    if (ipo && slice && !dice) {ret = 2};
    if (dice) {ret = 3};
    
    return ret;
    
}

  






