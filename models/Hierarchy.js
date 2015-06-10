//hierarchy.js

var util = require('util');

Array.prototype.diff = function(a) {
    return this.filter(function(i) {return a.indexOf(i) < 0;});
};


//pre: lattice is a representation of the parent-child relationship among levels and the cardinalities of each edge.
// for each level (represented by its uri), a set of pairs (parentLevel, cardinality) is recorded.

//example (l1,l2,card1), (l1,l3,card1)   is represented as [(l1,[(l2,card1),(l3,card1)]]


function Hierarchy(uri,name,lattice){
    this.uri = uri;
    this.name = name;
    this.lattice = lattice;
}



//adds a level pair only if it does not exist
Hierarchy.prototype.addEdgeToLattice = function(childLevel, parentLevel, cardinality){

    //if the child level does not exist in the lattice add a new node to the list 
	if (!this.existsLevelNode(childLevel.uri)) {
        var newNode = { childuri: childLevel.uri , pclist:[{parenturi:parentLevel.uri,card:cardinality}] };
        this.lattice.push(newNode);
        //console.log('agrego un hijo');
	}
    //find the node for this level and add the pair (parentLevel,cardinality)
    else{
        var node = this.getLevelNode(childLevel.uri);
        var newPair = {parenturi:parentLevel.uri,card:cardinality};
        node.pclist.push(newPair);
        //console.log('agrego un nodo a un hijo existente');
    }
};

Hierarchy.prototype.existsLevelNode = function(luri){
    return this.lattice.filter(function(node){       
        return node.childuri === luri;
        }
        ).length > 0;
};


Hierarchy.prototype.existsLevel = function(luri){
    return this.lattice.filter(function(node){

        var isparent = node.pclist.filter(function(parent){
                return parent.parenturi === luri;}
                ).length >0;
        return node.childuri === luri|| isparent;
        }
        ).length > 0;
};

//pre: the hierarchy exists
Hierarchy.prototype.getLevelNode = function(luri){
    return this.lattice.filter(function(node){
        return node.childuri === luri;}
        )[0];
};


//pre: the hierarchy exists
//post: returns the level that occurs as child but never occurs as parent.
Hierarchy.prototype.getBottomLevel = function(){

    var childs = getChilds(this.lattice);
    var parents = getParents(this.lattice);

    //console.log("childs: "+childs);
    //console.log("parents: "+parents);

    return childs.diff(parents)[0];
}


//pre: the hierarchy exists
//post: returns the level that occurs as parent but never occurs as child.
Hierarchy.prototype.getTopLevel = function(){
    var childs = getChilds(this.lattice);
    var parents = getParents(this.lattice);

    return parents.diff(childs)[0];
}


//pre: the hierarchy exists
//post: returns the levels in the lattice from bottom to top, associated with their relative position
//ex: bottom relative position is 1, parents of bottom have relative position 2, etc.

Hierarchy.prototype.traverse = function(){
    
    var bylevels = [];
    var position = 1;
    var actualevel = this.getBottomLevel();
    var toplevel = this.getTopLevel();
    

    var traverseLevel = function (listin, actuallevel, actualpos, listout){
        if (listin.length>0 ) {
            var toProcess = listin.filter(function(lnode){
                return lnode.childuri == actuallevel
            });
            if (toProcess.length>0){
                listin = listin.diff(toProcess);        
                listout.push({level:actuallevel, pos:actualpos});
                actualpos++;
                for (var pc = 0; pc < toProcess[0].pclist.length; pc++) {
                    traverseLevel(listin,toProcess[0].pclist[pc].parenturi,actualpos,listout);
                }
            }
        } else {
            listout = [];
        }   
    }

    var lat = this.lattice.slice();
    traverseLevel(lat,actualevel,position,bylevels);
    bylevels.push({level:toplevel, pos:bylevels[0].pos+1});
    return  bylevels;    
}



var getChilds = function(lattice){
    var childs= [];

    lattice.forEach(function(node){
        if (childs.filter(function(c){
                return c == node.childuri;
        }).length == 0) childs.push(node.childuri)
    })
    return childs;
}

var getParents = function(lattice){
    var parents = [];

    lattice.forEach(function(node){
        node.pclist.forEach(function (pc){
            if (parents.filter(function(p){
                return p == pc.parenturi;
            }).length == 0) parents.push(pc.parenturi)
        })
    })
    return parents;
}


module.exports = Hierarchy;