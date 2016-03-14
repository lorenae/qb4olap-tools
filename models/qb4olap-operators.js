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

    console.log("QUERY TYPE:"+queryType);
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
                            var bottomLevel = dim.bottomLevel;
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
                //SLICE only    
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
                        }
                    }); 
                    break;
                    //IPO & SLICE    
                case 3: 
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
                                ////console.log("DIM:" +util.inspect(dim, { showHidden: false, depth: null, colors:true }));
                                var bottomLevel = dim.bottomLevel;
                                var targetLevel = ipodim[ipodim.length-1].level;
                                ////console.log("bottom:" +util.inspect(bottomLevel, { showHidden: false, depth: null, colors:true }));
                                ////console.log("target:" +util.inspect(targetLevel, { showHidden: false, depth: null, colors:true }));

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
                //DICE WITHOUT SLICE OR DRILLDOWN  
                // (DICE)* (ROLLUP)* (DICE)*  
                case 4: 
                    //splitRollup
                    var firstdices =[];
                    var rollups =[];
                    var lastdices =[];

                    splitRollup(inputquery.query, firstdices, rollups,lastdices);
                    var stcount = 1;
                    var RUPs = [];
                    
                    //process DICES before rollups
                    firstdices.forEach(function(dice){
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
                    //process ROLLUPS grouping by dim
                    datacube.dimensions.forEach(function(dim){
                        // group ROLLUP operations by dimension, preserving order
                        var ipodim = rollups.filter(function(operation){
                        return ((operation.qloperator == "ROLLUP") && (operation.dimension == dim.uri));
                        });
                        // if exists ROLLUP operations for a dimension
                        if (ipodim.length>0){
                            // consider the level reached by the last operation for each dimension (target level)
                            var bottomLevel = dim.bottomLevel;
                            var targetLevel = ipodim[ipodim.length-1].level;
                            
                            // if target level is different than the bottom level for that dimension, 
                            // rewrite the sequence of RUPs as a ROLLUP from bottom up to target level
                            // else, remove all the RUPs for that dimension
                            if( targetLevel != bottomLevel){
                                var newRUP = new Object();                
                                newRUP.qloperator = "ROLLUP";
                                newRUP.dimension = dim.uri;
                                newRUP.bottomLevel = bottomLevel;
                                newRUP.targetLevel = targetLevel;
                                newRUP.level = targetLevel;
                                RUPs.push(newRUP);
                            }                           
                        }
                    }); 
                    RUPs.forEach(function(ipo){
                        ipo.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                            ipo.source = source;
                        }else{
                            ipo.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(ipo);
                    });
                    //process DICES after rollups
                    lastdices.forEach(function(dice){
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
                //NO DICE OVER MEASURES and WITHOUT SLICE OR DRILLDOWN  
                // (DICE)* (ROLLUP)* (DICE)*  
                case 41: 
                    //splitRollup
                    var firstdices =[];
                    var rollups =[];
                    var lastdices =[];

                    splitRollup(inputquery.query, firstdices, rollups,lastdices);
                    var stcount = 1;
                    var RUPs = [];
                    
                    //process DICES before rollups
                    firstdices.forEach(function(dice){
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
                    //process ROLLUPS grouping by dim
                    datacube.dimensions.forEach(function(dim){
                        // group ROLLUP operations by dimension, preserving order
                        var ipodim = rollups.filter(function(operation){
                        return ((operation.qloperator == "ROLLUP") && (operation.dimension == dim.uri));
                        });
                        // if exists ROLLUP operations for a dimension
                        if (ipodim.length>0){
                            // consider the level reached by the last operation for each dimension (target level)
                            var bottomLevel = dim.bottomLevel;
                            var targetLevel = ipodim[ipodim.length-1].level;
                            
                            // if target level is different than the bottom level for that dimension, 
                            // rewrite the sequence of RUPs as a ROLLUP from bottom up to target level
                            // else, remove all the RUPs for that dimension
                            if( targetLevel != bottomLevel){
                                var newRUP = new Object();                
                                newRUP.qloperator = "ROLLUP";
                                newRUP.dimension = dim.uri;
                                newRUP.bottomLevel = bottomLevel;
                                newRUP.targetLevel = targetLevel;
                                newRUP.level = targetLevel;
                                RUPs.push(newRUP);
                            }                           
                        }
                    }); 
                    RUPs.forEach(function(ipo){
                        ipo.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                            ipo.source = source;
                        }else{
                            ipo.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(ipo);
                    });
                    //process DICES after rollups
                    lastdices.forEach(function(dice){
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
                //ROLLUP & SLICE & DICE    
                case 5: 
                    //splitRollup
                    var firstops =[];
                    var rollups =[];
                    var lastops =[];

                    splitRollupWSlice(inputquery.query, firstops, rollups,lastops);

                    ////console.log("FIRST:" +util.inspect(firstops, { showHidden: false, depth: null, colors:true }));
                    ////console.log("ROLLUPS:" +util.inspect(rollups, { showHidden: false, depth: null, colors:true }));
                    ////console.log("LAST:" +util.inspect(lastops, { showHidden: false, depth: null, colors:true }));

                    var stcount = 1;
                    var RUPs = [];

                    //first push SLICE and DICE operations from the first part
                    var fops = firstops.filter(function(operation){
                        return ((operation.qloperator == "SLICE") || (operation.qloperator == "DICE"));
                    });                        
                    fops.forEach(function(op){
                        op.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                                op.source = source;
                            }else{
                                op.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(op);
                    }); 

                    datacube.dimensions.forEach(function(dim){ 
                        // group ROLLUP operations by dimension, preserving order
                        var rupdim = rollups.filter(function(operation){
                        return ((operation.qloperator == "ROLLUP") && (operation.dimension == dim.uri));
                        });
                        //  simplify rollups
                        if (rupdim.length>0  ){
                            // consider the level reached by the last operation for each dimension (target level)
                            ////console.log("DIM:" +util.inspect(dim, { showHidden: false, depth: null, colors:true }));
                            var bottomLevel = dim.bottomLevel;
                            var targetLevel = rupdim[rupdim.length-1].level;
                            ////console.log("bottom:" +util.inspect(bottomLevel, { showHidden: false, depth: null, colors:true }));
                            ////console.log("target:" +util.inspect(targetLevel, { showHidden: false, depth: null, colors:true }));

                            // if target level is different than the bottom level for that dimension, 
                            // rewrite the sequence of ROLLUPS as ROLLUP from bottom up to target level
                            // else, remove all the ROLLUPS for that dimension
                            if( targetLevel != bottomLevel){
                                var newIPO = new Object();                
                                newIPO.qloperator = "ROLLUP";
                                newIPO.dimension = dim.uri;
                                newIPO.bottomLevel = bottomLevel;
                                newIPO.targetLevel = targetLevel;
                                newIPO.level = targetLevel;
                                RUPs.push(newIPO);
                            }                           
                        }
                    }); 
                    
                    RUPs.forEach(function(rup){
                        rup.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                            rup.source = source;
                        }else{
                            rup.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(rup);
                    });
                    //last push SLICE and DICE operations from the last part
                    var lops = lastops.filter(function(operation){
                        return ((operation.qloperator == "SLICE") || (operation.qloperator == "DICE"));
                    });                        
                    lops.forEach(function(op){
                        op.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                                op.source = source;
                            }else{
                                op.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(op);
                    });                
                    simplequery.type = queryType; 
                    break;  
                //ROLLUP & SLICE & DICE   DICE only over levels
                case 51: 
                /*
                    //splitRollup
                    var firstops =[];
                    var rollups =[];
                    var lastops =[];

                    splitRollupWSlice(inputquery.query, firstops, rollups,lastops);

                    ////console.log("FIRST:" +util.inspect(firstops, { showHidden: false, depth: null, colors:true }));
                    ////console.log("ROLLUPS:" +util.inspect(rollups, { showHidden: false, depth: null, colors:true }));
                    ////console.log("LAST:" +util.inspect(lastops, { showHidden: false, depth: null, colors:true }));

                    var stcount = 1;
                    var RUPs = [];

                    //first push SLICE and DICE operations from the first part
                    var fops = firstops.filter(function(operation){
                        return ((operation.qloperator == "SLICE") || (operation.qloperator == "DICE"));
                    });                        
                    fops.forEach(function(op){
                        op.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                                op.source = source;
                            }else{
                                op.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(op);
                    }); 

                    datacube.dimensions.forEach(function(dim){ 
                        // group ROLLUP operations by dimension, preserving order
                        var rupdim = rollups.filter(function(operation){
                        return ((operation.qloperator == "ROLLUP") && (operation.dimension == dim.uri));
                        });
                        //  simplify rollups
                        if (rupdim.length>0  ){
                            // consider the level reached by the last operation for each dimension (target level)
                            ////console.log("DIM:" +util.inspect(dim, { showHidden: false, depth: null, colors:true }));
                            var bottomLevel = dim.bottomLevel;
                            var targetLevel = rupdim[rupdim.length-1].level;
                            ////console.log("bottom:" +util.inspect(bottomLevel, { showHidden: false, depth: null, colors:true }));
                            ////console.log("target:" +util.inspect(targetLevel, { showHidden: false, depth: null, colors:true }));

                            // if target level is different than the bottom level for that dimension, 
                            // rewrite the sequence of ROLLUPS as ROLLUP from bottom up to target level
                            // else, remove all the ROLLUPS for that dimension
                            if( targetLevel != bottomLevel){
                                var newIPO = new Object();                
                                newIPO.qloperator = "ROLLUP";
                                newIPO.dimension = dim.uri;
                                newIPO.bottomLevel = bottomLevel;
                                newIPO.targetLevel = targetLevel;
                                newIPO.level = targetLevel;
                                RUPs.push(newIPO);
                            }                           
                        }
                    }); 
                    
                    RUPs.forEach(function(rup){
                        rup.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                            rup.source = source;
                        }else{
                            rup.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(rup);
                    });
                    //last push SLICE and DICE operations from the last part
                    var lops = lastops.filter(function(operation){
                        return ((operation.qloperator == "SLICE") || (operation.qloperator == "DICE"));
                    });                        
                    lops.forEach(function(op){
                        op.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                                op.source = source;
                            }else{
                                op.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(op);
                    }); 
                    */
                    // ROLLUP & DDOWN & SLICE & DICE   DICE only over levels
                    //splitRollup
                    
                                 
                    simplequery.type = queryType; 
                    break;      
                //IPO & SLICE & DICEL    
                case 6: 
                    //splitDice
                    
                    //var beforedice =[];
                    //var afterdice =[];
                    var alldices = [];
                    var atomleveldices =[];
                    var atommeasdices =[];
                    var endslices = [];

                    //splitDice(inputquery.query, beforedice, afterdice);
                    var stcount = 1;
                    var IPOs = [];

                    //console.log("input query:" +util.inspect(inputquery.query, { showHidden: false, depth: null, colors:true }));

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

                    //process each dimension
                    //1- find slice operations over the dimension
                    //2- find dice operations over the dimension
                    //3- find ipos over the dimension

                    /*
                    if there is no dice: 
                        if there is a slice: 
                            move it to the beginning and ignore any other op over the dim
                        if not:
                            simplify IPOs as usual
                    if there is a dice:
                        move the slice to the end
                        only simplify consecutive RUPs (optional)

                    */

                    //get all the dices
                    var alldices = inputquery.query.filter(function(operation){
                        return ((operation.qloperator == "DICE"));
                    });
                    alldices.forEach(function(dice){
                        var pos = inputquery.query.indexOf(dice);
                        splitDiceAtoms(dice.dicecondition, dice.statement, atommeasdices, atomleveldices);
                    });

                    //console.log("dice level atoms:" +util.inspect(atomleveldices, { showHidden: false, depth: null, colors:true }));
                    //console.log("dice meas atoms:" +util.inspect(atommeasdices, { showHidden: false, depth: null, colors:true }));
                    

                    datacube.dimensions.forEach(function(dim){
                        //console.log("--------DIM: "+dim.uri);
                        var slicedim = inputquery.query.filter(function(operation){
                            return ((operation.qloperator == "SLICE") && (operation.dimension == dim.uri));
                        });
                        var dicedim = atomleveldices.filter(function(dice){
                            return (dice.dicecondition.args[0].dimension == dim.uri);
                        });                    

                        //no dice over dim
                        if (dicedim.length==0){
                            //console.log("-------dice:NO");
                            // if exists a slice over a dimension, only keep the slice
                            if (slicedim.length>0){
                                //console.log("-------slice:YES");    
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
                                //console.log("-------slice:NO");    
                                var ipodim = inputquery.query.filter(function(operation){
                                return (((operation.qloperator == "ROLLUP")||(operation.qloperator == "DRILLDOWN")) && (operation.dimension == dim.uri));
                                });
                                console.log("ipos on dim:" +util.inspect(ipodim, { showHidden: false, depth: null, colors:true }));
                                if (ipodim.length>0){
                                    //console.log("-------ipo:YES");    
                                    //console.log("ipo en dim sin dice o slice: "+dim.uri);
                                    // consider the level reached by the last operation for each dimension (target level)
                                    ////console.log("DIM:" +util.inspect(dim, { showHidden: false, depth: null, colors:true }));
                                    var bottomLevel = dim.bottomLevel;
                                    var targetLevel = ipodim[ipodim.length-1].level;
                                    ////console.log("bottom:" +util.inspect(bottomLevel, { showHidden: false, depth: null, colors:true }));
                                    ////console.log("target:" +util.inspect(targetLevel, { showHidden: false, depth: null, colors:true }));

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
                                }else{
                                   //console.log("-------ipo:NO");     
                                }
                            }
                        }
                        //dice over dim
                        /*
                        if there is a dice:
                        move the slice to the end
                        only simplify consecutive RUPs (optional)
                        */
                        else{
                            //console.log("-------dice:YES");
                            if (slicedim.length>0){
                                //console.log("-------slice:YES");    
                                var newSLICE = new Object();
                                    newSLICE.statement = "$C"+stcount++;
                                    newSLICE.qloperator = "SLICE";
                                    newSLICE.condType = "dimension";
                                    newSLICE.dimension = dim.uri;
                                    endslices.push(newSLICE);
                            }
                            var ipodim = inputquery.query.filter(function(operation){
                                return (((operation.qloperator == "ROLLUP")||(operation.qloperator == "DRILLDOWN")) && (operation.dimension == dim.uri));
                            });
                            //insert the dices and the ipos in the same order as in the original query
                            //use the statement field to rearrange
                            var sortedops = [];                            
                            ipodim.sort(function(a,b){
                                var str1 = a.statement;
                                var str2 = b.statement;
                                return ( str1 < str2 ) ? -1 : ( str1 > str2 ? 1 : 0 );
                            });
                            
                            dicedim.sort(function(a,b){
                                var str1 = a.statement;
                                var str2 = b.statement;
                                return ( str1 < str2 ) ? -1 : ( str1 > str2 ? 1 : 0 );
                            });

                            
                            //copy all the dices derived from a dice at a certain position
                            var i = 0;
                            var d = 0;
                            //console.log("ipodim:" +util.inspect(ipodim, { showHidden: false, depth: null, colors:true }));
                            //console.log("dicedim:" +util.inspect(dicedim, { showHidden: false, depth: null, colors:true }));

                            //merge
                            while (i<ipodim.length && d<dicedim.length){
                                //console.log("ipo st:"+ipodim[i].statement);
                                //console.log("dice st:"+dicedim[d].statement);
                                while(i<ipodim.length && d<dicedim.length && ipodim[i].statement<dicedim[d].statement){
                                    sortedops.push(ipodim[i]);
                                    i++;
                                }
                                while(i<ipodim.length && d<dicedim.length && ipodim[i].statement>dicedim[d].statement){
                                    sortedops.push(dicedim[d]);
                                    d++;
                                }
                            }
                            //copy the remainders
                            while (i<ipodim.length){
                                sortedops.push(ipodim[i]);
                                i++;
                            }
                            while(d<dicedim.length){
                                sortedops.push(dicedim[d]);
                                d++;
                            }

                            //console.log("sortedops:" +util.inspect(sortedops, { showHidden: false, depth: null, colors:true }));

                            sortedops.forEach(function(o){
                                o.statement = "$C"+stcount++;
                                if(simplequery.query.length==0){
                                    o.source = source;
                                }else{
                                    o.source = simplequery.query[simplequery.query.length-1].statement;
                                }
                                simplequery.query.push(o);
                            });
                            } 
                    }); 
                    console.log("IPOs:" +util.inspect(IPOs, { showHidden: false, depth: null, colors:true }));
                    IPOs.forEach(function(ipo){
                        ipo.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                            ipo.source = source;
                        }else{
                            ipo.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(ipo);
                    });
                    endslices.forEach(function(o){
                        o.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                            o.source = source;
                        }else{
                            o.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(o);
                    });                 
                    simplequery.type = queryType; 
                    break;
                //IPO & SLICE & DICE over level members only, followed by dice on measures   
                case 62: 
                    var stcount = 1;
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
                        // group operations by dimension, preserving order
                        var ipodim = inputquery.query.filter(function(operation){
                            return (((operation.qloperator == "ROLLUP")||(operation.qloperator == "DRILLDOWN")) && (operation.dimension == dim.uri));
                        });
                        if (ipodim.length>0){
                            // consider the level reached by the last operation for each dimension (target level)
                            var bottomLevel = dim.bottomLevel;
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
                        var slicedim = inputquery.query.filter(function(operation){
                            return ((operation.qloperator == "SLICE") && (operation.dimension == dim.uri));
                        });
                        // process slices over dimensions
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
                        }
                    }); 
                    var dices = inputquery.query.filter(function(operation){
                        return ((operation.qloperator == "DICE") );
                    });
                    dices.forEach(function(dice){
                        dice.statement = "$C"+stcount++;
                        if(simplequery.query.length==0){
                            dice.source = source;
                        }else{
                            dice.source = simplequery.query[simplequery.query.length-1].statement;
                        }
                        simplequery.query.push(dice);
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

    ////console.log("QUERY TYPE: "+simplequery.type);
    ////console.log("simplequery: "+util.inspect(simplequery, { showHidden: false, depth: null, colors:true }));

    switch(simplequery.type){
        //IPO only
        case 1:
        query = getIPOOnlySparqlQuery(endpoint, datacube, simplequery, false);
        break;
        //SLICE only
        case 2:
        query = getSliceOnlySparqlQuery(endpoint, datacube, simplequery, false);
        break;
        //IPO + SLICE
        case 3:
        query = getIPOSliceSparqlQuery(endpoint, datacube, simplequery, false);
        break;
        //ROLLUP+DICE (DICE)* (ROLLUP)* (DICE)*
        case 4:
        query = getRollupDiceSparqlQuery(endpoint, datacube, simplequery, false);
        break;
        //ROLLUP+DICE (DICE)* (ROLLUP)* (DICE)*
        case 41:
        query = getRollupDiceSparqlQuery(endpoint, datacube, simplequery, false);
        break;
        //ROLLUP+DICE+SLICE (SLICE|DICE)* (ROLLUP)* (SLICE|DICE)*
        case 5:
        query = getRollupSliceDiceSparqlQuery(endpoint, datacube, simplequery,true, false);
        break;
        //ROLLUP+DICE+SLICE (SLICE|DICE)* (ROLLUP)* (SLICE|DICE)*
        case 51:
        query = getRollupSliceDiceSparqlQuery(endpoint, datacube, simplequery,false, false);
        break;
        //ALL but only DICE over level attributes
        case 6:
        query = getFullNoDiceMeasureSparqlQuery(endpoint, datacube, simplequery, false);
        break;
        //all, with dice over measures at the ende
        case 62:
        //query = getFullNoDiceMeasureSparqlQuery(endpoint, datacube, simplequery, false);
        query = getFullSparqlQuery(endpoint, datacube, simplequery, false);
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
        query = getIPOOnlySparqlQuery(endpoint, datacube, simplequery, true);
        break;
        //SLICE only
        case 2:
        query = getSliceOnlySparqlQuery(endpoint, datacube, simplequery, true);
        break;
        //IPO + SLICE
        case 3:
        query = getIPOSliceSparqlQuery(endpoint, datacube, simplequery, true);
        break;
        //ROLLUP+DICE (DICE)* (ROLLUP)* (DICE)*
        case 4:
        query = getRollupDiceSparqlQuery(endpoint, datacube, simplequery, true);
        break;
        //ROLLUP+DICE (DICE)* (ROLLUP)* (DICE)*
        case 41:
        query = getRollupDiceSparqlQuery(endpoint, datacube, simplequery, true);
        break;
        //ROLLUP+DICE+SLICE (SLICE|DICE)* (ROLLUP)* (SLICE|DICE)*
        case 5:
        query = getRollupSliceDiceSparqlQuery(endpoint, datacube, simplequery,true, true);
        break;
        //ROLLUP+DICE+SLICE (SLICE|DICE)* (ROLLUP)* (SLICE|DICE)*
        case 51:
        query = getRollupSliceDiceSparqlQuery(endpoint, datacube, simplequery,false, true);
        break;
        //ALL
        case 6:
        query = getFullNoDiceMeasureSparqlQuery(endpoint, datacube, simplequery, true);
        break;
        //ALL
        case 61:
        query = getFullSparqlQuery(endpoint, datacube, simplequery, true);
        break;
        default:
    }
    callback('', query);
};


//pre: datacube is the cube structure, simplequery is a simplified QL query that only contains IPO ops.
//post: returns a SPARQL query that implements a QL query 
function getIPOOnlySparqlQuery(endpoint, datacube, simplequery, optimize){
    
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
            //virtuoso does not have a cast to positiveInteger, use cast to integer instead
            if (measuretype == "http://www.w3.org/2001/XMLSchema#positiveInteger") measuretype = "http://www.w3.org/2001/XMLSchema#integer";
            sparqlIPO.addExpresionToResult("("+m.aggfunc+"(<"+measuretype+">("+mi+")) as "+agi+")");
        }else{
            sparqlIPO.addExpresionToResult("("+m.aggfunc+"("+mi+") as "+agi+")");
        }
        //associate the variable with the expresion to generate the table
        meascolumns.push({
            colvar:agi.substr(1),
            colname:m.aggfunc+"("+m.name+")",
            colmeas:m.uri
        });
    });


    //PROCESS DIMENSIONS
    datacube.dimensions.forEach(function(d){
        var dim = new Dimension(d.uri, d.name, d.levels, d.hierarchies, d.bottomLevel);
        
        //if exists, get the only ROLLUP on that dimension
        var r = simplequery.query.filter(function(oper){
            return (oper.dimension == dim.uri && oper.qloperator == "ROLLUP");
        });

        var lmi = sparqlIPO.getNewVariable(levelMemSeed, levelMemCounter);
        levelMemCounter++;
        //get the bottom level in the dimension
        var dimBottomLevel = dim.getBottomLevel();
        //link observations with values at the bottomLevel
        if (optimize){
            sparqlIPO.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
        }else{
            sparqlIPO.addPattern("?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
        }; 
        
        //exists a rollup on this dimension 
        if (r.length>0){
            var rollup = r[0];
            ////console.log("ROLLUP: "+util.inspect(rollup, { showHidden: false, depth: null, colors:true }));
            var targetLevel = rollup.targetLevel;
            var bottomLevel = rollup.bottomLevel;

            if (bottomLevel != targetLevel){
                //find the longest path between this 2 levels
                var levelPath = dim.getLongestPath(bottomLevel, targetLevel);
                ////console.log("------longest PATH: "+util.inspect(levelPath, { showHidden: false, depth: null, colors:true }));
                levelPath.path.forEach(function(actual){
                    ////console.log("------qb4olap-operators   actualnode: "+util.inspect(actual, { showHidden: false, depth: null, colors:true }));
                    var actualLevel = actual.level;
                    var parentLevel = actual.parent;
                    var actualRollup = "<"+actual.rollupfunction+">";
                    var plmi = sparqlIPO.getNewVariable(parentLevelMemSeed, parentLevelMemCounter);

                    if (parentLevel != targetLevel) {
                        parentLevelMemCounter++;
                    }
                    if (optimize){
                        sparqlIPO.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                    }else{
                        sparqlIPO.addPattern(lmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                    };
                    //only add rollup if target level is not reached    
                    if(actualLevel != targetLevel){ 
                        if (optimize){
                            sparqlIPO.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,actualRollup,plmi);
                        }else{
                            sparqlIPO.addPattern(lmi,actualRollup,plmi);
                        };
                    };
                    lmi = plmi;

                    if(actualLevel == targetLevel){
                        sparqlIPO.addVariableToResult(plmi);
                        sparqlIPO.addVariableToGroupBy(plmi);
                        //associate the variable with the expresion to generate the table
                        varcolumns.push({
                            colvar:plmi.substr(1), 
                            colname:dim.getLevel(actualLevel).name
                        });
                    }
                }); //end traversing path

            //rollup from bottom to bottom
            }else{
                sparqlIPO.addVariableToResult(lmi);
                //associate the variable with the expresion to generate the table
                varcolumns.push({
                    colvar:lmi.substr(1), 
                    colname:dim.getLevel(dim.getBottomLevel()).name
                });    
                sparqlIPO.addVariableToGroupBy(lmi);
            }
        //doesnt exist a rollup on this dimension    
        }else if (r.length==0 ){
            sparqlIPO.addVariableToResult(lmi);
            //associate the variable with the expresion to generate the table
            varcolumns.push({
                colvar:lmi.substr(1), 
                colname:dim.getLevel(dim.getBottomLevel()).name
            });
            sparqlIPO.addVariableToGroupBy(lmi);
        }
    });//end processing dimensions

    sparqlstr = sparqlIPO.toString(false);
    ////console.log("QUERY in qb4olap-operators: "+sparqlstr);

    var query = {sparqlquery:sparqlstr, columns:varcolumns.concat(meascolumns)};

    return query;
}


//pre: datacube is the cube structure, simplequery is a simplified QL query only contains SLICE ops
//post: returns a SPARQL query that implements a QL query 
function getSliceOnlySparqlQuery(endpoint, datacube, simplequery, optimize){
    
    var sparqlSLICE =  new SPARQLquery([],"select",[],[],[],[],'');
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

    sparqlSLICE.addPrefix("qb","http://purl.org/linked-data/cube#");
    sparqlSLICE.addPrefix("qb4o","http://purl.org/qb4olap/cubes#");
    sparqlSLICE.addPrefix("skos","http://www.w3.org/2004/02/skos/core#");

    if (optimize){
        sparqlSLICE.addPatternToGroup("o",true, "?o","a","qb:Observation");
        sparqlSLICE.addPatternToGroup("o",true, "?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    }else{
        sparqlSLICE.addPattern("?o","a","qb:Observation");
        sparqlSLICE.addPattern("?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    };


    sparqlSLICE.addFrom(datacube.instancegraph);                      
    sparqlSLICE.addFrom(datacube.schemagraph);

    //PROCESS MEASURES
    datacube.measures.forEach(function(m){
        //if exists, get the only SLICE on that measure
        var sm = simplequery.query.filter(function(oper){
            return (oper.measure == m.uri && oper.qloperator == "SLICE");
        });
        //if the measure is not sliced out add it to the result
        if (sm.length == 0 ){
            var mi = sparqlSLICE.getNewVariable(measureSeed, measureCounter);
            measureCounter++;
            var agi = sparqlSLICE.getNewVariable(agSeed, agCounter);
            agCounter++;
            //link observations with measure values
            if (optimize){
                sparqlSLICE.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(m.uri),mi);
            }else{
                sparqlSLICE.addPattern("?o",escapeAbsoluteIRI(m.uri),mi);
            };
            //add the aggregation function to the result
            //also add cast
            var measuretype = m.datatype;
            if (measuretype){
                sparqlSLICE.addExpresionToResult("("+m.aggfunc+"(<"+measuretype+">("+mi+")) as "+agi+")");    
            }else{
                sparqlSLICE.addExpresionToResult("("+m.aggfunc+"("+mi+") as "+agi+")");
            }
            //associate the variable with the expresion to generate the table
            meascolumns.push({
                colvar:agi.substr(1), 
                colname:m.aggfunc+"("+m.name+")",
                colmeas:m.uri
            });
        }
    });


    //PROCESS DIMENSIONS
    datacube.dimensions.forEach(function(d){
        var dim = new Dimension(d.uri, d.name, d.levels, d.hierarchies, d.bottomLevel);
        console.log("DIM "+d.name);
        //if exists, get the only SLICE on that dimension
        var s = simplequery.query.filter(function(oper){
            return (oper.dimension == dim.uri && oper.qloperator == "SLICE");
        });


        //keep the dimension only when a slice does not exist
        if (s.length == 0){

            var lmi = sparqlSLICE.getNewVariable(levelMemSeed, levelMemCounter);
            levelMemCounter++;
            //get the bottom level in the dimension
            var dimBottomLevel = dim.getBottomLevel();
           
            //link observations with values at the bottomLevel
            if (optimize){
                sparqlSLICE.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
            }else{
                sparqlSLICE.addPattern("?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
            };       
        
            sparqlSLICE.addVariableToResult(lmi);
            sparqlSLICE.addVariableToGroupBy(lmi);
            //associate the variable with the expresion to generate the table
            var lev = dim.getLevel(d.bottomLevel);
            varcolumns.push({
                colvar:lmi.substr(1), 
                colname:dim.getLevel(d.bottomLevel).name,
                collevel:dimBottomLevel
            });
        }
    });//end processing dimensions

    sparqlstr = sparqlSLICE.toString(false);
    ////console.log("QUERY in qb4olap-operators: "+sparqlStr);

    var query = {sparqlquery:sparqlstr, columns:varcolumns.concat(meascolumns)};
    
    return query;
}


//pre: datacube is the cube structure, simplequery is a simplified QL query that does not contain DICE ops.
//post: returns a SPARQL query that implements a QL query 
function getIPOSliceSparqlQuery(endpoint, datacube, simplequery, optimize){
    
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
    datacube.measures.forEach(function(m){
        //if exists, get the only SLICE on that measure
        var sm = simplequery.query.filter(function(oper){
            return (oper.measure == m.uri && oper.qloperator == "SLICE");
        });

        //if doesnt exist a SLICE
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
            meascolumns.push({
                colvar:agi.substr(1),
                colname:m.aggfunc+"("+m.name+")",
                colmeas:m.uri
            });
        }
    });


    //PROCESS DIMENSIONS
    datacube.dimensions.forEach(function(d){
        var dim = new Dimension(d.uri, d.name, d.levels, d.hierarchies, d.bottomLevel);
        
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
            var dimBottomLevel = dim.getBottomLevel();
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
            ////console.log("ROLLUP: "+util.inspect(rollup, { showHidden: false, depth: null, colors:true }));
            var targetLevel = rollup.targetLevel;
            var bottomLevel = rollup.bottomLevel;

            if (bottomLevel != targetLevel){
                //find the longest path between this 2 levels
                var levelPath = dim.getLongestPath(bottomLevel, targetLevel);
                ////console.log("------longest PATH: "+util.inspect(levelPath, { showHidden: false, depth: null, colors:true }));
                levelPath.path.forEach(function(actual){
                    ////console.log("------qb4olap-operators   actualnode: "+util.inspect(actual, { showHidden: false, depth: null, colors:true }));
                    var actualLevel = actual.level;
                    var parentLevel = actual.parent;
                    var actualRollup = "<"+actual.rollupfunction+">";
                    var plmi = sparqlIPO.getNewVariable(parentLevelMemSeed, parentLevelMemCounter);

                    if (parentLevel != targetLevel) {
                        parentLevelMemCounter++;
                    }
                    if (optimize){
                        sparqlIPO.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                    }else{
                        sparqlIPO.addPattern(lmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                    };
                    //only add rollup if target level is not reached    
                    if(actualLevel != targetLevel){ 
                        if (optimize){
                            sparqlIPO.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,actualRollup,plmi);
                        }else{
                            sparqlIPO.addPattern(lmi,actualRollup,plmi);
                        };
                    };
                    lmi = plmi;

                    if(actualLevel == targetLevel){
                        sparqlIPO.addVariableToResult(plmi);
                        sparqlIPO.addVariableToGroupBy(plmi);
                        //associate the variable with the expresion to generate the table
                        varcolumns.push({
                            colvar:plmi.substr(1), 
                            colname:dim.getLevel(actualLevel).name,
                            dimension:dim.uri
                        });
                    }
                }); //end traversing path

            //rollup from bottom to bottom
            }else{
                sparqlIPO.addVariableToResult(lmi);
                //associate the variable with the expresion to generate the table
                varcolumns.push({
                    colvar:lmi.substr(1), 
                    colname:dim.getLevel(dim.getBottomLevel()).name,
                    dimension:dim.uri
                });
                sparqlIPO.addVariableToGroupBy(lmi);
            }
        //doesnt exist a rollup or a slice on this dimension    
        }else if (r.length==0 && s.length==0){
            sparqlIPO.addVariableToResult(lmi);
            //associate the variable with the expresion to generate the table
            varcolumns.push({
                colvar:lmi.substr(1), 
                colname:dim.getLevel(dim.getBottomLevel()).name,
                dimension:dim.uri
            });
            sparqlIPO.addVariableToGroupBy(lmi);
        }
    });//end processing dimensions

    sparqlstr = sparqlIPO.toString(false);
    ////console.log("QUERY in qb4olap-operators: "+sparqlstr);

    var query = {sparqlquery:sparqlstr, columns:varcolumns.concat(meascolumns)};

    return query;
}

//pre: datacube is the cube structure, simplequery is a simplified QL query with patter (DICE)*(ROLLUP)*(DICE)*
//post: returns a SPARQL query that implements a QL query 
function getRollupDiceSparqlQuery(endpoint, datacube, simplequery, optimize){
    
    var sparqlOUTER =  new SPARQLquery([],"select",[],[],[],[],'');
    var sparqlINNER =  new SPARQLquery([],"select",[],[],[],[],'');
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


    var firstdices =[];
    var rollups =[];
    var lastdices =[];

    splitRollup(simplequery.query, firstdices, rollups,lastdices);
    if (optimize){
        sparqlINNER.addPatternToGroup("o",true, "?o","a","qb:Observation");
        sparqlINNER.addPatternToGroup("o",true, "?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    }else{
        sparqlINNER.addPattern("?o","a","qb:Observation");
        sparqlINNER.addPattern("?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    };


    sparqlINNER.addFrom(datacube.instancegraph);                      
    sparqlINNER.addFrom(datacube.schemagraph);

    //PROCESS MEASURES
    datacube.measures.forEach(function(m){
        var mi = sparqlINNER.getNewVariable(measureSeed, measureCounter);
        measureCounter++;
        
        //link observations with measure values
        if (optimize){
            sparqlINNER.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(m.uri),mi);
        }else{
            sparqlINNER.addPattern("?o",escapeAbsoluteIRI(m.uri),mi);
        };
        //if exists a ROLLUP add the aggregation function to the result
        //also add cast, else add the measure variable
        if(rollups.length>0){
            var agi = sparqlINNER.getNewVariable(agSeed, agCounter);
            agCounter++;
            var measuretype = m.datatype;
            if (measuretype){
                sparqlINNER.addExpresionToResult("("+m.aggfunc+"(<"+measuretype+">("+mi+")) as "+agi+")");    
            }else{
                sparqlINNER.addExpresionToResult("("+m.aggfunc+"("+mi+") as "+agi+")");
            }
            //add the calculated var to the inner and outer query
            sparqlINNER.addVariableToResult(agi);
            sparqlOUTER.addVariableToResult(agi);
            
            //associate the variable with the expresion to generate the table
            meascolumns.push({
                colvar:agi.substr(1), 
                colname:m.aggfunc+"("+m.name+")",
                colmeas:m.uri
            });
        }else{
            //add the measure var to the inner and outer query
            sparqlINNER.addVariableToResult(mi);
            sparqlOUTER.addVariableToResult(mi);
            
            //associate the variable with the expresion to generate the table
            meascolumns.push({
                colvar:mi.substr(1), 
                colname:m.name,
                colmeas:m.uri
            });

        }
    });


    //PROCESS DIMENSIONS
    datacube.dimensions.forEach(function(d){
        var dim = new Dimension(d.uri, d.name, d.levels, d.hierarchies, d.bottomLevel);
        
        //if exists, get the only ROLLUP on that dimension
        var r = rollups.filter(function(oper){
            return (oper.dimension == dim.uri && oper.qloperator == "ROLLUP");
        });

        //keep the dimension due to the possible dice
        var lmi = sparqlINNER.getNewVariable(levelMemSeed, levelMemCounter);
        levelMemCounter++;
        //get the bottom level in the dimension
        var dimBottomLevel = dim.getBottomLevel();
        //link observations with values at the bottomLevel
        if (optimize){
            sparqlINNER.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
        }else{
            sparqlINNER.addPattern("?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
        };       
        
        
        //exists a rollup on this dimension
        if (r.length>0 ){
            var rollup = r[0];
            ////console.log("ROLLUP: "+util.inspect(rollup, { showHidden: false, depth: null, colors:true }));
            var targetLevel = rollup.targetLevel;
            var bottomLevel = rollup.bottomLevel;
            
            if (bottomLevel != targetLevel){
            //find the longest path between this 2 levels
                var levelPath = dim.getLongestPath(bottomLevel, targetLevel);

                levelPath.path.forEach(function(actual){
                    //console.log("------qb4olap-operators   actualnode: "+util.inspect(actual, { showHidden: false, depth: null, colors:true }));
                    var actualLevel = actual.level;
                    var parentLevel = actual.parent;
                    var actualRollup = "<"+actual.rollupfunction+">";
                    var plmi = sparqlOUTER.getNewVariable(parentLevelMemSeed, parentLevelMemCounter);

                    if (parentLevel != targetLevel) {
                        parentLevelMemCounter++;
                    }
                    if (optimize){
                        sparqlINNER.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                    }else{
                        sparqlINNER.addPattern(lmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                    };

                    //only add rollup if target level is not reached    
                    if(actualLevel != targetLevel){ 
                        if (optimize){
                            sparqlINNER.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,actualRollup,plmi);
                        }else{
                            sparqlINNER.addPattern(lmi,actualRollup,plmi);
                        };
                    };
                    lmi = plmi;

                    if(actualLevel == targetLevel){
                        sparqlINNER.addVariableToResult(plmi);
                        sparqlINNER.addVariableToGroupBy(plmi);
                        //add variable to outer query in case the outer query is needed
                        sparqlOUTER.addVariableToResult(plmi);
                        //associate the variable with the expresion to generate the table
                        varcolumns.push({
                            colvar:plmi.substr(1), 
                            colname:dim.getLevel(actualLevel).name,
                            collevel:dim.getLevel(actualLevel).uri,
                            dimension:dim.uri
                        });
                    }
                });
        //rollup from bottom to bottom
        }else{
            sparqlINNER.addVariableToResult(lmi);
            //add variable to outer query
            sparqlOUTER.addVariableToResult(lmi);
            //associate the variable with the expresion to generate the table
            varcolumns.push({
                colvar:lmi.substr(1), 
                colname:dim.getLevel(dim.getBottomLevel()).name,
                collevel:dim.getBottomLevel(),
                dimension:dim.uri
            });
            sparqlINNER.addVariableToGroupBy(lmi);

        }

        //doesnt exist a rollup on this dimension    
        }else {
            sparqlINNER.addVariableToResult(lmi);
            //add variable to outer query
            sparqlOUTER.addVariableToResult(lmi);
            //associate the variable with the expresion to generate the table
            varcolumns.push({
                colvar:lmi.substr(1), 
                colname:dim.getLevel(dim.getBottomLevel()).name,
                collevel:dim.getBottomLevel(),
                dimension:dim.uri
            });
            sparqlINNER.addVariableToGroupBy(lmi);
        }
    });//end processing dimensions

    //create the filter conditions for each dice in the first group and add patterns
    firstdices.forEach(function(dice){
        var seed = 1;
        var resdice = {bgps : []};
        getFilterFromDice(dice.dicecondition,datacube,varcolumns,meascolumns,seed,resdice);
        ////console.log("dice condition:");
        ////console.log(util.inspect(dice.dicecondition, { showHidden: false, depth: null, colors:true }));
        ////console.log("filter from dice:");
        ////console.log(util.inspect(resdice, { showHidden: false, depth: null, colors:true }));
        seed ++;
        sparqlINNER.addFilter(resdice.filtr);
        resdice.bgps.forEach(function(b){
            if (! sparqlINNER.existsPattern(b.s, b.p, b.o)){
                ////console.log("bgp:");
                ////console.log(util.inspect(b, { showHidden: false, depth: null, colors:true }));
                sparqlINNER.addPattern(b.s, b.p, b.o);
            }
        });
    });

    //create the filter conditions for each dice in the second group and add patterns
    lastdices.forEach(function(dice){
        var seed = 1;
        var resdice = {bgps : []};
        getFilterFromDice(dice.dicecondition,datacube,varcolumns,meascolumns,seed,resdice);
        ////console.log("dice condition:");
        ////console.log(util.inspect(dice.dicecondition, { showHidden: false, depth: null, colors:true }));
        ////console.log("filter from dice:");
        ////console.log(util.inspect(resdice, { showHidden: false, depth: null, colors:true }));
        seed ++;
        sparqlOUTER.addFilter(resdice.filtr);
        resdice.bgps.forEach(function(b){
            if (! sparqlOUTER.existsPattern(b.s, b.p, b.o)){
                ////console.log("bgp:");
                ////console.log(util.inspect(b, { showHidden: false, depth: null, colors:true }));
                sparqlOUTER.addPattern(b.s, b.p, b.o);
            }
        });
    });

    //in this case we need an outer query to implement the second set of dices, 
    //while inner query implements rollups and the first set of dices
    if(lastdices.length>0){
        sparqlOUTER.addPrefix("qb","http://purl.org/linked-data/cube#");
        sparqlOUTER.addPrefix("qb4o","http://purl.org/qb4olap/cubes#");
        sparqlOUTER.addPrefix("skos","http://www.w3.org/2004/02/skos/core#");
        sparqlOUTER.addSubquery(sparqlINNER);
        sparqlstr = sparqlOUTER.toString(false);
    }else{
        sparqlINNER.addPrefix("qb","http://purl.org/linked-data/cube#");
        sparqlINNER.addPrefix("qb4o","http://purl.org/qb4olap/cubes#");
        sparqlINNER.addPrefix("skos","http://www.w3.org/2004/02/skos/core#");
        sparqlstr = sparqlINNER.toString(false);
    }

    //console.log("QUERY in qb4olap-operators: "+sparqlStr);
    var query = {sparqlquery:sparqlstr, columns:varcolumns.concat(meascolumns)};

    return query;
}


//pre: datacube is the cube structure, simplequery is a simplified QL query with pattern (SLICE|DICE)* (ROLLUP)* (SLICE|DICE)*
//hasdiceovermeasure indicates if exists a dice operation over a measure
//post: returns a SPARQL query that implements a QL query 
function getRollupSliceDiceSparqlQuery(endpoint, datacube, simplequery, hasdiceovermeasure,optimize){
    
    var sparqlOUTER =  new SPARQLquery([],"select",[],[],[],[],'');
    var sparqlINNER =  new SPARQLquery([],"select",[],[],[],[],'');
    var sparqlStr;
    var meascolumns = [];
    var varcolumns = [];
    var innervarcolumns = [];
    var innermeascolumns = [];

   //the seeds for variable generation and the counters
    var levelMemSeed = "lm";
    var levelMemCounter = 1;

    var parentLevelMemSeed = "plm";
    var parentLevelMemCounter = 1;

    var measureSeed = "m";
    var measureCounter = 1;
    var agSeed = "ag";
    var agCounter = 1;

    var firstops =[];
    var rollups =[];
    var lastops =[];

    splitRollupWSlice(simplequery.query, firstops, rollups,lastops);

    if(hasdiceovermeasure){
        sparqlOUTER.addPrefix("qb","http://purl.org/linked-data/cube#");
        sparqlOUTER.addPrefix("qb4o","http://purl.org/qb4olap/cubes#");
        sparqlOUTER.addPrefix("skos","http://www.w3.org/2004/02/skos/core#");
    }else{
        sparqlINNER.addPrefix("qb","http://purl.org/linked-data/cube#");
        sparqlINNER.addPrefix("qb4o","http://purl.org/qb4olap/cubes#");
        sparqlINNER.addPrefix("skos","http://www.w3.org/2004/02/skos/core#");
    }

    //console.log("FIRSTOPS:" +util.inspect(firstops, { showHidden: false, depth: null, colors:true }));
    //console.log("LASTOPS:" +util.inspect(lastops, { showHidden: false, depth: null, colors:true }));

    if (optimize){
        sparqlINNER.addPatternToGroup("o",true, "?o","a","qb:Observation");
        sparqlINNER.addPatternToGroup("o",true, "?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    }else{
        sparqlINNER.addPattern("?o","a","qb:Observation");
        sparqlINNER.addPattern("?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    };

    sparqlINNER.addFrom(datacube.instancegraph);                      
    sparqlINNER.addFrom(datacube.schemagraph);


    //PROCESS MEASURES
    datacube.measures.forEach(function(m){
        //if exists, get the only SLICE on that measure in the first set of operations
        var sm_inner = firstops.filter(function(oper){
            return (oper.measure == m.uri && oper.qloperator == "SLICE");
        });

        var sm_outer = lastops.filter(function(oper){
            return (oper.measure == m.uri && oper.qloperator == "SLICE");
        });
        //console.log("FIRSTSLICES:" +util.inspect(sm_inner, { showHidden: false, depth: null, colors:true }));
        //console.log("LASTSLICES:" +util.inspect(sm_outer, { showHidden: false, depth: null, colors:true }));

        //allways add the triples that retrieve the values of measures.        
        var mi = sparqlINNER.getNewVariable(measureSeed, measureCounter);
        measureCounter++;
        
        //link observations with measure values
        if (optimize){
            sparqlINNER.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(m.uri),mi);
        }else{
            sparqlINNER.addPattern("?o",escapeAbsoluteIRI(m.uri),mi);
        };
        innermeascolumns.push({
                    colvar:mi.substr(1), 
                    colname:m.name,
                    colmeas:m.uri

        });
        //if there is no slice, the measure should be included in both results.
        //if there is a slice in the second set, the measure should be out of the result of the outer
        //query only.

        if (sm_inner.length == 0 ){
            //add the aggregation function to the result
            //also add cast
            var agi = sparqlINNER.getNewVariable(agSeed, agCounter);
            agCounter++;
            var measuretype = m.datatype;
            if (measuretype){
                sparqlINNER.addExpresionToResult("("+m.aggfunc+"(<"+measuretype+">("+mi+")) as "+agi+")");    
            }else{
                sparqlINNER.addExpresionToResult("("+m.aggfunc+"("+mi+") as "+agi+")");
            };
            if(sm_outer.length == 0){
                if(hasdiceovermeasure){
                    //add the calculated var to the outer query
                    sparqlOUTER.addVariableToResult(agi);
                }
                
                //associate the variable with the expresion to generate the table
                meascolumns.push({
                    colvar:agi.substr(1), 
                    colname:m.aggfunc+"("+m.name+")",
                    colmeas:m.uri
                });    
            };   
        }
    });


    //PROCESS DIMENSIONS
    datacube.dimensions.forEach(function(d){
        var dim = new Dimension(d.uri, d.name, d.levels, d.hierarchies, d.bottomLevel);
        
        //if exists, get the only ROLLUP on that dimension
        var r = simplequery.query.filter(function(oper){
            return (oper.dimension == dim.uri && oper.qloperator == "ROLLUP");
        });

        //if exists, get the only SLICE on that dimension in the first set of operations
        var sd_inner = firstops.filter(function(oper){
             return (oper.dimension == dim.uri && oper.qloperator == "SLICE");
        });

        var sd_outer = lastops.filter(function(oper){
             return (oper.dimension == dim.uri && oper.qloperator == "SLICE");
        });

        //if there is no slice, the dimension should be included in both results.
        //if there is a slice in the second set, the dimension should be out of the result of the outer
        //query only.
        //if there is a slice in the first set, the dimension should not be considered

        if (sd_inner.length == 0){
            //keep the dimension, even if a slice exists, due to the possible dice
            var lmi = sparqlINNER.getNewVariable(levelMemSeed, levelMemCounter);
            levelMemCounter++;
            //get the bottom level in the dimension
            var dimBottomLevel = dim.bottomLevel;
            //link observations with values at the bottomLevel
            if (optimize){
                sparqlINNER.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
            }else{
                sparqlINNER.addPattern("?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
            };       
         
            //exists a rollup on this dimension 
            if (r.length>0 ){
                var rollup = r[0];
                //console.log("ROLLUP: "+util.inspect(rollup, { showHidden: false, depth: null, colors:true }));
                var targetLevel = rollup.targetLevel;
                var bottomLevel = rollup.bottomLevel;      
                if (bottomLevel != targetLevel){
                //find the longest path between this 2 levels
                    var levelPath = dim.getLongestPath(bottomLevel, targetLevel);
                    //console.log("------qb4olap-operators   path: "+util.inspect(levelPath, { showHidden: false, depth: null, colors:true }));
                    levelPath.path.forEach(function(actual){
                        ////console.log("------qb4olap-operators   actualnode: "+util.inspect(actual, { showHidden: false, depth: null, colors:true }));
                        var actualLevel = actual.level;
                        var parentLevel = actual.parent;
                        var actualRollup = "<"+actual.rollupfunction+">";
                        var plmi;
                        if(hasdiceovermeasure){
                            plmi = sparqlOUTER.getNewVariable(parentLevelMemSeed, parentLevelMemCounter);
                        }else{
                            plmi = sparqlINNER.getNewVariable(parentLevelMemSeed, parentLevelMemCounter);
                        }

                        if (parentLevel != targetLevel) {
                            parentLevelMemCounter++;
                        }
                        if (optimize){
                            sparqlINNER.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                        }else{
                            sparqlINNER.addPattern(lmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                        };

                        //only add rollup if target level is not reached    
                        if(actualLevel != targetLevel){ 
                            if (optimize){
                                sparqlINNER.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,actualRollup,plmi);
                            }else{
                                sparqlINNER.addPattern(lmi,actualRollup,plmi);
                            };
                        };
                        lmi = plmi;

                        if(actualLevel == targetLevel){
                            //if there isn't a slice in the second group, add the variable to the outer query    
                            if (sd_outer.length == 0){
                                sparqlINNER.addVariableToResult(plmi);
                                sparqlINNER.addVariableToGroupBy(plmi);

                                if(hasdiceovermeasure){
                                    //add variable to outer query
                                    sparqlOUTER.addVariableToResult(plmi);
                                }
                                //associate the variable with the expresion to generate the table
                                varcolumns.push({
                                    colvar:plmi.substr(1), 
                                    colname:dim.getLevel(actualLevel).name,
                                    collevel:dim.getLevel(actualLevel).uri,
                                    dimension:dim.uri
                                });
                            }else{
                                
                                    innervarcolumns.push({
                                        colvar:plmi.substr(1), 
                                        colname:dim.getLevel(actualLevel).name,
                                        collevel:dim.getLevel(actualLevel).uri,
                                        dimension:dim.uri
                                    });
                                
                            }
                        }
                    });
                //rollup from bottom to bottom
                }else{
                    //add variable to outer query
                    if(sd_outer.length == 0){
                        sparqlINNER.addVariableToResult(lmi);
                        sparqlINNER.addVariableToGroupBy(lmi);
                        if(hasdiceovermeasure){
                            sparqlOUTER.addVariableToResult(lmi);
                        }
                        //associate the variable with the expresion to generate the table
                        varcolumns.push({
                            colvar:lmi.substr(1), 
                            colname:dim.getLevel(dim.getBottomLevel()).name,
                            collevel:dim.getBottomLevel(),
                            dimension:dim.uri
                        });
                    }else{
                        
                            innervarcolumns.push({
                                colvar:lmi.substr(1), 
                                colname:dim.getLevel(dim.getBottomLevel()).name,
                                collevel:dim.getBottomLevel(),
                                dimension:dim.uri
                            });
                        
                    }
                }
            //doesnt exist a rollup on this dimension    
            }else{
                

                //if there isn't a slice in the second group, add the variable to the outer query    
                if (sd_outer.length == 0){
                    sparqlINNER.addVariableToResult(lmi);
                    sparqlINNER.addVariableToGroupBy(lmi);
                    if(hasdiceovermeasure){
                        sparqlOUTER.addVariableToResult(lmi);
                    }
                    //associate the variable with the expresion to generate the table
                    varcolumns.push({
                        colvar:lmi.substr(1), 
                        colname:dim.getLevel(dim.getBottomLevel()).name,
                        collevel:dim.getBottomLevel(),
                        dimension:dim.uri
                    });
                }else{
                    innervarcolumns.push({
                            colvar:lmi.substr(1), 
                            colname:dim.getLevel(dim.getBottomLevel()).name,
                            collevel:dim.getBottomLevel(),
                            dimension:dim.uri
                        });
                }
            }
        }
    });//end processing dimensions

    //create the filter conditions for each dice and add patterns
    var firstdices = firstops.filter(function(oper){
        return (oper.qloperator == "DICE");
    });

    var lastdices = lastops.filter(function(oper){
        return (oper.qloperator == "DICE");
    });

    alldimvars = innervarcolumns.concat(varcolumns);
    allmeasvars = innermeascolumns.concat(meascolumns);
    //create the filter conditions for each dice in the first group and add patterns
    firstdices.forEach(function(dice){
        var seed = 1;
        var resdice = {bgps : []};
        getFilterFromDice(dice.dicecondition,datacube,alldimvars,allmeasvars,seed,resdice);
        
        ////console.log("dice condition:");
        ////console.log(util.inspect(dice.dicecondition, { showHidden: false, depth: null, colors:true }));
        ////console.log("filter from dice:");
        ////console.log(util.inspect(resdice, { showHidden: false, depth: null, colors:true }));
        seed ++;
        sparqlINNER.addFilter(resdice.filtr);
        resdice.bgps.forEach(function(b){
            if (! sparqlINNER.existsPattern(b.s, b.p, b.o)){
                ////console.log("bgp:");
                ////console.log(util.inspect(b, { showHidden: false, depth: null, colors:true }));
                sparqlINNER.addPattern(b.s, b.p, b.o);
            }
        });
    });

    //create the filter conditions for each dice in the second group and add patterns
    lastdices.forEach(function(dice){
        var seed = 1;
        var resdice = {bgps : []};
        
        //console.log("dice condition:");
        //console.log(util.inspect(dice.dicecondition, { showHidden: false, depth: null, colors:true }));
        getFilterFromDice(dice.dicecondition,datacube,alldimvars,allmeasvars,seed,resdice);
        
        //console.log("filter from dice:");
        //console.log(util.inspect(resdice, { showHidden: false, depth: null, colors:true }));
        seed ++;
        if(hasdiceovermeasure){
            sparqlOUTER.addFilter(resdice.filtr);
        }else{
            sparqlINNER.addFilter(resdice.filtr);
        }
        resdice.bgps.forEach(function(b){
            if (hasdiceovermeasure && !sparqlOUTER.existsPattern(b.s, b.p, b.o)){
                ////console.log("bgp:");
                ////console.log(util.inspect(b, { showHidden: false, depth: null, colors:true }));
                sparqlOUTER.addPattern(b.s, b.p, b.o);
            }else if(!hasdiceovermeasure && !sparqlINNER.existsPattern(b.s, b.p, b.o)){
                sparqlINNER.addPattern(b.s, b.p, b.o);
            }
        });
    });

    if(hasdiceovermeasure){
        sparqlOUTER.addSubquery(sparqlINNER);
        sparqlstr = sparqlOUTER.toString(false);        
    }else{
        sparqlstr = sparqlINNER.toString(false);
    }

    

    //console.log("QUERY in qb4olap-operators: "+sparqlStr);
    var query = {sparqlquery:sparqlstr, columns:varcolumns.concat(meascolumns)};
    return query;
}


//pre: datacube is the cube structure, simplequery is a simplified QL query that contains all the 
//ops except dice over measures
//post: returns a SPARQL query that implements a QL query 
function getFullNoDiceMeasureSparqlQuery(endpoint, datacube, simplequery,optimize){
    
    var sparqlINNER =  new SPARQLquery([],"select",[],[],[],[],'');
    var sparqlStr;
    var meascolumns = [];
    var varcolumns = [];
    var innervarcolumns = [];

   //the seeds for variable generation and the counters
    var levelMemSeed = "lm";
    var levelMemCounter = 1;

    var parentLevelMemSeed = "plm";
    var parentLevelMemCounter = 1;

    var measureSeed = "m";
    var measureCounter = 1;
    var agSeed = "ag";
    var agCounter = 1;

    sparqlINNER.addPrefix("qb","http://purl.org/linked-data/cube#");
    sparqlINNER.addPrefix("qb4o","http://purl.org/qb4olap/cubes#");
    sparqlINNER.addPrefix("skos","http://www.w3.org/2004/02/skos/core#");
    

    if (optimize){
        sparqlINNER.addPatternToGroup("o",true, "?o","a","qb:Observation");
        sparqlINNER.addPatternToGroup("o",true, "?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    }else{
        sparqlINNER.addPattern("?o","a","qb:Observation");
        sparqlINNER.addPattern("?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    };

    sparqlINNER.addFrom(datacube.instancegraph);                      
    sparqlINNER.addFrom(datacube.schemagraph);


    //PROCESS MEASURES
    datacube.measures.forEach(function(m){
        //if exists, get the only SLICE on that measure in the first set of operations
        var sm = simplequery.query.filter(function(oper){
            return (oper.measure == m.uri && oper.qloperator == "SLICE");
        });

        //allways add the triples that retrieve the values of measures.        
        var mi = sparqlINNER.getNewVariable(measureSeed, measureCounter);
        measureCounter++;
        
        //link observations with measure values
        if (optimize){
            sparqlINNER.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(m.uri),mi);
        }else{
            sparqlINNER.addPattern("?o",escapeAbsoluteIRI(m.uri),mi);
        };
        
        //if there is no slice, the measure should be in the result.    

        if (sm.length == 0 ){
            //add the aggregation function to the result
            //also add cast
            var agi = sparqlINNER.getNewVariable(agSeed, agCounter);
            agCounter++;
            var measuretype = m.datatype;
            if (measuretype){
                sparqlINNER.addExpresionToResult("("+m.aggfunc+"(<"+measuretype+">("+mi+")) as "+agi+")");    
            }else{
                sparqlINNER.addExpresionToResult("("+m.aggfunc+"("+mi+") as "+agi+")");
            };    
            //associate the variable with the expresion to generate the table
            meascolumns.push({
                colvar:agi.substr(1), 
                colname:m.aggfunc+"("+m.name+")",
                colmeas:m.uri
            });      
        }
    });


    //PROCESS DIMENSIONS
    datacube.dimensions.forEach(function(d){
        var dim = new Dimension(d.uri, d.name, d.levels, d.hierarchies, d.bottomLevel);
        
        //if exists, get the ROLLUPS and DRILLDOWNS on that dimension
        var r = simplequery.query.filter(function(oper){
            return (oper.dimension == dim.uri && (oper.qloperator == "ROLLUP" ||oper.qloperator == "DRILLDOWN") );
        });

        //if exists, get the only SLICE on that dimension 
        var sd = simplequery.query.filter(function(oper){
             return (oper.dimension == dim.uri && oper.qloperator == "SLICE");
        });

        //if exists, get the atomic DICES on that dimension 
        var dd = simplequery.query.filter(function(oper){
             return (oper.qloperator == "DICE" && oper.dicecondition.args[0].dimension == dim.uri);
        });  

        var dlevels = [];
        dd.forEach(function(dice){
            dlevels.push(dice.dicecondition.args[0].level);
        });      

        var lmi = sparqlINNER.getNewVariable(levelMemSeed, levelMemCounter);
                   
        levelMemCounter++;
        //get the bottom level in the dimension
        var dimBottomLevel = dim.bottomLevel;
        //link observations with values at the bottomLevel

        
        if (optimize){
            sparqlINNER.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
        }else{
            sparqlINNER.addPattern("?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
        };   
    
           
     
        /*
        find the resulting level from IPOs (the last)
        find the further level from dices
        add bgps to reach the max, but add the variable that corresponds to IPOs last to result
        */
        //exist IPOs on this dimension
        if (r.length>0 ){
            var bottomLevel = dim.bottomLevel;
            var targetLevel = r[r.length-1].level;
            dlevels.push(targetLevel);

            //console.log(dlevels);
            var diceMaxLevel = dim.getMaxLevel(dlevels);
            //console.log("MAX level:"+diceMaxLevel);
            //find the longest path between this 2 levels
            var levelPath = dim.getLongestPath(bottomLevel, diceMaxLevel);
            //console.log("------qb4olap-operators   path: "+util.inspect(levelPath, { showHidden: false, depth: null, colors:true }));
            levelPath.path.forEach(function(actual){
                ////console.log("------qb4olap-operators   actualnode: "+util.inspect(actual, { showHidden: false, depth: null, colors:true }));
                var actualLevel = actual.level;
                var parentLevel = actual.parent;
                var actualRollup = "<"+actual.rollupfunction+">";
                var plmi;
                
                plmi = sparqlINNER.getNewVariable(parentLevelMemSeed, parentLevelMemCounter);
                
                //need to keep the variables to create dice conditions later
                innervarcolumns.push({
                    colvar:lmi.substr(1), 
                    colname:dim.getLevel(actualLevel).name,
                    collevel:dim.getLevel(actualLevel).uri,
                    dimension:dim.uri
                });
                if (optimize){
                    sparqlINNER.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                }else{
                    sparqlINNER.addPattern(lmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                };

                //only add rollup if max level is not reached    
                if(actualLevel != diceMaxLevel){ 
                    parentLevelMemCounter++;
                    if (optimize){
                        sparqlINNER.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,actualRollup,plmi);
                    }else{
                        sparqlINNER.addPattern(lmi,actualRollup,plmi);
                    };
                };
                

                if(actualLevel == targetLevel){
                    //if there isn't a slice add the variable to the result
                    if(sd.length==0){  
                        sparqlINNER.addVariableToResult(lmi);
                        sparqlINNER.addVariableToGroupBy(lmi);
                        //associate the variable with the expresion to generate the table
                        varcolumns.push({
                            colvar:lmi.substr(1), 
                            colname:dim.getLevel(actualLevel).name,
                            collevel:dim.getLevel(actualLevel).uri,
                            dimension:dim.uri
                        });
                        innervarcolumns.push({
                            colvar:lmi.substr(1), 
                            colname:dim.getLevel(actualLevel).name,
                            collevel:dim.getLevel(actualLevel).uri,
                            dimension:dim.uri
                        });
                    }
                }
                lmi = plmi;
            });
        //r.lenght == 0, rollup from bottom to bottom
        }else{
            //add variable to query if there is a dice or there is no slice
            if(dd.length != 0 || sd.length == 0){                   
                //need to keep the variables to create dice conditions later
                innervarcolumns.push({
                    colvar:lmi.substr(1), 
                    colname:dim.getLevel(dimBottomLevel).name,
                    collevel:dimBottomLevel,
                    dimension:dim.uri
                });
            }
            if(sd.length == 0){   
                sparqlINNER.addVariableToResult(lmi);
                sparqlINNER.addVariableToGroupBy(lmi);
                //associate the variable with the expresion to generate the table
                varcolumns.push({
                    colvar:lmi.substr(1), 
                    colname:dim.getLevel(dim.getBottomLevel()).name,
                    collevel:dim.getBottomLevel(),
                    dimension:dim.uri
                });
            }
        } //end processing BGPs on dim


        //process dices on dim
        var alldimvars = innervarcolumns.concat(varcolumns);
        //create the filter conditions for each dice in the first group and add patterns
        dd.forEach(function(dice){
            var seed = 1;
            var resdice = {bgps : []};
            getFilterFromDice(dice.dicecondition,datacube,innervarcolumns,[],seed,resdice);
            
            ////console.log("dice condition:");
            ////console.log(util.inspect(dice.dicecondition, { showHidden: false, depth: null, colors:true }));
            ////console.log("filter from dice:");
            ////console.log(util.inspect(resdice, { showHidden: false, depth: null, colors:true }));
            seed ++;
            sparqlINNER.addFilter(resdice.filtr);
            resdice.bgps.forEach(function(b){
                if (! sparqlINNER.existsPattern(b.s, b.p, b.o)){
                    ////console.log("bgp:");
                    ////console.log(util.inspect(b, { showHidden: false, depth: null, colors:true }));
                    sparqlINNER.addPattern(b.s, b.p, b.o);
                }
            });
        });


    });//end processing dimension

    sparqlstr = sparqlINNER.toString(false);

    

    //console.log("QUERY in qb4olap-operators: "+sparqlStr);
    var query = {sparqlquery:sparqlstr, columns:varcolumns.concat(meascolumns)};
    return query;
}
//pre: datacube is the cube structure, simplequery is a simplified QL query that contains DICE ops over measures
// at the end
//post: returns a SPARQL query that implements a QL query 
function getFullSparqlQuery(endpoint, datacube, simplequery, optimize){
    
    var sparqlOUTER =  new SPARQLquery([],"select",[],[],[],[],'');
    var sparqlINNER =  new SPARQLquery([],"select",[],[],[],[],'');
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

    sparqlOUTER.addPrefix("qb","http://purl.org/linked-data/cube#");
    sparqlOUTER.addPrefix("qb4o","http://purl.org/qb4olap/cubes#");
    sparqlOUTER.addPrefix("skos","http://www.w3.org/2004/02/skos/core#");

    if (optimize){
        sparqlINNER.addPatternToGroup("o",true, "?o","a","qb:Observation");
        sparqlINNER.addPatternToGroup("o",true, "?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    }else{
        sparqlINNER.addPattern("?o","a","qb:Observation");
        sparqlINNER.addPattern("?o","qb:dataSet",escapeAbsoluteIRI(datacube.dataset));
    };


    sparqlINNER.addFrom(datacube.instancegraph);                      
    sparqlINNER.addFrom(datacube.schemagraph);

    //PROCESS MEASURES
    datacube.measures.forEach(function(m){
        //if exists, get the only SLICE on that measure
        var sm = simplequery.query.filter(function(oper){
            return (oper.measure == m.uri && oper.qloperator == "SLICE");
        });
        if (sm.length == 0 ){
            var mi = sparqlINNER.getNewVariable(measureSeed, measureCounter);
            measureCounter++;
            var agi = sparqlINNER.getNewVariable(agSeed, agCounter);
            agCounter++;
            //link observations with measure values
            if (optimize){
                sparqlINNER.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(m.uri),mi);
            }else{
                sparqlINNER.addPattern("?o",escapeAbsoluteIRI(m.uri),mi);
            };
            //add the aggregation function to the result
            //also add cast
            var measuretype = m.datatype;
            if (measuretype){
                sparqlINNER.addExpresionToResult("("+m.aggfunc+"(<"+measuretype+">("+mi+")) as "+agi+")");    
            }else{
                sparqlINNER.addExpresionToResult("("+m.aggfunc+"("+mi+") as "+agi+")");
            }
            //add the calculated var to the outer query
            sparqlOUTER.addVariableToResult(agi);
            
            //associate the variable with the expresion to generate the table
            meascolumns.push({
                colvar:agi.substr(1), 
                colname:m.aggfunc+"("+m.name+")",
                colmeas:m.uri
            });
        }
    });


    //PROCESS DIMENSIONS
    datacube.dimensions.forEach(function(d){
        var dim = new Dimension(d.uri, d.name, d.levels, d.hierarchies, d.bottomLevel);
        
        //if exists, get the only ROLLUP on that dimension
        var r = simplequery.query.filter(function(oper){
            return (oper.dimension == dim.uri && oper.qloperator == "ROLLUP");
        });

        //if exists, get the only SLICE on that dimension
        var s = simplequery.query.filter(function(oper){
            return (oper.dimension == dim.uri && oper.qloperator == "SLICE");
        });

        //keep the dimension, even if a slice exists, due to the possible dice
        var lmi = sparqlINNER.getNewVariable(levelMemSeed, levelMemCounter);
        levelMemCounter++;
        //get the bottom level in the dimension
        var dimBottomLevel = dim.getBottomLevel();
        //link observations with values at the bottomLevel
        if (optimize){
            sparqlINNER.addPatternToGroup("o",true,"?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
        }else{
            sparqlINNER.addPattern("?o",escapeAbsoluteIRI(dimBottomLevel),lmi);
        };       
        
        
        //exists a rollup on this dimension and not exists slice
        if (r.length>0 && s.length==0){
            var rollup = r[0];
            ////console.log("ROLLUP: "+util.inspect(rollup, { showHidden: false, depth: null, colors:true }));
            var targetLevel = rollup.targetLevel;
            var bottomLevel = rollup.bottomLevel;
            
            if (bottomLevel != targetLevel){
            //find the longest path between this 2 levels
                var levelPath = dim.getLongestPath(bottomLevel, targetLevel);

                levelPath.path.forEach(function(actual){
                    //console.log("------qb4olap-operators   actualnode: "+util.inspect(actual, { showHidden: false, depth: null, colors:true }));
                    var actualLevel = actual.level;
                    var parentLevel = actual.parent;
                    var actualRollup = "<"+actual.rollupfunction+">";
                    var plmi = sparqlOUTER.getNewVariable(parentLevelMemSeed, parentLevelMemCounter);

                    if (parentLevel != targetLevel) {
                        parentLevelMemCounter++;
                    }
                    if (optimize){
                        sparqlINNER.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                    }else{
                        sparqlINNER.addPattern(lmi,"qb4o:memberOf",escapeAbsoluteIRI(actualLevel));
                    };

                    //only add rollup if target level is not reached    
                    if(actualLevel != targetLevel){ 
                        if (optimize){
                            sparqlINNER.addPatternToGroup(levelMemSeed+levelMemCounter,false,lmi,actualRollup,plmi);
                        }else{
                            sparqlINNER.addPattern(lmi,actualRollup,plmi);
                        };
                    };
                    lmi = plmi;

                    if(actualLevel == targetLevel){
                        sparqlINNER.addVariableToResult(plmi);
                        sparqlINNER.addVariableToGroupBy(plmi);
                        //add variable to outer query
                        sparqlOUTER.addVariableToResult(plmi);
                        //associate the variable with the expresion to generate the table
                        varcolumns.push({
                            colvar:plmi.substr(1), 
                            colname:dim.getLevel(actualLevel).name,
                            collevel:dim.getLevel(actualLevel).uri,
                            dimension:dim.uri
                        });
                    }
                });
        //rollup from bottom to bottom
        }else{
            sparqlINNER.addVariableToResult(lmi);
            //add variable to outer query
            sparqlOUTER.addVariableToResult(lmi);
            //associate the variable with the expresion to generate the table
            varcolumns.push({
                colvar:lmi.substr(1), 
                colname:dim.getLevel(dim.getBottomLevel()).name,
                collevel:dim.getBottomLevel(),
                dimension:dim.uri
            });
            sparqlINNER.addVariableToGroupBy(lmi);

        }

        //doesnt exist a rollup on this dimension    
        }else if (s.length==0){
            sparqlINNER.addVariableToResult(lmi);
            //add variable to outer query
            sparqlOUTER.addVariableToResult(lmi);
            //associate the variable with the expresion to generate the table
            varcolumns.push({
                colvar:lmi.substr(1), 
                colname:dim.getLevel(dim.getBottomLevel()).name,
                collevel:dim.getBottomLevel(),
                dimension:dim.uri
            });
            sparqlINNER.addVariableToGroupBy(lmi);
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
        ////console.log("dice condition:");
        ////console.log(util.inspect(dice.dicecondition, { showHidden: false, depth: null, colors:true }));
        ////console.log("filter from dice:");
        ////console.log(util.inspect(resdice, { showHidden: false, depth: null, colors:true }));
        seed ++;
        sparqlOUTER.addFilter(resdice.filtr);
        resdice.bgps.forEach(function(b){
            if (! sparqlOUTER.existsPattern(b.s, b.p, b.o)){
                ////console.log("bgp:");
                ////console.log(util.inspect(b, { showHidden: false, depth: null, colors:true }));
                sparqlOUTER.addPattern(b.s, b.p, b.o);
            }
        });
    });

    sparqlOUTER.addSubquery(sparqlINNER);
    sparqlstr = sparqlOUTER.toString(false);
    ////console.log("QUERY in qb4olap-operators: "+sparqlStr);

    var query = {sparqlquery:sparqlstr, columns:varcolumns.concat(meascolumns)};

    return query;
}




function getFilterFromDice(dicecondition,datacube,varcolumns,meascolumns,seed,result){
    var operators = ['AND','OR'];
    //console.log("varcolums en getfilterfromdice: "+util.inspect(varcolumns, { showHidden: false, depth: null, colors:true }));
    //console.log("COND: "+util.inspect(dicecondition, { showHidden: false, depth: null, colors:true }));
    if (dicecondition.nodetype == "leaf"){
        if(dicecondition.args[0].condType == "attribute"){
            //find the variables that correspond to this level
            var levelvar = "?"+varcolumns.filter(function(v){
                return (v.collevel == dicecondition.args[0].level && v.dimension== dicecondition.args[0].dimension);
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

            //console.log("attype: "+attype+" operator: "+dicecondition.operator);
            if (attype == "http://www.w3.org/2001/XMLSchema#string" && dicecondition.operator == "="){
                var f = "REGEX ("+membervar+","+dicecondition.args[1]+" , \"i\")";
            }else if (attype == "http://www.w3.org/2001/XMLSchema#string" ){
                var f = " str("+membervar +")"+ dicecondition.operator +dicecondition.args[1];    
            }
            else{
                var f = ""+membervar +" "+ dicecondition.operator +" "+dicecondition.args[1];    
            }
            
            result.filtr = f;
        }else if (dicecondition.args[0].condType == "measure"){
            //find the variable that corresponds to this measure
            
            //console.log("THIS MEASURE: "+dicecondition.args[0].measure);
            //console.log("MEASURES: "+util.inspect(meascolumns, { showHidden: false, depth: null, colors:true }));

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
        ////console.log("dicecondition en existsConditionOverMeasure");
        //////console.log(util.inspect(dicecondition, { showHidden: false, depth: null, colors:true }));

    if (dicecondition.nodetype == "internal"){
        var recCall = dicecondition.args.map(existsConditionOverMeasure);
        ////console.log("dice checks array: "+recCall);
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

//Receives a query that corresponds to this regular expression (DICE)* (ROLLUP)* (DICE)*  
//and splits it in three parts

function splitRollup(query, firstdices, rollups, lastdices) {

    var rupfound = false;
    var lastdicesfound = false;

    query.forEach(function(o){
        if (o.qloperator == "ROLLUP" && !lastdicesfound){
            rollups.push(o);
            rupfound = true;
        };
        if (o.qloperator == "DICE" && rupfound){
            lastdices.push(o);
            lastdicesfound = true;
        };
        if(!rupfound && !lastdicesfound){
            firstdices.push(o);
        }
    });
    
}

//Receives a query that corresponds to this regular expression (DICE|SLICE)* (ROLLUP)* (DICE|SLICE)*  
//and splits it in three parts

function splitRollupWSlice(query, firstops, rollups, lastops) {

    var rupfound = false;
    var lastopsfound = false;

    query.forEach(function(o){
        if (o.qloperator == "ROLLUP" && !lastopsfound){
            rollups.push(o);
            rupfound = true;
        };
        if ( (o.qloperator == "DICE" || o.qloperator == "SLICE" ) && rupfound){
            lastops.push(o);
            lastopsfound = true;
        };
        if(!rupfound && !lastopsfound){
            firstops.push(o);
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

//Receives a dice condition and returns two lists of atomic DICE operations. One that contains operations exclusively
//on level and the other that refers to measures

function splitDiceAtoms(dicecondition, statement, dicemeasurelist, dicelevellist) {

    var newDICE = new Object();   
        newDICE.statement = statement;
        newDICE.qloperator = "DICE"; 
        newDICE.source = ""; 
    if (dicecondition.nodetype=='leaf'){     
        newDICE.dicecondition = dicecondition;
    }
    else{
        newDICE.dicecondition = dicecondition.args[0];
        splitDiceAtoms(dicecondition.args[1], statement, dicemeasurelist, dicelevellist);  
    }

    if(existsConditionOverMeasure(newDICE.dicecondition)){
        dicemeasurelist.unshift(newDICE);}
    else{ 
        dicelevellist.unshift(newDICE);
    }
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

    var rup = false;
    var ddw = false;
    var slc = false;
    var dic = false;
    var dicm = false;
    var dicl = false;
    var ipo = false;

    var ret = null;

    inputquery.query.forEach(function(row){
        //console.log("ROW:" +util.inspect(row, { showHidden: false, depth: null, colors:true }));
        if (row.qloperator == "ROLLUP") {rup= rup||true};
        if (row.qloperator == "DRILLDOWN") {ddw= ddw||true};
        if (row.qloperator == "SLICE") {slc=slc||true};
        if (row.qloperator == "DICE") {
            dic=dic||true;
            //all the queries that contains only dice over members can be simpler.
            dicm = existsConditionOverMeasure(row.dicecondition)||dicm;
        };
    });

    dicl = dic && !dicm;
    ipo = rup || ddw;

/*
    console.log("RUP "+rup);
    console.log("DDW "+ddw);
    console.log("SLC "+slc);
    console.log("DICL "+dicl);
    console.log("DICM "+dicm);
*/

    //not valid query
    if ((!rup && ddw) || (!rup && !ddw && !slc && !dic)){ return 0;}


    //GROUP 1
    //RUP + SLICE + DICE
    if (rup && !ddw && slc && dic) {
        if (dicm) {return 5}
        else {return 6
            //51
        }
    };
    //RUP + DICE
    if (((!rup && !ddw)||(rup && !ddw)) && (!slc && dic) ) {
        if (dicm) {return 4}
        else {return 41}
    };

    //GROUP 2
    //IPO only
    if (rup && !slc && !dic) { return 1;}; 
    //SLICE only
    if ( !rup && !ddw && slc && !dic) {return 2;};
    //IPO +SLICE
    if ( rup && slc && !dic) {return 3;};


    //GROUP 3 levels
    //RUP + DDOWN +SLICE + DICEL
    if (rup && ddw && dicl ) {return 6};

    //GROUP 3 measures
    //RUP + DDOWN +SLICE + DICEL +DICEM at the end
    if (rup && ddw && dic && dicm ) {
        if (dicm) {return 62}
    };
    

    return ret;
    
}

  





