//qb4olap-operators.js

var util = require('util');

var Datacube = require('../models/Datacube');
var Dimension = require('../models/Dimension');
var Hierarchy = require('../models/Hierarchy');
var Level = require('../models/Level');
var Measure = require('../models/Measure');


//pre: datacube is the cube structure, query is a QL query
//post: returns a simplified version of the query
exports.getSimplifiedQuery = function(datacube, query, callback){
    var simplequery = new Object();    
    //classify query into IPO, IPO SLICE, IPO DICE, IPO SLICE DICE
    var inputquery = JSON.parse(query);
    //console.log(util.inspect(datacube, { showHidden: false, depth: null, colors:true }));
    //console.log(util.inspect(inputquery, { showHidden: false, depth: null, colors:true }));
    simplequery.prefixes = inputquery.prefixes;
    simplequery.query = [];
    var source = inputquery.query[0].source;

    //apply simplification rules in each case
    var queryType = getQueryType(inputquery);
    console.log("queryType:" + queryType);

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
                var stcount = 1;
                    //first process DICE conditions. If a DICE condition over a measure is found, 
                    //then no IPO simplification is possible.
                    
                    var slicemeas = inputquery.query.filter(function(operation){
                        return ((operation.qloperator == "SLICE") && (operation.condType == "measure"));
                    });          
                    simplequery = inputquery; 
                    break;  
                //IPO & SLICE & DICE                                              
                case 4: simplequery = inputquery; 
                    break;
                default: simplequery = inputquery;                                                 
            }
            
    callback('', simplequery);    
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

  






