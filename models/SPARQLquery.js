//SPARQLquery.js


//TODO describe each parameter

function SPARQLquery(resulttype){
    if(resulttype==="construct"){
        this.resulttype = "construct";    
    }else{
        this.resulttype = "select";    
    }
    
    this.prefixes = [];
    this.resultformat = {vars:[],expressions:[]};
    this.from = [];
    this.filters = [];
    this.patterns = [];
    this.patterngroups = [];
    this.groupby = [];
    this.subquery = '';
}

//adds a prefix
//pre> !existsPrefix(label,uri)
SPARQLquery.prototype.addPrefix = function(label, uri){
    this.prefixes.push({
        label:label,
        uri:uri
    });
};

//returns true if  either exists a prefix that uses this label
//or a prefix defined over this uri

SPARQLquery.prototype.existsPrefix = function(label,uri){
    var existsLabel = this.prefixes.filter( function(p){
        return p.label == label;
    }).length > 0;
    var existsUri = this.prefixes.filter( function(p){
        return p.uri == uri;
    }).length > 0;
    return existsLabel || existsUri;
};

//adds a graph to the from clause
SPARQLquery.prototype.addFrom = function(graph){
    this.from.push(graph);
};


//adds a bgp graph pattern 
SPARQLquery.prototype.addPattern = function(subject, predicate, object){
	this.patterns.push({
        s:subject,
        p:predicate,
        o:object
    });
};

//adds a bgp graph pattern to a group of patterns
//if append is true, adds the pattern to the end of the group, otherwise adds the pattern at the beggining of the group
SPARQLquery.prototype.addPatternToGroup = function(groupid, append, subject, predicate, object){

    var group = this.patterngroups.filter(function(g){
        return g.id == groupid;
    });

    //exists a group with this id
    if(group.length >0){
        if (append){
            group[0].patterns.push({
                s:subject,
                p:predicate,
                o:object
            });
        }else{
            group[0].patterns.unshift({
                s:subject,
                p:predicate,
                o:object
            });
        }
    }else{
        var newgroup ={
            id:groupid,
            patterns : []};
        newgroup.patterns.push({
            s:subject,
            p:predicate,
            o:object
        });
        this.patterngroups.push(newgroup);

    }   
};

//adds an expresion to the set of filters
SPARQLquery.prototype.addFilter = function(filterExpression){
    this.filters.push(filterExpression);
};

//adds a variable to group by
SPARQLquery.prototype.addVariableToGroupBy = function(variable){
    this.groupby.push(variable);
};

//adds a SPARQLquery as a subquery
SPARQLquery.prototype.addSubquery = function(query){
    this.subquery = query;
};

//adds a variable to the result
SPARQLquery.prototype.addVariableToResult = function(variable){
    this.resultformat.vars.push(variable);
};

//adds an expresion to the result
SPARQLquery.prototype.addExpresionToResult = function(expresion){
    this.resultformat.expressions.push(expresion);
};

//checks if the variable is alredy defined in the result
SPARQLquery.prototype.existsVariable = function(variable){
    return this.resultformat.vars.filter(function(v){
        return v == variable;}
        ).length > 0;
};

//gets a new variable name
SPARQLquery.prototype.getNewVariable = function(seed, counter){
        return "?"+seed+counter;
};


//if reduce=true groups patters with the same subject and rewrites using ;
SPARQLquery.prototype.toString = function(reduce){
    var strprefix= "";
    var strresult= "";
    var strfrom="";
    var strwhere= "";
    var strgroupby= "";

    var strresultvars= "";
    var strresultexp= "";
    var strbgps= "";
    var strfilter= "";
    
        //PREFIXES
        this.prefixes.forEach(function(p){
            var prefix = "PREFIX "+p.label+":"+" <"+p.uri+"> \n";
            strprefix += prefix;
        });

        //QUERY resultformat
        this.resultformat.vars.forEach(function(v){
            strresultvars += v+" ";
        });
        this.resultformat.expressions.forEach(function(e){
            strresultexp += " "+e+" ";
        });

        if(this.resulttype === "construct"){
            strresult = " CONSTRUCT \{"+strresultvars+strresultexp+" \} \n ";
        }
        if(this.resulttype === "select"){
            strresult = " SELECT "+strresultvars+strresultexp+"\n";
        }
        //QUERY FROM
        if(this.from.length>0){
            this.from.forEach(function(g){
                strfrom  += "FROM <"+g+"> \n";
            });
        }

        //QUERY WHERE
        if(this.filters.length >0){
                strfilter = obtainFilterClause(this.filters);
            }
        if(this.subquery){
            var strsubq = this.subquery.toString();
            strwhere = " WHERE \{\{ "+strsubq+strfilter+" \}\} \n";
        }else{
            strbgps =obtainWhereClause(this.patterns,this.patterngroups,reduce);
            strwhere = " WHERE \{ "+strbgps+strfilter+" \}\n";
        }

        //GROUPBY
        if(this.groupby.length>0){
            strgroupby = "GROUP BY ";
            this.groupby.forEach(function(v){
                strgroupby  += v+" ";
            });
            strgroupby  += "\n";
                
        }
        return (strprefix + strresult + strfrom + strwhere + strgroupby);
};

//returns a filter expression as the conjunction of all the filters
function obtainFilterClause(filters){
    var strfilter = ' FILTER (';
    filters.forEach(function(f){
        strfilter += '('+f+')';
        strfilter += '&&';
    });
    strfilter = strfilter.substring(0, strfilter.length - 2);
    strfilter += ')';
    return (strfilter);
}


//processes bgps and bgps groups
function obtainWhereClause(bgps,bgpgroups,reduce){

    var strbgps = '';

    if (reduce){
        //group patterns by subject and move smaller groups top
        var grouped = [];
        bgps.forEach(function(bgp){
            var group = grouped.filter(function(g){
                return g.s === bgp.s;
            });
            //if a group exists, add the subject and object to this group
            if(group.length>0){
                group[0].patterns.push({p:bgp.p, o:bgp.o });
            }
            //if not, add group
            else{
                grouped.push({s:bgp.s, patterns:[{p:bgp.p, o:bgp.o }]});
            }
        });
        grouped.forEach(function(g){
            //always add the first pattern
            var pat = g.s+" "+g.patterns[0].p+" "+g.patterns[0].o;
            
            //if there are more patterns with the same subject, add them
            if(g.patterns.length >1){
                for (var i = 1; i < g.patterns.length; i++) {
                    pat +="; ";
                    pat += g.patterns[i].p+" "+g.patterns[i].o;
                }
            }
            pat +=" .\n";
            strbgps += pat;                    
        }); 
    }else{
        bgpgroups.forEach(function(group){
            var g = "{";
            group.patterns.forEach(function(bgp){
                var pat = bgp.s+" "+bgp.p+" "+bgp.o+" .\n";    
                g += pat;
            });
            g += "} .";
            strbgps += g;
        });
        bgps.forEach(function(bgp){
            var pat = bgp.s+" "+bgp.p+" "+bgp.o+" .\n";
            strbgps += pat;
        });    
    }
    return strbgps;
}


module.exports = SPARQLquery;
