//cuboid.js



// Constructor

//pre: datacube is a Datacube, levels is a set of Level
// represents one of the possible cuboids obtained from a datacube.
function Cuboid(name, uri, datacube,levels){
    this.name = name;
    this.uri = uri;
    this.datacube = datacube;
    this.levels = levels;
}

module.exports=Cuboid;