//qb4olap-operators.js

var util = require('util');
var backend = require('../models/sparql-backend.js');


var Datacube = require('../models/Datacube');
var Dimension = require('../models/Dimension');
var Hierarchy = require('../models/Hierarchy');
var Level = require('../models/Level');
var Measure = require('../models/Measure');


//pre: datacube is the cube structure, query is a QL query
//post: returns a simplified version of the query
exports.getSimplifiedQuery = function(endpoint, datacube, query, callback){
    var simplequery = new Object();    
    //classify query into IPO, IPO SLICE, IPO DICE, IPO SLICE DICE
    var inputquery = JSON.parse(query);
    console.log("datacube: ");
    console.log(util.inspect(datacube, { showHidden: false, depth: null, colors:true }));
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
                    //1) process DICE conditions recursively, splitting AND conditions and
                    // creating 2 lists of DICE operations.       
                    //dicesOnMeasures is a list of all dice operations in the query that contain a codition over measures
                    //dicesOnLevels is a list of all dice operations in the query that contain exclusively coditions over levels
                    //in both cases AND conditions have been splitted.
                    //NEW dices generated by splitting conditions refer to its original statement to keep order 
                    //(which is relevant in the case of measure conditions)

                    var dices = inputquery.query.filter(function(operation){
                        return (operation.qloperator == "DICE");
                    });  

                    var dicemeasure = false;
                    var dicesOnLevels = [];
                    var dicesOnMeasures = [];

                    dices.forEach(function(dice){
                        if(dice.dicecondition.operator == 'AND'){
                            var dicemeasurelist = [];
                            var dicelevellist = [];
                            splitDiceAnd(dice.dicecondition, dice.statement, dicemeasurelist,dicelevellist);
                            dicesOnLevels = dicesOnLevels.concat(dicelevellist);
                            dicesOnMeasures = dicesOnMeasures.concat(dicemeasurelist);
                        }else{
                            if(existsConditionOverMeasure(dice.dicecondition)){
                                dicesOnMeasures.push(dice);
                            }else{
                                dicesOnLevels.push(dice);
                            }
                        }
                    });

                    console.log('dicesOnLevels:');
                    console.log(util.inspect(dicesOnLevels, { showHidden: false, depth: null, colors:true }));
                    console.log('dicesOnMeasures:');
                    console.log(util.inspect(dicesOnMeasures, { showHidden: false, depth: null, colors:true }));

                    //2) rewrite all DICEs over levels as DICEs over bottom level members and put them at the beggining of the query
                    dicesOnLevels.forEach(function(dice){
/*
                        2.1 get the level and the value
                        2.2 if the level is the bottom level of a hierarchy in a dimension of the cube do nothing
                        2.3 else get the bottom level of the dimension to which the level belongs 
                        2.4 apply aux function backend.getChildLevelMembers to obtain the child members that rollup to value
                        2.5 transform diceconditions into conditions over bottom levels
*/                         
                    });
                        



                    //If there is no DICE condition over a measure, IPO simplification is possible.
                    if (dicesOnMeasures.length < -1){
                        //simplify IPOs as usual
                    }
                    

                    simplequery = inputquery; 
                    break;  
                //IPO & SLICE & DICE                                              
                case 4: simplequery = inputquery; 
                    break;
                default: simplequery = inputquery;                                                 
            }
            
    callback('', simplequery);    
}


//returns true if the dice operation has a condition over a measure, false if not.
function existsConditionOverMeasure(dice) {

    var operators = ['AND','OR'];
    var result;

    if (operators.indexOf(dice.operator) > -1){
        var recCall = dice.args.map(existsConditionOverMeasure);
        //console.log("dice checks array: "+recCall);
        result = recCall.reduce(function(a, b) {
        return a || b;
        });
    }
    else {
        result = dice.args.filter(function(arg){
            return Object.keys(arg).indexOf('measure') >-1;}
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

    //console.log("dicecondition: ");
    //console.log(util.inspect(dicecondition, { showHidden: false, depth: null, colors:true }));

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

  






