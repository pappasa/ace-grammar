/**
*
*   AceGrammar
*   @version: 0.5
*   Transform a grammar specification in JSON format,
*   into an ACE syntax-highlight parser mode
*
*   https://github.com/foo123/ace-grammar
*
**/
!function ( root, name, deps, factory ) {

    //
    // export the module in a umd-style generic way
    deps = ( deps ) ? [].concat(deps) : [];
    var i, dl = deps.length, ids = new Array( dl ), paths = new Array( dl ), mods = new Array( dl );
    for (i=0; i<dl; i++) { ids[i] = deps[i][0]; paths[i] = deps[i][1]; }
    
    // node, commonjs, etc..
    if ( 'object' == typeof( module ) && module.exports ) 
    {
        if ( 'undefined' == typeof(module.exports[name]) )
        {
            for (i=0; i<dl; i++)
                mods[i] = module.exports[ ids[i] ] || require( paths[i] )[ ids[i] ];
            module.exports[ name ] = factory.apply(root, mods );
        }
    }
    
    // amd, etc..
    else if ( 'function' == typeof( define ) && define.amd ) 
    {
        define( ['exports'].concat( paths ), function( exports ) {
            if ( 'undefined' == typeof(exports[name]) )
            {
                var args = Array.prototype.slice.call( arguments, 1 );
                for (var i=0, dl=args.length; i<dl; i++)
                    mods[i] = exports[ ids[i] ];
                exports[name] = factory.apply(root, mods );
            }
        });
    }
    
    // browsers, other loaders, etc..
    else 
    {
        if ( 'undefined' == typeof(root[name]) )
        {
            for (i=0; i<dl; i++)
                mods[i] = root[ ids[i] ];
            root[name] = factory.apply(root, mods );
        }
    }


}( this, "AceGrammar",
    // dependencies
    [
        ["Classy", "./classy"],  ["RegExAnalyzer", "./regexanalyzer"]
    ], 
    // module factory
    function( Classy, RegexAnalyzer, undef ) {
    
    var Class = Classy.Class;
        
    //
    // parser types
    var    
        DEFAULTSTYLE,
        DEFAULTERROR,
        
        //
        // javascript variable types
        T_NUM = 2,
        T_BOOL = 4,
        T_STR = 8,
        T_CHAR = 9,
        T_CHARLIST = 10,
        T_REGEX = 16,
        T_ARRAY = 32,
        T_OBJ = 64,
        T_NULL = 128,
        T_UNDEF = 256,
        T_UNKNOWN = 512,
        
        //
        // matcher types
        T_SIMPLEMATCHER = 2,
        T_COMPOSITEMATCHER = 4,
        T_BLOCKMATCHER = 8,
        
        //
        // token types
        T_ERROR = 4,
        T_DEFAULT = 8,
        T_SIMPLE = 16,
        T_BLOCK = 32,
        T_ESCBLOCK = 33,
        T_COMMENT = 34,
        T_EITHER = 64,
        T_ALL = 128,
        T_ZEROORONE = 256,
        T_ZEROORMORE = 512,
        T_ONEORMORE = 1024,
        T_GROUP = 2048,
        T_NGRAM = 4096,
        
        //
        // tokenizer types
        groupTypes = {
            ONEOF : T_EITHER, EITHER : T_EITHER, ALL : T_ALL, ZEROORONE : T_ZEROORONE, ZEROORMORE : T_ZEROORMORE, ONEORMORE : T_ONEORMORE
        },
        
        tokenTypes = {
            BLOCK : T_BLOCK, COMMENT : T_COMMENT, ESCAPEDBLOCK : T_ESCBLOCK, SIMPLE : T_SIMPLE, GROUP : T_GROUP, NGRAM : T_NGRAM
        },
        
        //
        // default grammar settings
        defaultGrammar = {
            // prefix ID for regular expressions used in the grammar
            "RegExpID" : null,
            
            //
            // Style model
            "Style" : null,

            //
            // Lexical model
            "Lex" : null,
            
            //
            // Syntax model and context-specific rules (optional)
            "Syntax" : null,
            
            // what to parse and in what order
            "Parser" : null
        }
    ;
    
    var slice = Array.prototype.slice, splice = Array.prototype.splice, concat = Array.prototype.concat, 
        hasKey = Object.prototype.hasOwnProperty, toStr = Object.prototype.toString, isEnum = Object.prototype.propertyIsEnumerable,
        
        Keys = Object.keys,
        
        get_type = function(v) {
            var type_of = typeof(v), to_string = toStr.call(v);
            
            if ('undefined' == type_of)  return T_UNDEF;
            
            else if ('number' == type_of || v instanceof Number)  return T_NUM;
            
            else if (null === v)  return T_NULL;
            
            else if (true === v || false === v)  return T_BOOL;
            
            else if (v && ('string' == type_of || v instanceof String))  return (1 == v.length) ? T_CHAR : T_STR;
            
            else if (v && ("[object RegExp]" == to_string || v instanceof RegExp))  return T_REGEX;
            
            else if (v && ("[object Array]" == to_string || v instanceof Array))  return T_ARRAY;
            
            else if (v && "[object Object]" == to_string)  return T_OBJ;
            
            // unkown type
            return T_UNKNOWN;
        },
        
        make_array = function(a, force) {
            return ( force || T_ARRAY != get_type( a ) ) ? [ a ] : a;
        },
        
        make_array_2 = function(a, force) {
            a = make_array( a, force );
            if ( force || T_ARRAY != get_type( a[0] ) ) a = [ a ]; // array of arrays
            return a;
        },
        
        clone = function(o) {
            var T = get_type( o ), T2;
            
            if ( !((T_OBJ | T_ARRAY) & T) ) return o;
            
            var co = {}, k;
            for (k in o) 
            {
                if ( hasKey.call(o, k) && isEnum.call(o, k) ) 
                { 
                    T2 = get_type( o[k] );
                    
                    if (T_OBJ & T2)  co[k] = clone(o[k]);
                    
                    else if (T_ARRAY & T2)  co[k] = o[k].slice();
                    
                    else  co[k] = o[k]; 
                }
            }
            return co;
        },
        
        extend = function() {
            var args = slice.call(arguments), argslen = args.length;
            
            if ( argslen<1 ) return null;
            else if ( argslen<2 ) return clone( args[0] );
            
            var o1 = args.shift(), o2, o = clone(o1), i, k, T; 
            argslen--;            
            
            for (i=0; i<argslen; i++)
            {
                o2 = args.shift();
                if ( !o2 ) continue;
                
                for (k in o2) 
                { 
                    if ( hasKey.call(o2, k) && isEnum.call(o2, k) )
                    {
                        if ( hasKey.call(o1, k) && isEnum.call(o1, k) ) 
                        { 
                            T = get_type( o1[k] );
                            
                            if ( (T_OBJ & ~T_STR) & T)  o[k] = extend( o1[k], o2[k] );
                            
                            //else if (T_ARRAY == T)  o[k] = o1[k].slice();
                            
                            //else  o[k] = o1[k];
                        }
                        else
                        {
                            o[k] = clone( o2[k] );
                        }
                    }
                }
            }
            return o;
        },
        
        escRegexp = function(str) {
            return str.replace(/([.*+?^${}()|[\]\/\\])/g, '\\$1');
        },

        byLength = function(a, b) { return b.length - a.length },
        
        hasPrefix = function(s, id) {
            return (
                (T_STR & get_type(id)) && (T_STR & get_type(s)) && id.length &&
                id.length <= s.length && id == s.substr(0, id.length)
            );
        },
        
        getRegexp = function(r, rid, cachedRegexes)  {
            if ( !r || (T_NUM == get_type(r)) ) return r;
            
            var l = (rid) ? (rid.length||0) : 0;
            
            if ( l && rid == r.substr(0, l) ) 
            {
                var regexID = "^(" + r.substr(l) + ")", regex, chars, analyzer;
                
                if ( !cachedRegexes[ regexID ] )
                {
                    regex = new RegExp( regexID );
                    analyzer = new RegexAnalyzer( regex ).analyze();
                    chars = analyzer.getPeekChars();
                    if ( !Keys(chars.peek).length )  chars.peek = null;
                    if ( !Keys(chars.negativepeek).length )  chars.negativepeek = null;
                    
                    // shared, light-weight
                    cachedRegexes[ regexID ] = [ regex, chars ];
                }
                
                return cachedRegexes[ regexID ];
            }
            else
            {
                return r;
            }
        },
        
        getCombinedRegexp = function(tokens, boundary)  {
            var peek = { }, i, l, b = "", bT = get_type(boundary);
            if ( T_STR == bT || T_CHAR == bT ) b = boundary;
            var combined = tokens
                        .sort( byLength )
                        .map( function(t) {
                            peek[ t.charAt(0) ] = 1;
                            return escRegexp( t );
                        })
                        .join( "|" )
                    ;
            return [ new RegExp("^(" + combined + ")"+b), { peek: peek, negativepeek: null }, 1 ];
        }
    ;
    
    //
    // Stream Class
    var
        // a wrapper-class to manipulate a string as a stream, based on Codemirror's StringStream
        ParserStream = Class({
            
            constructor: function( line ) {
                this.string = (line) ? ''+line : '';
                this.start = this.pos = 0;
                this._ = null;
            },
            
            // abbreviations used for optimal minification
            
            _: null,
            string: '',
            start: 0,
            pos: 0,
            
            fromStream: function( _ ) {
                this._ = _;
                this.string = ''+_.string;
                this.start = _.start;
                this.pos = _.pos;
                return this;
            },
            
            toString: function() { return this.string; },
            
            // string start-of-line?
            sol: function( ) { return 0 == this.pos; },
            
            // string end-of-line?
            eol: function( ) { return this.pos >= this.string.length; },
            
            // char match
            chr : function(pattern, eat) {
                var ch = this.string.charAt(this.pos) || null;
                if (ch && pattern == ch) 
                {
                    if (false !== eat) 
                    {
                        this.pos += 1;
                        if ( this._ ) this._.pos = this.pos;
                    }
                    return ch;
                }
                return false;
            },
            
            // char list match
            chl : function(pattern, eat) {
                var ch = this.string.charAt(this.pos) || null;
                if ( ch && (-1 < pattern.indexOf( ch )) ) 
                {
                    if (false !== eat) 
                    {
                        this.pos += 1;
                        if ( this._ ) this._.pos = this.pos;
                    }
                    return ch;
                }
                return false;
            },
            
            // string match
            str : function(pattern, startsWith, eat) {
                var pos = this.pos, str = this.string, ch = str.charAt(pos) || null;
                if ( ch && startsWith[ ch ] )
                {
                    var len = pattern.length, s = str.substr(pos, len);
                    if (pattern == s) 
                    {
                        if (false !== eat) 
                        {
                            this.pos += len;
                            if ( this._ )  this._.pos = this.pos;
                        }
                        return s;
                    }
                }
                return false;
            },
            
            // regex match
            rex : function(pattern, startsWith, notStartsWith, group, eat) {
                var pos = this.pos, str = this.string, ch = str.charAt(pos) || null;
                if ( ch && ( startsWith && startsWith[ ch ] ) || ( notStartsWith && !notStartsWith[ ch ] ) )
                {
                    var match = str.slice(pos).match(pattern);
                    if (!match || match.index > 0) return false;
                    if (false !== eat) 
                    {
                        this.pos += match[group||0].length;
                        if ( this._ ) this._.pos = this.pos;
                    }
                    return match;
                }
                return false;
            },
            /*
            // general pattern match
            match: function(pattern, eat, caseInsensitive, group) {
                if (typeof pattern == "string") 
                {
                    var cased = function(str) {return caseInsensitive ? str.toLowerCase() : str;};
                    var substr = this.string.substr(this.pos, pattern.length);
                    if (cased(substr) == cased(pattern)) 
                    {
                        if (eat !== false) this.pos += pattern.length;
                        return true;
                    }
                } 
                else 
                {
                    group = group || 0;
                    var match = this.string.slice(this.pos).match(pattern);
                    if (match && match.index > 0) return null;
                    if (match && eat !== false) this.pos += match[group].length;
                    return match;
                }
            },
            */
            // skip to end
            end: function() {
                this.pos = this.string.length;
                if ( this._ ) this._.pos = this.pos;
                return this;
            },
            /*
            // peek next char
            peek: function( ) { 
                return this.string.charAt(this.pos) || null; 
            },
            */
            // get next char
            nxt: function( ) {
                if (this.pos < this.string.length)
                {
                    var ch = this.string.charAt(this.pos++) || null;
                    if ( this._ ) this._.pos = this.pos;
                    return ch;
                }
            },
            
            // back-up n steps
            bck: function( n ) {
                this.pos -= n;
                if ( 0 > this.pos ) this.pos = 0;
                if ( this._ )  this._.pos = this.pos;
                return this;
            },
            
            // back-track to pos
            bck2: function( pos ) {
                this.pos = pos;
                if ( 0 > this.pos ) this.pos = 0;
                if ( this._ ) this._.pos = this.pos;
                return this;
            },
            
            // eat space
            spc: function( ) {
                var start = this.pos, pos = this.pos, s = this.string;
                while (/[\s\u00a0]/.test(s.charAt(pos))) ++pos;
                this.pos = pos;
                if ( this._ ) this._.pos = this.pos;
                return this.pos > start;
            },
            
            // current stream selection
            cur: function( ) {
                return this.string.slice(this.start, this.pos);
            },
            
            // move/shift stream
            sft: function( ) {
                this.start = this.pos;
                return this;
            }
        })
    ;
        
    //
    // ParserState Class
    var
        ParserState = Class({
            
            constructor: function( id ) {
                this.id = id || 0;
                this.stack = [];
                this.t = T_DEFAULT;
                this.inBlock = null;
                this.endBlock = null;
            },
            
            id: 0,
            stack: null,
            t: null,
            inBlock: null,
            endBlock: null,
            
            clone: function() {
                var copy = new this.$class( this.id );
                copy.t = this.t;
                copy.stack = this.stack.slice();
                copy.inBlock = this.inBlock;
                copy.endBlock = this.endBlock;
                return copy;
            },
            
            // used mostly for ACE which treats states as strings
            toString: function() {
                //return ['', this.id, this.inBlock||'0'].join('_');
                return ['', this.id, this.t, this.inBlock||'0'].join('_');
            }
        })
    ;
        
    //
    // matcher factories
    var 
        SimpleMatcher = Class({
            
            constructor : function(type, name, pattern, key) {
                this.type = T_SIMPLEMATCHER;
                this.tt = type || T_CHAR;
                this.tn = name;
                this.tk = key || 0;
                this.tg = 0;
                this.tp = null;
                this.p = null;
                this.np = null;
                
                // get a fast customized matcher for < pattern >
                switch ( this.tt )
                {
                    case T_CHAR: case T_CHARLIST:
                        this.tp = pattern;
                        break;
                    case T_STR:
                        this.tp = pattern;
                        this.p = {};
                        this.p[ '' + pattern.charAt(0) ] = 1;
                        break;
                    case T_REGEX:
                        this.tp = pattern[ 0 ];
                        this.p = pattern[ 1 ].peek || null;
                        this.np = pattern[ 1 ].negativepeek || null;
                        this.tg = pattern[ 2 ] || 0;
                        break;
                    case T_NULL:
                        this.tp = null;
                        break;
                }
            },
            
            // matcher type
            type: null,
            // token type
            tt: null,
            // token name
            tn: null,
            // token pattern
            tp: null,
            // token pattern group
            tg: 0,
            // token key
            tk: 0,
            // pattern peek chars
            p: null,
            // pattern negative peek chars
            np: null,
            
            get : function(stream, eat) {
                var matchedResult, 
                    tokenType = this.tt, tokenKey = this.tk, 
                    tokenPattern = this.tp, tokenPatternGroup = this.tg,
                    startsWith = this.p, notStartsWith = this.np
                ;    
                // get a fast customized matcher for < pattern >
                switch ( tokenType )
                {
                    case T_CHAR:
                        if ( matchedResult = stream.chr(tokenPattern, eat) ) return [ tokenKey, matchedResult ];
                        break;
                    case T_CHARLIST:
                        if ( matchedResult = stream.chl(tokenPattern, eat) ) return [ tokenKey, matchedResult ];
                        break;
                    case T_STR:
                        if ( matchedResult = stream.str(tokenPattern, startsWith, eat) ) return [ tokenKey, matchedResult ];
                        break;
                    case T_REGEX:
                        if ( matchedResult = stream.rex(tokenPattern, startsWith, notStartsWith, tokenPatternGroup, eat) ) return [ tokenKey, matchedResult ];
                        break;
                    case T_NULL:
                        // matches end-of-line
                        (false !== eat) && stream.end(); // skipToEnd
                        return [ tokenKey, "" ];
                        break;
                }
                return false;
            },
            
            toString : function() {
                return ['[', 'Matcher: ', this.tn, ', Pattern: ', ((this.tp) ? this.tp.toString() : null), ']'].join('');
            }
        }),
        
        CompositeMatcher = Class(SimpleMatcher, {
            
            constructor : function(name, matchers, useOwnKey) {
                this.type = T_COMPOSITEMATCHER;
                this.tn = name;
                this.ms = matchers;
                this.ownKey = (false!==useOwnKey);
            },
            
            // group of matchers
            ms : null,
            ownKey : true,
            
            get : function(stream, eat) {
                var i, m, matchers = this.ms, l = matchers.length, useOwnKey = this.ownKey;
                for (i=0; i<l; i++)
                {
                    // each one is a matcher in its own
                    m = matchers[i].get(stream, eat);
                    if ( m ) return ( useOwnKey ) ? [ i, m[1] ] : m;
                }
                return false;
            }
        }),
        
        BlockMatcher = Class(SimpleMatcher, {
            
            constructor : function(name, start, end) {
                this.type = T_BLOCKMATCHER;
                this.tn = name;
                this.s = new CompositeMatcher(this.tn + '_Start', start, false);
                this.e = end;
            },
            
            // start block matcher
            s : null,
            // end block matcher
            e : null,
            
            get : function(stream, eat) {
                    
                var startMatcher = this.s, endMatchers = this.e, token;
                
                // matches start of block using startMatcher
                // and returns the associated endBlock matcher
                if ( token = startMatcher.get(stream, eat) )
                {
                    // use the token key to get the associated endMatcher
                    var endMatcher = endMatchers[ token[0] ];
                    
                    // regex group given, get the matched group for the ending of this block
                    if ( T_NUM == get_type( endMatcher ) )
                    {
                        // the regex is wrapped in an additional group, 
                        // add 1 to the requested regex group transparently
                        endMatcher = new SimpleMatcher( T_STR, this.tn + '_End', token[1][ endMatcher+1 ] );
                    }
                    
                    return endMatcher;
                }
                
                return false;
            }
        }),
        
        getSimpleMatcher = function(name, pattern, key, cachedMatchers) {
            var T = get_type( pattern );
            
            if ( T_NUM == T ) return pattern;
            
            if ( !cachedMatchers[ name ] )
            {
                key = key || 0;
                var matcher;
                var is_char_list = 0;
                
                if ( pattern && pattern.isCharList )
                {
                    is_char_list = 1;
                    delete pattern.isCharList;
                }
                
                // get a fast customized matcher for < pattern >
                if ( T_NULL & T ) matcher = new SimpleMatcher(T_NULL, name, pattern, key);
                
                else if ( T_CHAR == T ) matcher = new SimpleMatcher(T_CHAR, name, pattern, key);
                
                else if ( T_STR & T ) matcher = (is_char_list) ? new SimpleMatcher(T_CHARLIST, name, pattern, key) : new SimpleMatcher(T_STR, name, pattern, key);
                
                else if ( /*T_REGEX*/T_ARRAY & T ) matcher = new SimpleMatcher(T_REGEX, name, pattern, key);
                
                // unknown
                else matcher = pattern;
                
                cachedMatchers[ name ] = matcher;
            }
            
            return cachedMatchers[ name ];
        },
        
        getCompositeMatcher = function(name, tokens, RegExpID, combined, cachedRegexes, cachedMatchers) {
            
            if ( !cachedMatchers[ name ] )
            {
                var tmp, i, l, l2, array_of_arrays = 0, has_regexs = 0, is_char_list = 1, T1, T2;
                var matcher;
                
                tmp = make_array( tokens );
                l = tmp.length;
                
                if ( 1 == l )
                {
                    matcher = getSimpleMatcher( name, getRegexp( tmp[0], RegExpID, cachedRegexes ), 0, cachedMatchers );
                }
                else if ( 1 < l /*combined*/ )
                {   
                    l2 = (l>>1) + 1;
                    // check if tokens can be combined in one regular expression
                    // if they do not contain sub-arrays or regular expressions
                    for (i=0; i<=l2; i++)
                    {
                        T1 = get_type( tmp[i] );
                        T2 = get_type( tmp[l-1-i] );
                        
                        if ( (T_CHAR != T1) || (T_CHAR != T2) ) 
                        {
                            is_char_list = 0;
                        }
                        
                        if ( (T_ARRAY & T1) || (T_ARRAY & T2) ) 
                        {
                            array_of_arrays = 1;
                            //break;
                        }
                        else if ( hasPrefix( tmp[i], RegExpID ) || hasPrefix( tmp[l-1-i], RegExpID ) )
                        {
                            has_regexs = 1;
                            //break;
                        }
                    }
                    
                    if ( is_char_list && ( !combined || !( T_STR & get_type(combined) ) ) )
                    {
                        tmp = tmp.slice().join('');
                        tmp.isCharList = 1;
                        matcher = getSimpleMatcher( name, tmp, 0, cachedMatchers );
                    }
                    else if ( combined && !(array_of_arrays || has_regexs) )
                    {   
                        matcher = getSimpleMatcher( name, getCombinedRegexp( tmp, combined ), 0, cachedMatchers );
                    }
                    else
                    {
                        for (i=0; i<l; i++)
                        {
                            if ( T_ARRAY & get_type( tmp[i] ) )
                                tmp[i] = getCompositeMatcher( name + '_' + i, tmp[i], RegExpID, combined, cachedRegexes, cachedMatchers );
                            else
                                tmp[i] = getSimpleMatcher( name + '_' + i, getRegexp( tmp[i], RegExpID, cachedRegexes ), i, cachedMatchers );
                        }
                        
                        matcher = (l > 1) ? new CompositeMatcher( name, tmp ) : tmp[0];
                    }
                }
                
                cachedMatchers[ name ] = matcher;
            }
            
            return cachedMatchers[ name ];
        },
        
        getBlockMatcher = function(name, tokens, RegExpID, cachedRegexes, cachedMatchers) {
            
            if ( !cachedMatchers[ name ] )
            {
                var tmp, i, l, start, end, t1, t2;
                
                // build start/end mappings
                start = []; end = [];
                tmp = make_array_2( tokens ); // array of arrays
                for (i=0, l=tmp.length; i<l; i++)
                {
                    t1 = getSimpleMatcher( name + '_0_' + i, getRegexp( tmp[i][0], RegExpID, cachedRegexes ), i, cachedMatchers );
                    t2 = (tmp[i].length>1) ? getSimpleMatcher( name + '_1_' + i, getRegexp( tmp[i][1], RegExpID, cachedRegexes ), i, cachedMatchers ) : t1;
                    start.push( t1 );  end.push( t2 );
                }
                
                cachedMatchers[ name ] = new BlockMatcher(name, start, end);
            }
            
            return cachedMatchers[ name ];
        }
    ;
    
    //
    // tokenizer factories
    var
        SimpleToken = Class({
            
            constructor : function(name, token, style) {
                this.tt = T_SIMPLE;
                this.tn = name;
                this.t = token;
                this.r = style;
                this.required = 0;
                this.ERR = 0;
                this.toClone = ['t', 'r'];
            },
            
            // tokenizer/token name
            tn : null,
            // tokenizer type
            tt : null,
            // tokenizer token matcher
            t : null,
            // tokenizer return val
            r : null,
            required : 0,
            ERR : 0,
            streamPos : null,
            stackPos : null,
            toClone: null,
            actionBefore : null,
            actionAfter : null,
            
            get : function( stream, state ) {
                if ( this.t.get(stream) ) { state.t = this.tt; return this.r; }
                return false;
            },
            
            require : function(bool) { 
                this.required = (bool) ? 1 : 0;
                return this;
            },
            
            push : function(stack, token, i) {
                if ( this.stackPos ) stack.splice( this.stackPos+(i||0), 0, token );
                else stack.push( token );
                return this;
            },
            
            clone : function() {
                var t, toClone = this.toClone, toClonelen;
                
                t = new this.$class();
                t.tt = this.tt;
                t.tn = this.tn;
                t.streamPos = this.streamPos;
                t.stackPos = this.stackPos;
                t.actionBefore = this.actionBefore;
                t.actionAfter = this.actionAfter;
                //t.required = this.required;
                //t.ERR = this.ERR;
                
                if (toClone && toClone.length)
                {
                    toClonelen = toClone.length;
                    for (var i=0; i<toClonelen; i++)   
                        t[ toClone[i] ] = this[ toClone[i] ];
                }
                return t;
            },
            
            toString : function() {
                return ['[', 'Tokenizer: ', this.tn, ', Matcher: ', ((this.t) ? this.t.toString() : null), ']'].join('');
            }
        }),
        
        BlockToken = Class(SimpleToken, {
            
            constructor : function(type, name, token, style, allowMultiline, escChar) {
                this.$super('constructor', name, token, style);
                this.tt = type;
                // a block is multiline by default
                this.mline = ( T_UNDEF & get_type(allowMultiline) ) ? 1 : allowMultiline;
                this.esc = escChar || "\\";
                this.toClone = ['t', 'r', 'mline', 'esc'];
            },    
            
            mline : 0,
            esc : null,
            
            get : function( stream, state ) {
            
                var ended = 0, found = 0, endBlock, next = "", continueToNextLine,
                    allowMultiline = this.mline, startBlock = this.t, thisBlock = this.tn,
                    charIsEscaped = 0, isEscapedBlock = (T_ESCBLOCK == this.tt), escChar = this.esc
                ;
                
                if ( state.inBlock == thisBlock )
                {
                    found = 1;
                    endBlock = state.endBlock;
                }    
                else if ( !state.inBlock && (endBlock = startBlock.get(stream)) )
                {
                    found = 1;
                    state.inBlock = thisBlock;
                    state.endBlock = endBlock;
                }    
                
                if ( found )
                {
                    this.stackPos = state.stack.length;
                    ended = endBlock.get(stream);
                    continueToNextLine = allowMultiline;
                    
                    while ( !ended && !stream.eol() ) 
                    {
                        //next = stream.nxt();
                        if ( !(isEscapedBlock && charIsEscaped) && endBlock.get(stream) ) 
                        {
                            ended = 1; 
                            break;
                        }
                        else
                        {
                            next = stream.nxt();
                        }
                        charIsEscaped = !charIsEscaped && next == escChar;
                    }
                    continueToNextLine = allowMultiline && (!isEscapedBlock || charIsEscaped);
                    
                    if ( ended || !continueToNextLine )
                    {
                        state.inBlock = null;
                        state.endBlock = null;
                    }
                    else
                    {
                        this.push( state.stack, this );
                    }
                    
                    state.t = this.tt;
                    return this.r;
                }
                
                state.inBlock = null;
                state.endBlock = null;
                return false;
            }
        }),
                
        ZeroOrOneTokens = Class(SimpleToken, {
                
            constructor : function( name, tokens ) {
                this.tt = T_ZEROORONE;
                this.tn = name || null;
                this.t = null;
                this.ts = null;
                this.foundOne = 0;
                this.toClone = ['ts', 'foundOne'];
                if (tokens) this.makeToks( tokens );
            },
            
            ts : null,
            foundOne : 0,
            
            makeToks : function( tokens ) {
                if ( tokens ) this.ts = make_array( tokens );
                return this;
            },
            
            get : function( stream, state ) {
            
                var i, token, style, tokens = this.ts, n = tokens.length, tokensErr = 0, ret = false;
                
                this.ERR = this.foundOne;
                // already found one, no more
                if ( this.ERR ) return false;
                
                // this is optional
                this.required = 0;
                this.streamPos = stream.pos;
                this.stackPos = state.stack.length;
                
                
                for (i=0; i<n; i++)
                {
                    token = tokens[i];
                    style = token.get(stream, state);
                    
                    if ( false !== style )
                    {
                        // push it to the stack for more
                        this.foundOne = 1;
                        this.push( state.stack, this.clone() );
                        this.foundOne = 0;
                        return style;
                    }
                    else if ( token.ERR )
                    {
                        tokensErr++;
                        stream.bck2( this.streamPos );
                    }
                }
                
                //this.ERR = (n == tokensErr) ? true : false;
                return false;
            }
        }),
        
        ZeroOrMoreTokens = Class(ZeroOrOneTokens, {
                
            constructor : function( name, tokens ) {
                this.$super('constructor', name, tokens);
                this.tt = T_ZEROORMORE;
            },
            
            get : function( stream, state ) {
            
                var i, token, style, tokens = this.ts, n = tokens.length, tokensErr = 0, ret = false;
                
                // this is optional
                this.required = 0;
                this.ERR = 0;
                this.streamPos = stream.pos;
                this.stackPos = state.stack.length;
                
                for (i=0; i<n; i++)
                {
                    token = tokens[i];
                    style = token.get(stream, state);
                    
                    if ( false !== style )
                    {
                        // push it to the stack for more
                        this.push( state.stack, this );
                        return style;
                    }
                    else if ( token.ERR )
                    {
                        tokensErr++;
                        stream.bck2( this.streamPos );
                    }
                }
                
                //this.ERR = (n == tokensErr) ? true : false;
                return false;
            }
        }),
        
        OneOrMoreTokens = Class(ZeroOrOneTokens, {
                
            constructor : function( name, tokens ) {
                this.$super('constructor', name, tokens);
                this.tt = T_ONEORMORE;
                this.foundOne = 0;
            },
            
            get : function( stream, state ) {
        
                var style, token, i, tokens = this.ts, n = tokens.length, tokensRequired = 0, tokensErr = 0;
                
                this.required = !this.foundOne;
                this.ERR = 0;
                this.streamPos = stream.pos;
                this.stackPos = state.stack.length;
                
                for (i=0; i<n; i++)
                {
                    token = tokens[i];
                    style = token.get(stream, state);
                    
                    tokensRequired += (token.required) ? 1 : 0;
                    
                    if ( false !== style )
                    {
                        this.foundOne = 1;
                        this.required = 0;
                        this.ERR = 0;
                        // push it to the stack for more
                        this.push( state.stack, this.clone() );
                        this.foundOne = 0;
                        
                        return style;
                    }
                    else if ( token.ERR )
                    {
                        tokensErr++;
                        stream.bck2( this.streamPos );
                    }
                }
                
                this.ERR = (!this.foundOne /*|| n == tokensErr*/) ? 1 : 0;
                return false;
            }
        }),
        
        EitherTokens = Class(ZeroOrOneTokens, {
                
            constructor : function( name, tokens ) {
                this.$super('constructor', name, tokens);
                this.tt = T_EITHER;
            },
            
            get : function( stream, state ) {
            
                var style, token, i, tokens = this.ts, n = tokens.length, tokensRequired = 0, tokensErr = 0;
                
                this.required = 1;
                this.ERR = 0;
                this.streamPos = stream.pos;
                
                for (i=0; i<n; i++)
                {
                    token = tokens[i];
                    style = token.get(stream, state);
                    
                    tokensRequired += (token.required) ? 1 : 0;
                    
                    if ( false !== style )
                    {
                        return style;
                    }
                    else if ( token.ERR )
                    {
                        tokensErr++;
                        stream.bck2( this.streamPos );
                    }
                }
                
                this.required = (tokensRequired > 0) ? 1 : 0;
                this.ERR = (n == tokensErr && tokensRequired > 0) ? 1 : 0;
                return false;
            }
        }),
                
        AllTokens = Class(ZeroOrOneTokens, {
                
            constructor : function( name, tokens ) {
                this.$super('constructor', name, tokens);
                this.tt = T_ALL;
            },
            
            get : function( stream, state ) {
                
                var token, style, tokens = this.ts, n = tokens.length, ret = false;
                
                this.required = 1;
                this.ERR = 0;
                this.streamPos = stream.pos;
                this.stackPos = state.stack.length;
                
                
                token = tokens[ 0 ];
                style = token.require(0).get(stream, state);
                
                if ( false !== style )
                {
                    this.stackPos = state.stack.length;
                    for (var i=n-1; i>0; i--)
                        this.push( state.stack, tokens[i].require(1), n-i );
                    
                    ret = style;
                    
                }
                else if ( token.ERR )
                {
                    this.ERR = 1;
                    stream.bck2( this.streamPos );
                }
                else if ( token.required )
                {
                    this.ERR = 1;
                }
                
                return ret;
            }
        }),
                
        NGramToken = Class(ZeroOrOneTokens, {
                
            constructor : function( name, tokens ) {
                this.$super('constructor', name, tokens);
                this.tt = T_NGRAM;
            },
            
            get : function( stream, state ) {
                
                var token, style, tokens = this.ts, n = tokens.length, ret = false;
                
                this.required = 0;
                this.ERR = 0;
                this.streamPos = stream.pos;
                this.stackPos = state.stack.length;
                
                
                token = tokens[ 0 ];
                style = token.require(0).get(stream, state);
                
                if ( false !== style )
                {
                    this.stackPos = state.stack.length;
                    for (var i=n-1; i>0; i--)
                        this.push( state.stack, tokens[i].require(1), n-i );
                    
                    ret = style;
                }
                else if ( token.ERR )
                {
                    //this.ERR = 1;
                    stream.bck2( this.streamPos );
                }
                
                return ret;
            }
        }),
                
        getTokenizer = function(tokenID, RegExpID, Lex, Syntax, Style, cachedRegexes, cachedMatchers, cachedTokens, comments, keywords) {
            
            if ( !cachedTokens[ tokenID ] )
            {
                var tok, token = null, type, combine, action, matchType, tokens, T;
            
                tok = Lex[ tokenID ] || Syntax[ tokenID ] || null;
                
                if ( tok )
                {
                    T = get_type( tok );
                    // tokens given directly, no token configuration object, wrap it
                    if ( (T_STR | T_ARRAY) & T )
                    {
                        tok = { type: "simple", tokens: tok };
                    }
                    
                    // provide some defaults
                    //type = tok.type || "simple";
                    type = (tok.type) ? tokenTypes[ tok.type.toUpperCase().replace('-', '').replace('_', '') ] : T_SIMPLE;
                    tok.tokens = make_array( tok.tokens );
                    action = tok.action || null;
                    
                    if ( T_SIMPLE & type )
                    {
                        if ( tok.autocomplete ) getAutoComplete(tok, tokenID, keywords);
                        
                        // combine by default if possible using word-boundary delimiter
                        combine = ( 'undefined' ===  typeof(tok.combine) ) ? "\\b" : tok.combine;
                        token = new SimpleToken( 
                                    tokenID,
                                    getCompositeMatcher( tokenID, tok.tokens.slice(), RegExpID, combine, cachedRegexes, cachedMatchers ), 
                                    Style[ tokenID ] || DEFAULTSTYLE
                                );
                    }
                    
                    else if ( T_BLOCK & type )
                    {
                        if ( T_COMMENT & type ) getComments(tok, comments);

                        token = new BlockToken( 
                                    type,
                                    tokenID,
                                    getBlockMatcher( tokenID, tok.tokens.slice(), RegExpID, cachedRegexes, cachedMatchers ), 
                                    Style[ tokenID ] || DEFAULTSTYLE,
                                    tok.multiline,
                                    tok.escape
                                );
                    }
                    
                    else if ( T_GROUP & type )
                    {
                        matchType = groupTypes[ tok.match.toUpperCase() ]; 
                        tokens = tok.tokens.slice();
                        
                        for (var i=0, l=tokens.length; i<l; i++)
                            tokens[i] = getTokenizer( tokens[i], RegExpID, Lex, Syntax, Style, cachedRegexes, cachedMatchers, cachedTokens, comments, keywords );
                        
                        if (T_ZEROORONE & matchType) 
                            token = new ZeroOrOneTokens(tokenID, tokens);
                        
                        else if (T_ZEROORMORE & matchType) 
                            token = new ZeroOrMoreTokens(tokenID, tokens);
                        
                        else if (T_ONEORMORE & matchType) 
                            token = new OneOrMoreTokens(tokenID, tokens);
                        
                        else if (T_EITHER & matchType) 
                            token = new EitherTokens(tokenID, tokens);
                        
                        else //if (T_ALL == matchType)
                            token = new AllTokens(tokenID, tokens);
                    }
                    
                    else if ( T_NGRAM & type )
                    {
                        // get n-gram tokenizer
                        token = make_array_2( tok.tokens.slice() ).slice(); // array of arrays
                        
                        for (var i=0, l=token.length; i<l; i++)
                        {
                            // get tokenizers for each ngram part
                            var ngram = token[i];
                            
                            for (var j=0, l2=ngram.length; j<l2; j++)
                                ngram[j] = getTokenizer( ngram[j], RegExpID, Lex, Syntax, Style, cachedRegexes, cachedMatchers, cachedTokens, comments, keywords );
                            
                            // get a tokenizer for whole ngram
                            token[i] = new NGramToken( tokenID + '_NGRAM_' + i, ngram );
                        }
                    }
                }
                cachedTokens[ tokenID ] = token;
            }
            
            return cachedTokens[ tokenID ];
        },
        
        getComments = function(tok, comments) {
            // build start/end mappings
            var tmp = make_array_2(tok.tokens.slice()); // array of arrays
            var start, end, lead;
            for (i=0, l=tmp.length; i<l; i++)
            {
                start = tmp[i][0];
                end = (tmp[i].length>1) ? tmp[i][1] : tmp[i][0];
                lead = (tmp[i].length>2) ? tmp[i][2] : "";
                
                if ( null === end )
                {
                    // line comment
                    comments.line = comments.line || [];
                    comments.line.push( start );
                }
                else
                {
                    // block comment
                    comments.block = comments.block || [];
                    comments.block.push( [start, end, lead] );
                }
            }
        },
        
        getAutoComplete = function(tok, type, keywords) {
            var kws = [].concat(make_array(tok.tokens)).map(function(word) { return { word: word, meta: type }; });
            keywords.autocomplete = concat.apply( keywords.autocomplete || [], kws );
        },
        
        parseGrammar = function(grammar) {
            var RegExpID, tokens, numTokens, _tokens, 
                Style, Lex, Syntax, t, tokenID, token, tok,
                cachedRegexes, cachedMatchers, cachedTokens, comments, keywords;
            
            // grammar is parsed, return it
            // avoid reparsing already parsed grammars
            if ( grammar.__parsed ) return grammar;
            
            cachedRegexes = {}; cachedMatchers = {}; cachedTokens = {}; comments = {}; keywords = {};
            grammar = extend(grammar, defaultGrammar);
            
            RegExpID = grammar.RegExpID || null;
            grammar.RegExpID = null;
            delete grammar.RegExpID;
            
            Lex = grammar.Lex || {};
            grammar.Lex = null;
            delete grammar.Lex;
            
            Syntax = grammar.Syntax || {};
            grammar.Syntax = null;
            delete grammar.Syntax;
            
            Style = grammar.Style || {};
            
            _tokens = grammar.Parser || [];
            numTokens = _tokens.length;
            tokens = [];
            
            
            // build tokens
            for (t=0; t<numTokens; t++)
            {
                tokenID = _tokens[ t ];
                
                token = getTokenizer( tokenID, RegExpID, Lex, Syntax, Style, cachedRegexes, cachedMatchers, cachedTokens, comments, keywords ) || null;
                
                if ( token )
                {
                    if ( T_ARRAY & get_type( token ) )  tokens = tokens.concat( token );
                    
                    else  tokens.push( token );
                }
            }
            
            grammar.Parser = tokens;
            grammar.Style = Style;
            grammar.Comments = comments;
            grammar.Keywords = keywords;
            
            // this grammar is parsed
            grammar.__parsed = 1;
            
            return grammar;
        }
    ;
      
    // ace supposed to be available
    var _ace = ace || { }, ace_require;
    ace_require = _ace.require || function() { return { }; };
    
    //
    // parser factories
    var
        AceRange = ace_require('ace/range').Range || Object,
        // support folding/unfolding
        /*
        AceFoldMode = ace_require('ace/mode/folding/fold_mode').FoldMode || Object,
        ParserFoldMode = Class(AceFoldMode, {
            constructor: function(start, stop) {
                this.foldingStartMarker = start || null;
                this.foldingStopMarker = stop || null;
            },
            
            foldingStartMarker : null,
            foldingStopMarker : null,
            
            getFoldWidget : function(session, foldStyle, row) {
                if ( !this.foldingStartMarker ) return;
                var line = session.getLine(row);
                if (this.foldingStartMarker.test(line)) return "start";
                if (foldStyle == "markbeginend" && this.foldingStopMarker && this.foldingStopMarker.test(line)) return "end";
                return "";
            },

            getFoldWidgetRange : function(session, foldStyle, row, forceMultiline) {
                var line = session.getLine(row);
                var match = line.match(this.foldingStartMarker);
                if (match) 
                {
                    var i = match.index;

                    if (match[1])  return this.openingBracketBlock(session, match[1], row, i);

                    var range = session.getCommentFoldRange(row, i + match[0].length, 1);

                    if (range && !range.isMultiLine()) 
                    {
                        if (forceMultiline) 
                            range = this.getSectionRange(session, row);
                        else if (foldStyle != "all")   
                            range = null;
                    }

                    return range;
                }

                if (foldStyle === "markbegin")  return;

                var match = line.match(this.foldingStopMarker);
                if (match) 
                {
                    var i = match.index + match[0].length;

                    if (match[1])
                        return this.closingBracketBlock(session, match[1], row, i);

                    return session.getCommentFoldRange(row, i, -1);
                }
            },

            getSectionRange : function(session, row) {
                var line = session.getLine(row);
                var startIndent = line.search(/\S/);
                var startRow = row;
                var startColumn = line.length;
                row = row + 1;
                var endRow = row;
                var maxRow = session.getLength();
                while (++row < maxRow) 
                {
                    line = session.getLine(row);
                    var indent = line.search(/\S/);
                    if (indent === -1)
                        continue;
                    if  (startIndent > indent)
                        break;
                    var subRange = this.getFoldWidgetRange(session, "all", row);

                    if (subRange) 
                    {
                        if (subRange.start.row <= startRow) 
                            break;
                        else if (subRange.isMultiLine()) 
                            row = subRange.end.row;
                        else if (startIndent == indent) 
                            break;
                    }
                    endRow = row;
                }

                return new AceRange(startRow, startColumn, endRow, session.getLine(endRow).length);
            },

            indentationBlock : function(session, row, column) {
                var re = /\S/;
                var line = session.getLine(row);
                var startLevel = line.search(re);
                if (startLevel == -1) return;

                var startColumn = column || line.length;
                var maxRow = session.getLength();
                var startRow = row;
                var endRow = row;

                while (++row < maxRow) 
                {
                    var level = session.getLine(row).search(re);

                    if (level == -1)
                    continue;

                    if (level <= startLevel)
                    break;

                    endRow = row;
                }

                if (endRow > startRow) 
                {
                    var endColumn = session.getLine(endRow).length;
                    return new AceRange(startRow, startColumn, endRow, endColumn);
                }
            },

            openingBracketBlock : function(session, bracket, row, column, typeRe) {
                var start = {row: row, column: column + 1};
                var end = session.$findClosingBracket(bracket, start, typeRe);
                if (!end) return;

                var fw = session.foldWidgets[end.row];
                if (fw == null)
                fw = session.getFoldWidget(end.row);

                if (fw == "start" && end.row > start.row) 
                {
                    end.row --;
                    end.column = session.getLine(end.row).length;
                }
                return AceRange.fromPoints(start, end);
            },

            closingBracketBlock : function(session, bracket, row, column, typeRe) {
                var end = {row: row, column: column};
                var start = session.$findOpeningBracket(bracket, end);

                if (!start) return;

                start.column++;
                end.column--;

                return  AceRange.fromPoints(start, end);
            }
        }),
        */
        // support indentation/behaviours/comments toggle
        AceBehaviour = ace_require('ace/mode/behaviour').Behaviour || null,
        AceTokenizer = ace_require('ace/tokenizer').Tokenizer || Object,
        AceTokenIterator = ace_require('ace/token_iterator').TokenIterator || Object,
        AceParser = Class(AceTokenizer, {
            
            constructor: function(grammar, LOC) {
                //this.LOC = LOC;
                //this.Grammar = grammar;
                //this.Comments = grammar.Comments || {};
                
                // support comments toggle
                this.LC = (grammar.Comments && grammar.Comments.line) ? grammar.Comments.line : null;
                this.BC = (grammar.Comments && grammar.Comments.block) ? { start: grammar.Comments.block[0][0], end: grammar.Comments.block[0][1] } : null;
                if ( this.LC )
                {
                    if ( T_ARRAY & get_type(this.LC) ) 
                    {
                        var rxLine = this.LC.map( escRegexp ).join( "|" );
                    } 
                    else 
                    {
                        var rxLine = escRegexp( this.LC );
                    }
                    this.rxLine = new RegExp("^(\\s*)(?:" + rxLine + ") ?");
                }
                if ( this.BC )
                {
                    this.rxStart = new RegExp("^(\\s*)(?:" + escRegexp(this.BC.start) + ")");
                    this.rxEnd = new RegExp("(?:" + escRegexp(this.BC.end) + ")\\s*$");
                }

                this.DEF = LOC.DEFAULT;
                this.ERR = (grammar.Style && grammar.Style.error) ? grammar.Style.error : LOC.ERROR;
                
                // support keyword autocompletion
                this.Keywords = (grammar.Keywords && grammar.Keywords.autocomplete) ? grammar.Keywords.autocomplete : null;
                
                this.Tokens = grammar.Parser || [];
            },
            
            //LOC: null,
            //Grammar: null,
            //Comments: null,
            //$behaviour: null,
            ERR: null,
            DEF: null,
            LC: null,
            BC: null,
            rxLine: null,
            rxStart: null,
            rxEnd: null,
            Keywords: null,
            Tokens: null,

            // ACE Tokenizer compatible
            getLineTokens: function(line, state, row) {
                
                var i, rewind, 
                    tokenizer, tokens = this.Tokens, numTokens = tokens.length, 
                    aceTokens, token, type, 
                    stream, stack,
                    DEFAULT = this.DEF,
                    ERROR = this.ERR
                ;
                
                aceTokens = []; 
                stream = new ParserStream( line );
                state = (state) ? state.clone( ) : new ParserState( );
                state.id = 1+row;
                stack = state.stack;
                token = { type: null, value: "" };
                type = null;
                
                while ( !stream.eol() )
                {
                    rewind = false;
                    
                    if ( type && type !== token.type )
                    {
                        if ( token.type ) aceTokens.push( token );
                        token = { type: type, value: stream.cur() };
                        stream.sft();
                    }
                    else if ( token.type )
                    {
                        token.value += stream.cur();
                        stream.sft();
                    }
                    
                    if ( stream.spc() ) 
                    {
                        state.t = T_DEFAULT;
                        type = DEFAULT;
                        continue;
                    }
                    
                    while ( stack.length && !stream.eol() )
                    {
                        tokenizer = stack.pop();
                        type = tokenizer.get(stream, state);
                        
                        // match failed
                        if ( false === type )
                        {
                            // error
                            if ( tokenizer.ERR || tokenizer.required )
                            {
                                // empty the stack
                                stack.length = 0;
                                // skip this character
                                stream.nxt();
                                // generate error
                                state.t = T_ERROR;
                                type = ERROR;
                                rewind = true;
                                break;
                            }
                            // optional
                            else
                            {
                                continue;
                            }
                        }
                        // found token
                        else
                        {
                            rewind = true;
                            break;
                        }
                    }
                    
                    if ( rewind ) continue;
                    if ( stream.eol() ) break;
                    
                    for (i=0; i<numTokens; i++)
                    {
                        tokenizer = tokens[i];
                        type = tokenizer.get(stream, state);
                        
                        // match failed
                        if ( false === type )
                        {
                            // error
                            if ( tokenizer.ERR || tokenizer.required )
                            {
                                // empty the stack
                                stack.length = 0;
                                // skip this character
                                stream.nxt();
                                // generate error
                                state.t = T_ERROR;
                                type = ERROR;
                                rewind = true;
                                break;
                            }
                            // optional
                            else
                            {
                                continue;
                            }
                        }
                        // found token
                        else
                        {
                            rewind = true;
                            break;
                        }
                    }
                    
                    if ( rewind ) continue;
                    if ( stream.eol() ) break;
                    
                    // unknown, bypass
                    stream.nxt();
                    state.t = T_DEFAULT;
                    type = DEFAULT;
                }
                
                if ( type && type !== token.type )
                {
                    if ( token.type ) aceTokens.push( token );
                    aceTokens.push( { type: type, value: stream.cur() } );
                }
                else if ( token.type )
                {
                    token.value += stream.cur();
                    aceTokens.push( token );
                }
                token = null; //{ type: null, value: "" };
                //console.log(aceTokens);
                
                // ACE Tokenizer compatible
                return { state: state, tokens: aceTokens };
            },
            
            tCL : function(state, session, startRow, endRow) {
                var doc = session.doc;
                var ignoreBlankLines = true;
                var shouldRemove = true;
                var minIndent = Infinity;
                var tabSize = session.getTabSize();
                var insertAtTabStop = false;
                
                if ( !this.LC ) 
                {
                    if ( !this.BC ) return false;
                    
                    var lineCommentStart = this.BC.start;
                    var lineCommentEnd = this.BC.end;
                    var regexpStart = this.rxStart;
                    var regexpEnd = this.rxEnd;

                    var comment = function(line, i) {
                        if (testRemove(line, i)) return;
                        if (!ignoreBlankLines || /\S/.test(line)) 
                        {
                            doc.insertInLine({row: i, column: line.length}, lineCommentEnd);
                            doc.insertInLine({row: i, column: minIndent}, lineCommentStart);
                        }
                    };

                    var uncomment = function(line, i) {
                        var m;
                        if (m = line.match(regexpEnd))
                            doc.removeInLine(i, line.length - m[0].length, line.length);
                        if (m = line.match(regexpStart))
                            doc.removeInLine(i, m[1].length, m[0].length);
                    };

                    var testRemove = function(line, row) {
                        if (regexpStart.test(line)) return true;
                        var tokens = session.getTokens(row);
                        for (var i = 0; i < tokens.length; i++) 
                        {
                            if (tokens[i].type === 'comment') return true;
                        }
                    };
                } 
                else 
                {
                    var lineCommentStart = (T_ARRAY == get_type(this.LC)) ? this.LC[0] : this.LC;
                    var regexpLine = this.rxLine;
                    var commentWithSpace = lineCommentStart + " ";
                    
                    insertAtTabStop = session.getUseSoftTabs();

                    var uncomment = function(line, i) {
                        var m = line.match(regexpLine);
                        if (!m) return;
                        var start = m[1].length, end = m[0].length;
                        if (!shouldInsertSpace(line, start, end) && m[0][end - 1] == " ")  end--;
                        doc.removeInLine(i, start, end);
                    };
                    
                    var comment = function(line, i) {
                        if (!ignoreBlankLines || /\S/.test(line)) 
                        {
                            if (shouldInsertSpace(line, minIndent, minIndent))
                                doc.insertInLine({row: i, column: minIndent}, commentWithSpace);
                            else
                                doc.insertInLine({row: i, column: minIndent}, lineCommentStart);
                        }
                    };
                    
                    var testRemove = function(line, i) {
                        return regexpLine.test(line);
                    };

                    var shouldInsertSpace = function(line, before, after) {
                        var spaces = 0;
                        while (before-- && line.charAt(before) == " ") spaces++;
                        if (spaces % tabSize != 0) return false;
                        var spaces = 0;
                        while (line.charAt(after++) == " ") spaces++;
                        if (tabSize > 2)  return spaces % tabSize != tabSize - 1;
                        else  return spaces % tabSize == 0;
                        return true;
                    };
                }

                function iterate( applyMethod ) { for (var i=startRow; i<=endRow; i++) applyMethod(doc.getLine(i), i); }


                var minEmptyLength = Infinity;
                
                iterate(function(line, i) {
                    var indent = line.search(/\S/);
                    if (indent !== -1) 
                    {
                        if (indent < minIndent)  minIndent = indent;
                        if (shouldRemove && !testRemove(line, i)) shouldRemove = false;
                    } 
                    else if (minEmptyLength > line.length)
                    {
                        minEmptyLength = line.length;
                    }
                });

                if (minIndent == Infinity) 
                {
                    minIndent = minEmptyLength;
                    ignoreBlankLines = false;
                    shouldRemove = false;
                }

                if (insertAtTabStop && minIndent % tabSize != 0)
                    minIndent = Math.floor(minIndent / tabSize) * tabSize;

                iterate(shouldRemove ? uncomment : comment);
            },

            tBC : function(state, session, range, cursor) {
                var comment = this.BC;
                if (!comment) return;

                var iterator = new AceTokenIterator(session, cursor.row, cursor.column);
                var token = iterator.getCurrentToken();

                var sel = session.selection;
                var initialRange = session.selection.toOrientedRange();
                var startRow, colDiff;

                if (token && /comment/.test(token.type)) 
                {
                    var startRange, endRange;
                    while (token && /comment/.test(token.type)) 
                    {
                        var i = token.value.indexOf(comment.start);
                        if (i != -1) 
                        {
                            var row = iterator.getCurrentTokenRow();
                            var column = iterator.getCurrentTokenColumn() + i;
                            startRange = new AceRange(row, column, row, column + comment.start.length);
                            break
                        }
                        token = iterator.stepBackward();
                    };

                    var iterator = new AceTokenIterator(session, cursor.row, cursor.column);
                    var token = iterator.getCurrentToken();
                    while (token && /comment/.test(token.type)) 
                    {
                        var i = token.value.indexOf(comment.end);
                        if (i != -1) 
                        {
                            var row = iterator.getCurrentTokenRow();
                            var column = iterator.getCurrentTokenColumn() + i;
                            endRange = new AceRange(row, column, row, column + comment.end.length);
                            break;
                        }
                        token = iterator.stepForward();
                    }
                    if (endRange)
                        session.remove(endRange);
                    if (startRange) 
                    {
                        session.remove(startRange);
                        startRow = startRange.start.row;
                        colDiff = -comment.start.length
                    }
                } 
                else 
                {
                    colDiff = comment.start.length
                    startRow = range.start.row;
                    session.insert(range.end, comment.end);
                    session.insert(range.start, comment.start);
                }
                if (initialRange.start.row == startRow)
                    initialRange.start.column += colDiff;
                if (initialRange.end.row == startRow)
                    initialRange.end.column += colDiff;
                session.selection.fromOrientedRange(initialRange);
            },
            
            // Default indentation, TODO
            indent : function(line) { return line.match(/^\s*/)[0]; },
            
            getNextLineIndent : function(state, line, tab) { return line.match(/^\s*/)[0]; }
        }),
        
        getParser = function(grammar, LOCALS) {
            return new AceParser(grammar, LOCALS);
        },
        
        getAceMode = function(parser) {
            
            // ACE-compatible Mode
            return {
                /*
                // Maybe needed in later versions..
                
                createWorker: function(session) { return null; },

                createModeDelegates: function (mapping) { },

                $delegator: function(method, args, defaultHandler) { },
                */
                
                // the custom Parser/Tokenizer
                getTokenizer: function() { return parser; },
                
                //HighlightRules: null,
                //$behaviour: parser.$behaviour || null,

                transformAction: function(state, action, editor, session, param) { },
                
                //lineCommentStart: parser.LC,
                //blockComment: parser.BC,
                toggleCommentLines: function(state, session, startRow, endRow) { return parser.tCL(state, session, startRow, endRow); },
                toggleBlockComment: function(state, session, range, cursor) { return parser.tBC(state, session, range, cursor); },

                //$getIndent: function(line) { return parser.indent(line); },
                getNextLineIndent: function(state, line, tab) { return parser.getNextLineIndent(state, line, tab); },
                checkOutdent: function(state, line, input) { return false; },
                autoOutdent: function(state, doc, row) { },

                //$createKeywordList: function() { return parser.$createKeywordList(); },
                getKeywords: function( append ) { 
                    var keywords = parser.Keywords;
                    if ( !keywords ) return [];
                    return keywords.map(function(word) {
                        var w = word.word, wm = word.meta;
                        return {
                            name: w,
                            value: w,
                            score: 1000,
                            meta: wm
                        };
                    });
                },
                getCompletions : function(state, session, pos, prefix) {
                    var keywords = parser.Keywords;
                    if ( !keywords ) return [];
                    var len = prefix.length;
                    return keywords.map(function(word) {
                        var w = word.word, wm = word.meta, wl = w.length;
                        var match = (wl >= len) && (prefix == w.substr(0, len));
                        return {
                            name: w,
                            value: w,
                            score: (match) ? (1000 - wl) : 0,
                            meta: wm
                        };
                    });
                }
            };
        },
        
        getMode = function(grammar, DEFAULT) {
            
            var LOCALS = { 
                    // default return code for skipped or not-styled tokens
                    // 'text' should be used in most cases
                    DEFAULT: DEFAULT || DEFAULTSTYLE,
                    ERROR: DEFAULTERROR
                }
            ;
            
            // build the grammar
            grammar = parseGrammar( grammar );
            //console.log(grammar);
            
            return getAceMode( getParser( grammar, LOCALS ) );
        }
    ;
      
    //
    //  Ace Grammar main class
    /**[DOC_MARKDOWN]
    *
    * ###AceGrammar Methods
    *
    * __For node with dependencies:__
    *
    * ```javascript
    * AceGrammar = require('build/ace_grammar.js').AceGrammar;
    * // or
    * AceGrammar = require('build/ace_grammar.bundle.js').AceGrammar;
    * ```
    *
    * __For browser with dependencies:__
    *
    * ```html
    * <script src="../build/ace_grammar.bundle.js"></script>
    * <!-- or -->
    * <script src="../build/classy.js"></script>
    * <script src="../build/regexanalyzer.js"></script>
    * <script src="../build/ace_grammar.js"></script>
    * <script> // AceGrammar.getMode(..) , etc.. </script>
    * ```
    *
    [/DOC_MARKDOWN]**/
    DEFAULTSTYLE = "text";
    DEFAULTERROR = "invalid";
    var self = {
        
        VERSION : "0.5",
        
        // extend a grammar using another base grammar
        /**[DOC_MARKDOWN]
        * __Method__: *extend*
        *
        * ```javascript
        * extendedgrammar = AceGrammar.extend(grammar, basegrammar1 [, basegrammar2, ..]);
        * ```
        *
        * Extend a grammar with basegrammar1, basegrammar2, etc..
        *
        * This way arbitrary dialects and variations can be handled more easily
        [/DOC_MARKDOWN]**/
        extend : extend,
        
        // parse a grammar
        /**[DOC_MARKDOWN]
        * __Method__: *parse*
        *
        * ```javascript
        * parsedgrammar = AceGrammar.parse(grammar);
        * ```
        *
        * This is used internally by the AceGrammar Class
        * In order to parse a JSON grammar to a form suitable to be used by the syntax-highlight parser.
        * However user can use this method to cache a parsedgrammar to be used later.
        * Already parsed grammars are NOT re-parsed when passed through the parse method again
        [/DOC_MARKDOWN]**/
        parse : parseGrammar,
        
        // get an ACE-compatible syntax-highlight mode from a grammar
        /**[DOC_MARKDOWN]
        * __Method__: *getMode*
        *
        * ```javascript
        * mode = AceGrammar.getMode(grammar, [, DEFAULT]);
        * ```
        *
        * This is the main method which transforms a JSON grammar into an ACE syntax-highlight parser.
        * DEFAULT is the default return value ("text" by default) for things that are skipped or not styled
        * In general there is no need to set this value, unless you need to return something else
        [/DOC_MARKDOWN]**/
        getMode : getMode
    };
    
    // export it
    return self;
});