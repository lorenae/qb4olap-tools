//hierarchy.js


//pre: lattice is a representation of the parent-child relationship among levels and the cardinalities of each edge.
// for each level (represented by its uri), a set of pairs (parentLevel, cardinality) is recorded.

//example (l1,l2,card1), (l1,l3,card1)   is represented as [(l1,[(l2,card1),(l3,card1)]]

function Hierarchy(uri,name){
    this.uri = uri;
    this.name = name;
    this.lattice = [];
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
}

Hierarchy.prototype.existsLevelNode = function(luri){
    return this.lattice.filter(function(node){
        return node.childuri == luri;}
        ).length > 0;
}

//pre: the hierarchy exists
Hierarchy.prototype.getLevelNode = function(luri){
    return this.lattice.filter(function(node){
        return node.childuri == luri;}
        )[0];
}


module.exports = Hierarchy;