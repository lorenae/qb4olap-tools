//Datacube.js

// Constructor
//pre: dimensions is a set of Dimension, measures is a set of Measure
// represents the data cube schema 

function Datacube(name, uri, dataset){
    this.name = name;
    this.uri = uri;
    this.dataset = dataset;
    this.dimensions = [];
    this.measures = [];
}


//pre: the dimension does not exist
//adds a dimension 
Datacube.prototype.addDimension = function(dimension){
	this.dimensions.push(dimension);  
}

Datacube.prototype.existsDimension = function(dimuri){
	return this.dimensions.filter(function(d){
        return d.uri == dimuri;}
        ).length > 0;
}

//pre: the dimension exists
Datacube.prototype.getDimension = function(dimuri){
    return this.dimensions.filter(function(d){
        return d.uri == dimuri;}
        )[0];
}

//adds a measure only if it does not exist
Datacube.prototype.addMeasure = function(measure){
    this.measures.push(measure);
}

Datacube.prototype.existsMeasure = function(muri){
    return this.measures.filter(function(m){
        return m.uri == muri;}
        ).length > 0;
}

//pre: the measure exists
Datacube.prototype.getMeasure = function(muri){
    return this.measures.filter(function(m){
        return m.uri == muri;}
        )[0];
}


module.exports = Datacube;
