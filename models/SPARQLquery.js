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
    this.filter = '';
    this.patterns = [];
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

//adds an expresion to the set of filters
SPARQLquery.prototype.addFilter = function(filterExpression){
    this.filter =filterExpression;
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


SPARQLquery.prototype.toString = function(){
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
        if(this.subquery){
            var strsubq = this.subquery.toString();
            strwhere = " WHERE \{\{ "+strsubq+" \}\} \n";
        }else{
            strbgps =obtainWhereClause(this.patterns,true);
            if(this.filter){
                strfilter = " FILTER ( "+this.filter+" )\n";
            }
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


function obtainWhereClause(bgps,optimize){

    var strbgps = '';

    if (optimize){
        //group patterns by subject.
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
                for (var i = 0; i < g.patterns.length; i++) {
                    pat +="; ";
                    pat += g.patterns[i].p+" "+g.patterns[i].o;
                }
            }
            pat +=" .\n";
            strbgps += pat;                    
        }); 
    }else{
        bgps.forEach(function(bgp){
            var pat = bgp.s+" "+bgp.p+" "+bgp.o+" .\n";
            strbgps += pat;
        });    
    }
    return strbgps;
}


module.exports = SPARQLquery;
