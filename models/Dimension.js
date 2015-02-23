//dimension.js



//objects

// Constructor

//pre: levels is a set of Levels, hierarchies is a set of Hierarchy.
function Dimension(uri, name){
    this.uri = uri;
    this.name = name;
    this.levels = [];
    this.hierarchies = [];
}

//adds a hierarchy 
//pre: the hierarchy does not exist
Dimension.prototype.addHierarchy= function(hierarchy){
	this.hierarchies.push(hierarchy);  
}

//adds a level 
//pre: the level does not exist
Dimension.prototype.addLevel = function(level){
        this.levels.unshift(level);
}

//pre: the hierarchy exists
Dimension.prototype.getHierarchy = function(huri){
    return this.hierarchies.filter(function(h){
        return h.uri == huri;}
        )[0];
}

Dimension.prototype.existsHierarchy = function(huri){
    return this.hierarchies.filter(function(h) {
        return h.uri == huri;
    }).length > 0;
}

Dimension.prototype.existsLevel = function(luri){
    return this.levels.filter(function(l) {
        return l.uri == luri;
    }).length > 0;
}






module.exports=Dimension;