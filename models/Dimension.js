//dimension.js
var util = require('util');

var Hierarchy = require('../models/Hierarchy');
//objects

// Constructor

//pre: levels is a set of Levels, hierarchies is a set of Hierarchy.
function Dimension(uri, name, levels, hierarchies, bottomLevel){
    this.uri = uri;
    this.name = name;
    this.levels = levels;
    this.hierarchies = hierarchies;
    this.bottomLevel = bottomLevel;
}

//adds a hierarchy 
//pre: the hierarchy does not exist
Dimension.prototype.addHierarchy= function(hierarchy){
	this.hierarchies.push(hierarchy);  
};

//adds a level 
//pre: the level does not exist
Dimension.prototype.addLevel = function(level){
        this.levels.unshift(level);
};

//pre: the hierarchy exists
Dimension.prototype.getHierarchy = function(huri){
    return this.hierarchies.filter(function(h){
        return h.uri === huri;}
        )[0];
};

Dimension.prototype.getAllHierarchies = function(){
    return this.hierarchies;
};

//pre: the level exists
Dimension.prototype.getLevel = function(luri){
    return this.levels.filter(function(l){
        return l.uri === luri;}
        )[0];
};

Dimension.prototype.setBottomLevel = function(luri){
    this.bottomLevel = luri;
};

Dimension.prototype.getBottomLevel = function(){
    return this.bottomLevel;
};


Dimension.prototype.existsHierarchy = function(huri){
    return this.hierarchies.filter(function(h) {
        return h.uri === huri;
    }).length > 0;
};

Dimension.prototype.existsLevel = function(luri){
    return this.levels.filter(function(l) {
        return l.uri === luri;
    }).length > 0;
};

//returns the shortest path from level origin to target, traversing
//the lattice of hierarchies in this dimension
Dimension.prototype.getShortestPath = function(originLevel, targetLevel){

    var debug = false;
    var results = [];
   
    this.hierarchies.forEach(function(hier){
        var h = new Hierarchy(hier.uri, hier.name, hier.lattice, hier.steps);
        var result = [];
        if (h.existsLevel(originLevel) && h.existsLevel(targetLevel)){
            var start = 0;
            var end = 0;
            all = h.traverse();
            all.forEach(function(l){
                var isAlreadyInPath = result.filter(function(r){
                    r.level == l.level;
                }).length >0;

                if (!isAlreadyInPath) {
                    if(l.level == originLevel){
                    start = l.pos;
                    result.push(l);
                    }else if(l.level == targetLevel){
                        end = l.pos;
                        result.push(l);
                    }else if(l.pos >start && end === 0){
                        start = l.pos;
                        result.push(l);
                    }
                }
            });
            results.push({hierarchy:h.uri, path:result});
        }
    });
    //results is a set of paths from origin to target, now select the shortest
    var shortestPathIndex = 0;

    for( var i=1; i< results.length; i++){
        if(results[shortestPathIndex].path.length > results[i].path.length)
            shortestPathIndex = i;
    }
    return (results[shortestPathIndex]);
};

//returns the longest path from level origin to target, traversing
//the lattice of hierarchy in this dimension
Dimension.prototype.getLongestPath = function(originLevel, targetLevel){

    var result = "";   
    this.hierarchies.forEach(function(hier){
        var h = new Hierarchy(hier.uri, hier.name, hier.lattice, hier.steps);
        if (h.existsLevel(originLevel) && h.existsLevel(targetLevel)){
            allpaths = h.getPaths(); 
            ////console.log("ALPATHS: "+ util.inspect(allpaths, { showHidden: false, depth: null, colors:true }));
            //compute the difference in the positions, and return the path with maximum diff
            var maxlength = 0;
            allpaths.forEach(function(path){
                var originnode = path.filter(function(node){
                    return node.level == originLevel;
                });
                var targetnode = path.filter(function(node){
                    return node.level == targetLevel;
                });
                //if the path connects both levels
                if (originnode.length>0 && targetnode.length>0){
                    var posorigin = originnode[0].pos;
                    var postarget = targetnode[0].pos;
                    if (postarget - posorigin >= maxlength){
                        maxlength = postarget - posorigin;
                        //delete the nodes in the path from targetnode to the end
                        var end = path.indexOf(targetnode[0]);
                        if (end < path.length-1){
                            path.splice(end+1, path.length-end);
                        }
                        result = {hierarchy:hier.uri, path:path};
                    }
                }
            });
        }
    });
    return result;
};

//receives a set of levels and returns those levels with the longest path from bottom
Dimension.prototype.getMaxLevel =function(levels){

    //compute the length of the path from the bottom to each level
    //find the max
    var result = "";   
    var lengths = [];
    var bottom = this.bottomLevel;
    this.hierarchies.forEach(function(hier){
        var h = new Hierarchy(hier.uri, hier.name, hier.lattice, hier.steps);
        levels.forEach(function(current){
            ////console.log("current: "+ util.inspect(current, { showHidden: false, depth: null, colors:true }));
            ////console.log("bottom: "+ util.inspect(bottom, { showHidden: false, depth: null, colors:true }));
            if (h.existsLevel(bottom) && h.existsLevel(current)){
            allpaths = h.getPaths(); 
            ////console.log("ALPATHS: "+ util.inspect(allpaths, { showHidden: false, depth: null, colors:true }));
            //compute the difference in the positions, and return the path with maximum diff
            var maxlength = 0;
            allpaths.forEach(function(path){
                var originnode = path.filter(function(node){
                    return node.level == bottom;
                });
                var targetnode = path.filter(function(node){
                    return node.level == current;
                });
                //if the path connects both levels
                if (originnode.length>0 && targetnode.length>0){
                    var posorigin = originnode[0].pos;
                    var postarget = targetnode[0].pos;
                    if (postarget - posorigin >= maxlength){
                        maxlength = postarget - posorigin;
             
                    }
                }
            });
            lengths.push({
                level:current,
                length:maxlength
            });
            }
        });
    });
    ////console.log("LENGTHS: "+ util.inspect(lengths, { showHidden: false, depth: null, colors:true }));
    lengths.sort(function(a,b){
        return ( a.length < b.length);
    });
    ////console.log("sorted LENGTHS: "+ util.inspect(lengths, { showHidden: false, depth: null, colors:true }));

    return lengths[0].level;

}

module.exports=Dimension;