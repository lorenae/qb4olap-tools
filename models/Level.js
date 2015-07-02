//level.js

//objects

// Constructor


//pre: attribs is a set of Attributes
function Level(uri, name){
    this.name = name;
    this.uri = uri;
    this.attribs = [];
}

Level.prototype.existsAttribute = function(auri){
    return this.attribs.filter(function(a) {
        return a.uri == auri;
    }).length > 0;
};

//adds an attribute
//pre: the attribute does not exist
Level.prototype.addAttribute = function(attribute){
        this.attribs.unshift(attribute);
};

module.exports= Level;