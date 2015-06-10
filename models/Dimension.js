//dimension.js
var util = require('util');

var Hierarchy = require('../models/Hierarchy');
//objects

// Constructor

//pre: levels is a set of Levels, hierarchies is a set of Hierarchy.
function Dimension(uri, name, levels, hierarchies){
    this.uri = uri;
    this.name = name;
    this.levels = levels;
    this.hierarchies = hierarchies;
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
        return h.uri == huri;}
        )[0];
};

//pre: the level exists
Dimension.prototype.getLevel = function(luri){
    return this.levels.filter(function(l){
        return l.uri == luri;}
        )[0];
};

Dimension.prototype.getBottomLevel = function(){
    return this.levels[this.levels.length-1];
};


Dimension.prototype.existsHierarchy = function(huri){
    return this.hierarchies.filter(function(h) {
        return h.uri == huri;
    }).length > 0;
};

Dimension.prototype.existsLevel = function(luri){
    return this.levels.filter(function(l) {
        return l.uri == luri;
    }).length > 0;
};

//returns the shortest path from level origin to target, traversing
//the lattice of hierarchy in this dimension
Dimension.prototype.getShortestPath = function(originLevel, targetLevel){

    var debug = false;

    var results = [];
    if (debug){
        console.log("bottom "+originLevel);
        console.log("target "+targetLevel);
            
    }
    

    this.hierarchies.forEach(function(hier){
        var h = new Hierarchy(hier.uri, hier.name, hier.lattice);
        var result = [];

        if (debug){
            console.log("hierarchy:"+hier.uri);
            console.log(util.inspect(hier.lattice, { showHidden: false, depth: null, colors:true }));
            console.log("exists "+originLevel+"="+h.existsLevel(originLevel) );
            console.log("exists "+targetLevel+"="+h.existsLevel(targetLevel) );
        }

        if (h.existsLevel(originLevel) && h.existsLevel(targetLevel)){
            var start = 0;
            var end = 0;
            all = h.traverse();
            all.forEach(function(l){
                if (debug){
                    console.log("l");
                    console.log(util.inspect(l, { showHidden: false, depth: null, colors:true }));    
                }

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
                if (debug){
                    console.log("start: "+start);
                    console.log("end: "+end);
                    console.log("result ");
                    console.log(util.inspect(result, { showHidden: false, depth: null, colors:true }));    
                }
            });
            results.push({hierarchy:h.getUri, path:result});
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





module.exports=Dimension;