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
        var newNode;
        if (parentLevel == null){
            newNode ={childuri: childLevel.uri , pclist:[] };
        } else{ 
            newNode ={childuri: childLevel.uri , pclist:[{parenturi:parentLevel.uri,card:cardinality}] };
        }
        this.lattice.push(newNode);
        //console.log('agrego un hijo');
	}
    //find the node for this level and add the pair (parentLevel,cardinality)
    else{
        if (parentLevel != null){
            var node = this.getLevelNode(childLevel.uri);
            var isparent = node.pclist.filter(function(parent){
                    return parent.parenturi === parentLevel.uri;}
                    ).length >0;
            if (!isparent){
                var newPair = {parenturi:parentLevel.uri,card:cardinality};
                node.pclist.push(newPair);    
            }
        }
    }
};


//adds a level pair only if it does not exist
Hierarchy.prototype.addEdgeToLatticeByuri = function(childuri, parenturi, cardinality){

    //if the child level does not exist in the lattice add a new node to the list 
    if (!this.existsLevelNode(childuri)) {
        var newNode;
        if (parenturi == null){
            newNode ={childuri: childuri , pclist:[] };
        } else{ 
            newNode ={childuri: childuri , pclist:[{parenturi:parenturi,card:cardinality}] };
        }
        this.lattice.push(newNode);
        //console.log('agrego un hijo');
    }
    //find the node for this level and add the pair (parentLevel,cardinality)
    else{
        if (parenturi != null){
            var node = this.getLevelNode(childuri);
            var isparent = node.pclist.filter(function(parent){
                    return parent.parenturi === parenturi}
                    ).length >0;
            if (!isparent){
                var newPair = {parenturi:parenturi,card:cardinality};
                node.pclist.push(newPair);    
            }
        }
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
// this condition does not work for recursive hierarchies.

Hierarchy.prototype.getBottomLevel = function(){

    var childs = getChilds(this.lattice);
    var parents = getParents(this.lattice);

    if (arraysEqual(childs,parents)) {
        return childs[0];
    }else{
        return childs.diff(parents)[0];    
    }
};


//pre: the hierarchy exists
//post: returns the level that occurs as parent but never occurs as child.
// this condition does not work for recursive hierarchies.
Hierarchy.prototype.getTopLevel = function(){
    var childs = getChilds(this.lattice);
    var parents = getParents(this.lattice);

    if (parents.length == 0){
        return childs[0];
    }else if (arraysEqual(childs,parents)) {
        return childs[0];
    }else{
        return parents.diff(childs)[0];
    }
};


//pre: the hierarchy exists
//post: returns the levels in the lattice from bottom to top, associated with their relative position
//ex: bottom relative position is 1, parents of bottom have relative position 2, etc.

Hierarchy.prototype.traverse = function(){ 

    var traverseRec = function (lattice, actuallevel, actualpos, listout){
            //if the lattice is not empty
            if (lattice.length>0 ) {
            //obtain the node in the lattice where the level to process is the child level    
            var actualNode = lattice.filter(function(lnode){
                return lnode.childuri == actuallevel;
            });

            if (actualNode.length>0){
                //remove from the lattice the processed node
                lattice = lattice.diff(actualNode);        
                //insert in the result the actual level                
                insert(actuallevel, actualpos, listout);
                actualpos++;
                //call the function recursively for each of the parents on the actual level.
                for (var pc = 0; pc < actualNode[0].pclist.length; pc++) {
                    traverseRec(lattice,actualNode[0].pclist[pc].parenturi,actualpos,listout);
                }
            }
        } else {
            listout = [];
        }   
    }

    var bylevels = [];
    var position = 1;
    var actualevel = this.getBottomLevel();
    var toplevel = this.getTopLevel();
   
    if (actualevel == toplevel){
        bylevels.push({level:actualevel, pos:position});
    }else{
        var lat = this.lattice.slice();
        traverseRec(lat,actualevel,position,bylevels);
        insert(toplevel, bylevels[bylevels.length-1].pos+1, bylevels);
    }
    return  bylevels;    
}


//pre: the hierarchy exists
//post: returns all the paths in the lattice from bottom to top

Hierarchy.prototype.getPaths = function(){

    var getPathsRec = function (lattice, actuallevel, position, allpaths){       
    
        //obtain the node in the lattice where the level to process is the child level    
        var actualNode = lattice.filter(function(lnode){
            return lnode.childuri == actuallevel;
        });

        if (actualNode.length>0){
            //call the function recursively for each of the parents on the actual level.
            actualNode[0].pclist.forEach(function(parent){
                getPathsRec(lattice, parent.parenturi,position+1,allpaths);
                allpaths.forEach(function(p){
                    var isinpath = p.filter(function(n){
                        return n.level == actualNode[0].childuri;
                    }).length>0;
                    if (!isinpath){
                        p.unshift({level:actualNode[0].childuri, pos:position});
                    }
                });
            });
        }else{
            //todo change pclist is empty
            //console.log("llegue arriba");
            allpaths.push([]);
        }
    };

    var allpaths = [];   
    var actualevel = this.getBottomLevel();
    var toplevel = this.getTopLevel();
    var position = 1;     

    getPathsRec(this.lattice,actualevel,position, allpaths);
    allpaths.forEach(function(p){
        pos = p[p.length-1].pos+1;
        p.push({level:toplevel, pos:pos});
    });
    return  allpaths; 
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

function arraysEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length != b.length) return false;

  for (var i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}


//inserts a pair (level, pos) in the list of levels, sorted by pos
function insert(level, pos, array) {
  array.splice(locationOf(pos, array) + 1, 0, {level:level, pos:pos});
  return array;
}



function locationOf(element, array, start, end) {
  start = start || 0;
  end = end || array.length;
  var pivot = parseInt(start + (end - start) / 2, 10);
  if (end-start <= 1 || array[pivot].pos === element) return pivot;
  if (array[pivot].pos < element) {
    return locationOf(element, array, pivot, end);
  } else {
    return locationOf(element, array, start, pivot);
  }
}


module.exports = Hierarchy;