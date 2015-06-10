//measure.js



// Constructor
function Measure(uri, name, aggfunc,datatype) {

  this.uri = uri;
  this.name = name;
  this.aggfunc = aggfunc;
  this.datatype = datatype;
}

module.exports = Measure;