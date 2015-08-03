var Network, RadialPlacement, activate, root;

root = typeof exports !== "undefined" && exports !== null ? exports : this;

RadialPlacement = function() {
  var center, current, increment, place, placement, radialLocation, radius, setKeys, start, values;
  values = d3.map();
  increment = 20;
  radius = 200;
  center = {
    "x": 0,
    "y": 0
  };
  start = -120;
  current = start;
  radialLocation = function(center, angle, radius) {
    var x, y;
    x = center.x + radius * Math.cos(angle * Math.PI / 180);
    y = center.y + radius * Math.sin(angle * Math.PI / 180);
    return {
      "x": x,
      "y": y
    };
  };
  placement = function(key) {
    var value;
    value = values.get(key);
    if (!values.has(key)) {
      value = place(key);
    }
    return value;
  };
  place = function(key) {
    var value;
    value = radialLocation(center, current, radius);
    values.set(key, value);
    current += increment;
    return value;
  };
  setKeys = function(keys) {
    var firstCircleCount, firstCircleKeys, secondCircleKeys;
    values = d3.map();
    firstCircleCount = 360 / increment;
    if (keys.length < firstCircleCount) {
      increment = 360 / keys.length;
    }
    firstCircleKeys = keys.slice(0, firstCircleCount);
    firstCircleKeys.forEach(function(k) {
      return place(k);
    });
    secondCircleKeys = keys.slice(firstCircleCount);
    radius = radius + radius / 1.8;
    increment = 360 / secondCircleKeys.length;
    return secondCircleKeys.forEach(function(k) {
      return place(k);
    });
  };
  placement.keys = function(_) {
    if (!arguments.length) {
      return d3.keys(values);
    }
    setKeys(_);
    return placement;
  };
  placement.center = function(_) {
    if (!arguments.length) {
      return center;
    }
    center = _;
    return placement;
  };
  placement.radius = function(_) {
    if (!arguments.length) {
      return radius;
    }
    radius = _;
    return placement;
  };
  placement.start = function(_) {
    if (!arguments.length) {
      return start;
    }
    start = _;
    current = start;
    return placement;
  };
  placement.increment = function(_) {
    if (!arguments.length) {
      return increment;
    }
    increment = _;
    return placement;
  };
  return placement;
};

Network = function() {
  var allData, charge, curLinksData, curNodesData, filter, filterLinks, filterNodes, force, forceTick, groupCenters, height, hideDetails, layout, link, linkedByIndex, linksG, mapNodes, moveToRadialLayout, neighboring, network, node, nodeColors, nodeCounts, nodesG, radialTick, setFilter, setLayout, setSort, setupData, showDetails, sort, sortedArtists, strokeFor, tip, update, updateCenters, updateLinks, updateNodes, width;
  width = 900;
  height = 700;
  allData = [];
  curLinksData = [];
  curNodesData = [];
  linkedByIndex = {};
  nodesG = null;
  linksG = null;
  node = null;
  link = null;
  //layout = "force";
  layout = "radial_dim";
  //layout = "radial_hier";
  filter = "all";
  //sort = "links";
  sort = "other";
  groupCenters = null;
  force = d3.layout.force();
  nodeColors = d3.scale.category20();

  tip = Tooltip("vis-tip", 230);

/*
  tip = d3.tip()
  .attr('class', 'd3-tip')
  .html(function(d) {
    return "<b><p>" + d.name + "</p><p> Level:" + d.level + "</p><p> Hierarchy: " + d.hierarchy + "</p></b>";
  })
*/

  charge = function(node) {
    return -Math.pow(node.radius, 1.5) / 3;
  };
  
  network = function(selection, data) {
    var vis;
    allData = setupData(data);

    var zoom = d3.behavior.zoom()
    .scaleExtent([1, 10])
    .on("zoom", zoomed);

    var margin = {top: -5, right: -5, bottom: -5, left: -5};

    /*
    vis = d3.select(selection).append("svg")
      .attr("width", width)
      .attr("height", height);
    */

    vis = d3.select(selection).append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("transform", "translate(" + margin.left + "," + margin.right + ")")
      .call(zoom);


/*
    vis = d3.select(selection).append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("transform", "translate(" + margin.left + "," + margin.right + ")")
      .call(tip);
*/


    linksG = vis.append("g").attr("id", "links");
    nodesG = vis.append("g").attr("id", "nodes");

    
     //zoom and drag
    function zoomed() {
      vis.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
    } 
    
         
    force.size([width, height]);
    setLayout(layout);
    setFilter("all");
    return update();
  };




  update = function() {
    var dimensions;
    curNodesData = filterNodes(allData.nodes);
    curLinksData = filterLinks(allData.links, curNodesData);
    if (layout === "radial_dim") {
      dimensions = sortedDimensions(curNodesData, curLinksData);
      updateCenters(dimensions);
    }
    if (layout === "radial_hier") {
      hier = sortedHierarchies(curNodesData, curLinksData);
      updateCenters(hier);
    }

    force.nodes(curNodesData);
    updateNodes();
    if (layout === "force") {
      force.links(curLinksData);
      updateLinks();
    } else {
      force.links([]);
      if (link) {
        link.data([]).exit().remove();
        link = null;
      }
    }
    return force.start();
  };
  network.toggleLayout = function(newLayout) {
    force.stop();
    setLayout(newLayout);
    return update();
  };
  network.toggleFilter = function(newFilter) {
    force.stop();
    setFilter(newFilter);
    return update();
  };
  network.toggleSort = function(newSort) {
    force.stop();
    setSort(newSort);
    return update();
  };
  network.updateSearch = function(searchTerm) {
    var searchRegEx;
    searchRegEx = new RegExp(searchTerm.toLowerCase());
    return node.each(function(d) {
      var element, match;
      element = d3.select(this);
      match = d.name.toLowerCase().search(searchRegEx);
      if (searchTerm.length > 0 && match >= 0) {
        element.style("fill", "#F38630").style("stroke-width", 2.0).style("stroke", "#555");
        return d.searched = true;
      } else {
        d.searched = false;
        return element.style("fill", function(d) {
          return nodeColors(d.level);
        }).style("stroke-width", 1.0);
      }
    });
  };
  network.updateData = function(newData) {
    allData = setupData(newData);
    link.remove();
    node.remove();
    return update();
  };
  setupData = function(data) {
    var circleRadius, countExtent, nodesMap;
    
    /*
    countExtent = d3.extent(data.nodes, function(d) {
      return d.playcount;
    });
    */
    
    countExtent = d3.extent(data.nodes, function(d) {
      return 3;
    });

    circleRadius = d3.scale.sqrt().range([3, 12]).domain(countExtent);
    data.nodes.forEach(function(n) {
      var randomnumber;
      n.x = randomnumber = Math.floor(Math.random() * width);
      n.y = randomnumber = Math.floor(Math.random() * height);
      //return n.radius = circleRadius(n.playcount);
      return n.radius = circleRadius(1);
    });
    

    nodesMap = mapNodes(data.nodes);
    data.links.forEach(function(l) {
      l.source = nodesMap.get(l.source);
      l.target = nodesMap.get(l.target);
      return linkedByIndex[l.source.id + "," + l.target.id] = 1;
    });
    return data;
  };
  mapNodes = function(nodes) {
    var nodesMap;
    nodesMap = d3.map();
    nodes.forEach(function(n) {
      return nodesMap.set(n.id, n);
    });
    return nodesMap;
  };
  nodeCounts = function(nodes, attr) {
    var counts;
    counts = {};
    nodes.forEach(function(d) {
      var name;
      if (counts[name = d[attr]] == null) {
        counts[name] = 0;
      }
      return counts[d[attr]] += 1;
    });
    return counts;
  };
  neighboring = function(a, b) {
    return linkedByIndex[a.id + "," + b.id] || linkedByIndex[b.id + "," + a.id];
  };

  filterNodes = function(allNodes) {
    var cutoff, filteredNodes, playcounts;
    filteredNodes = allNodes;
    if (filter === "popular" || filter === "obscure") {
      playcounts = allNodes.map(function(d) {
        return d.playcount;
      }).sort(d3.ascending);
      cutoff = d3.quantile(playcounts, 0.5);
      filteredNodes = allNodes.filter(function(n) {
        if (filter === "popular") {
          return n.playcount > cutoff;
        } else if (filter === "obscure") {
          return n.playcount <= cutoff;
        }
      });
    }
    return filteredNodes;
  };


  sortedDimensions = function(nodes, links) {
    var dimensions, counts;
    dimensions = [];
    if (sort === "links") {
      counts = {};
      links.forEach(function(l) {
        var name, name1;
        if (counts[name = l.source.dimension] == null) {
          counts[name] = 0;
        }
        counts[l.source.dimension] += 1;
        if (counts[name1 = l.target.dimension] == null) {
          counts[name1] = 0;
        }
        return counts[l.target.dimension] += 1;
      });
      nodes.forEach(function(n) {
        var name;
        return counts[name = n.dimension] != null ? counts[name] : counts[name] = 0;
      });
      dimensions = d3.entries(counts).sort(function(a, b) {
        return b.value - a.value;
      });
      dimensions = dimensions.map(function(v) {
        return v.key;
      });
    } else {
      counts = nodeCounts(nodes, "dimension");
      dimensions = d3.entries(counts).sort(function(a, b) {
        return b.value - a.value;
      });
      dimensions = dimensions.map(function(v) {
        return v.key;
      });
    }
    return dimensions;
  };


  sortedHierarchies = function(nodes, links) {
    var hier, counts;
    hier = [];
    if (sort === "links") {
      counts = {};
      links.forEach(function(l) {
        var name, name1;
        if (counts[name = l.source.hierarchy] == null) {
          counts[name] = 0;
        }
        counts[l.source.hierarchy] += 1;
        if (counts[name1 = l.target.hierarchy] == null) {
          counts[name1] = 0;
        }
        return counts[l.target.hierarchy] += 1;
      });
      nodes.forEach(function(n) {
        var name;
        return counts[name = n.hierarchy] != null ? counts[name] : counts[name] = 0;
      });
      hier = d3.entries(counts).sort(function(a, b) {
        return b.value - a.value;
      });
      hier = hier.map(function(v) {
        return v.key;
      });
    } else {
      counts = nodeCounts(nodes, "hierarchy");
      
      hier = d3.entries(counts).sort(function(a, b) {
        return b.value - a.value;
      });
      hier = hier.map(function(v) {
        return v.key;
      });
    }
    return hier;
  };





  updateCenters = function(groups) {
//    console.log(groups);
    if (layout === "radial_dim") {
      return groupCenters = RadialPlacement().center({
        "x": width / 2,
        "y": height / 2 - 100
      }).radius(200).increment(15).keys(groups);
    }
    if (layout === "radial_hier") {
      return groupCenters = RadialPlacement().center({
        "x": width / 2,
        "y": height / 2 - 100
      }).radius(200).increment(15).keys(groups);
    }
  };

  filterLinks = function(allLinks, curNodes) {
    curNodes = mapNodes(curNodes);
    return allLinks.filter(function(l) {
      return curNodes.get(l.source.id) && curNodes.get(l.target.id);
    });
  };

  updateNodes = function() {
    node = nodesG.selectAll("circle.node").data(curNodesData, function(d) {
      return d.id;
    });
    node.enter().append("circle").attr("class", "node").attr("cx", function(d) {
      return d.x;
    }).attr("cy", function(d) {
      return d.y;
    }).attr("r", function(d) {
      return d.radius;
    }).style("fill", function(d) {
      return nodeColors(d.level);
    }).style("stroke", function(d) {
      return strokeFor(d);
    }).style("stroke-width", 1.0);
    node.on("mouseover", showDetails)
    .on("mouseout", hideDetails) 
    .on("click", clicked);
    return node.exit().remove();

    /*
    .on("mouseover", tip.show)
    .on("mouseout", tip.hide)

    */
  };
  updateLinks = function() {
    link = linksG.selectAll("line.link").data(curLinksData, function(d) {
      return d.source.id + "_" + d.target.id;
    });
    link.enter().append("line").attr("class", "link").attr("stroke", "#ddd").attr("stroke-opacity", 0.8).attr("x1", function(d) {
      return d.source.x;
    }).attr("y1", function(d) {
      return d.source.y;
    }).attr("x2", function(d) {
      return d.target.x;
    }).attr("y2", function(d) {
      return d.target.y;
    });
    return link.exit().remove();
  };
  
  setLayout = function(newLayout) {
    layout = newLayout;
    if (layout === "force") {
      //return force.on("tick", forceTick).charge(-200).linkDistance(50);
      //return force.on("tick", forceTick).charge(-30).linkDistance(10);
      return force.on("tick", forceTick).charge(-15).linkDistance(5);
    } else if (layout === "radial_dim") {
      return force.on("tick", radialTick).charge(charge);
    } else if (layout === "radial_hier"){
      return force.on("tick", radialTick).charge(charge);
    }
  };




  setFilter = function(newFilter) {
    return filter = newFilter;
  };
  setSort = function(newSort) {
    return sort = newSort;
  };
  forceTick = function(e) {
    node.attr("cx", function(d) {
      return d.x;
    }).attr("cy", function(d) {
      return d.y;
    });
    return link.attr("x1", function(d) {
      return d.source.x;
    }).attr("y1", function(d) {
      return d.source.y;
    }).attr("x2", function(d) {
      return d.target.x;
    }).attr("y2", function(d) {
      return d.target.y;
    });
  };
  radialTick = function(e) {
    node.each(moveToRadialLayout(e.alpha));
    node.attr("cx", function(d) {
      return d.x;
    }).attr("cy", function(d) {
      return d.y;
    });
    if (e.alpha < 0.03) {
      force.stop();
      return updateLinks();
    }
  };
  moveToRadialLayout = function(alpha) {
    var k;
    k = alpha * 0.1;
    return function(d) {
      var centerNode;
      if (layout === "radial_dim") { centerNode = groupCenters(d.dimension);}
      else if (layout === "radial_hier") { centerNode = groupCenters(d.hierarchy);}
      d.x += (centerNode.x - d.x) * k;
      return d.y += (centerNode.y - d.y) * k;
    };
  };
  strokeFor = function(d) {
    return d3.rgb(nodeColors(d.level)).darker().toString();
  };

  clicked = function(d) {
    
    var url = d.uri;
    $(".modal-body").html('<frame width="100%" height="100%" frameborder="0" scrolling="yes" allowtransparency="true" src="'+url+'"></frame>');
    //$(".modal-body").html('<frameset cols="100%"><frame src="'+url+'"></frame></frameset>');
    $('#modalTitle').html('Dereferencing '+d.uri);
    $('#myModal').modal('show');

    } 

  showDetails = function(d, i) {
    var content;

    //console.log(d);
    content = '<b><p>' + d.name + '</p>';
    content += '<p> Level:' + d.level + '</p>';
    content += '<p> Hierarchy: ' + d.hierarchy + '</p></b>';
    tip.showTooltip(content, d3.event);

    if (link) {
      link.attr("stroke", function(l) {
        if (l.source === d || l.target === d) {
          return "#555";
        } else {
          return "#ddd";
        }
      }).attr("stroke-opacity", function(l) {
        if (l.source === d || l.target === d) {
          return 1.0;
        } else {
          return 0.5;
        }
      });
    }
    node.style("stroke", function(n) {
      if (n.searched || neighboring(d, n)) {
        return "#555";
      } else {
        return strokeFor(n);
      }
    }).style("stroke-width", function(n) {
      if (n.searched || neighboring(d, n)) {
        return 2.0;
      } else {
        return 1.0;
      }
    });
    return d3.select(this).style("stroke", "black").style("stroke-width", 2.0);
  };

  hideDetails = function(d, i) {
    tip.hideTooltip();
    node.style("stroke", function(n) {
      if (!n.searched) {
        return strokeFor(n);
      } else {
        return "#555";
      }
    }).style("stroke-width", function(n) {
      if (!n.searched) {
        return 1.0;
      } else {
        return 2.0;
      }
    });
    if (link) {
      return link.attr("stroke", "#ddd").attr("stroke-opacity", 0.8);
    }
  };
  return network;
};

activate = function(group, link) {
  d3.selectAll("#" + group + " a").classed("active", false);
  return d3.select("#" + group + " #" + link).classed("active", true);
};

/*
$(function() {
  var myNetwork;
  myNetwork = Network();
  d3.selectAll("#layouts a").on("click", function(d) {
    var newLayout;
    newLayout = d3.select(this).attr("id");
    activate("layouts", newLayout);
    return myNetwork.toggleLayout(newLayout);
  });
  d3.selectAll("#filters a").on("click", function(d) {
    var newFilter;
    newFilter = d3.select(this).attr("id");
    activate("filters", newFilter);
    return myNetwork.toggleFilter(newFilter);
  });
  d3.selectAll("#sorts a").on("click", function(d) {
    var newSort;
    newSort = d3.select(this).attr("id");
    activate("sorts", newSort);
    return myNetwork.toggleSort(newSort);
  });
  $("#song_select").on("change", function(e) {
    var songFile;
    songFile = $(this).val();
    return d3.json("data/" + songFile, function(json) {
      return myNetwork.updateData(json);
    });
  });
  $("#search").keyup(function() {
    var searchTerm;
    searchTerm = $(this).val();
    return myNetwork.updateSearch(searchTerm);
  });
  return d3.json("data/jolene.json", function(json) {
    return myNetwork("#vis", json);
  });
});
*/