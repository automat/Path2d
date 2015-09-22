var DEFAULT_OPTIONS = {
    /**
     * Number of points to create path segments for
     * [cubicCurveTo]{@link Path2d#cubicCurveTo}.
     * @type {Number}
     */
    numCurvePointsCubic : 30,
    /**
     * Number of points to create path segments for
     * [quadraticCurveTo]{@link Path2d#quadraticCurveTo}.
     * @type {Number}
     */
    numCurvePointsQuadratic : 30,
    /**
     * Number of points to create path segments for
     * [arc]{@link Path2d#arc} and
     * [arcTo]{@link Path2d#arcTo}.
     * @type {Number}
     */
    numArcPoints : 30,
    /**
     * Number of points to create path segments for
     * [ellipse]{@link Path2d#ellipse} and
     * [ellipseAt]{@link Path2d#ellipseAt}.
     * @type {Number}
     */
    numEllipsePoints : 60,
    /**
     * If true, paths will create a list of sub-paths and
     * calculate all activated sub-path components.
     * @type {Boolean}
     */
    recordPoints  : true,
    /**
     * If true, paths will create svg path commands on every path modifier call,
     * which can be retrieved by [getSvgPathCmd]{@link Path2d#getSvgPathCmd}.
     * @type {Boolean}
     */
    recordSvgCmd  : true,
    /**
     * If true tangents and normals will be calculated for sub-path points.
     * @type {Boolean}
     */
    calcTangentsAndNormals  : true
};

/*--------------------------------------------------------------------------------------------------------------------*/
// Utilities
/*--------------------------------------------------------------------------------------------------------------------*/

function validateOptions(options){
    for(var p in options){
        if(DEFAULT_OPTIONS[p] === undefined){
            throw new Error('Invalid option: "' + p + '"');
        }
    }
}

function createSvgPathCmdMoveTo(x,y){
    return 'M ' + x + ' ' + y ;
}

function createSvgPathCmdLineTo(x,y){
    return 'L ' + x + ' ' + y ;
}

function createSvgPathCmdArc(rx,ry,rotation,largeArcFlag,sweepFlag,x,y){
    return 'A ' + rx  + ' ' + ry + ' ' + rotation + ' ' + largeArcFlag + ' ' + sweepFlag + ' ' + x + ' ' + y;
}

function createSvgPathCmdQuadraticCurveTo(x1,y1,x,y){
    return 'Q ' + x1 + ' ' + y1 + ' ' + x + ' ' + y;
}

function createSvgPathCmdCubicCurveTo(x1,y1,x2,y2,x,y){
    return 'C ' + x1 + ' ' + y1 + ' ' + x2 + ' ' + y2 + ' ' + x + ' ' + y;
}

function createSvgPathCmdClose(){
    return 'Z';
}

function fmod(a,b){ return Number((a - (Math.floor(a / b) * b)).toPrecision(8)); }

var PI2 = Math.PI * 2;

/*--------------------------------------------------------------------------------------------------------------------*/
// SubPath
/*--------------------------------------------------------------------------------------------------------------------*/

var TYPE_LINE  = 0;
var TYPE_CURVE = 1;

/**
 * 2d sub-path representation. Path points are manipulated through parent path.
 * @constructor
 */
function SubPath(){

    /**
     * The type of the sub-path. 0 - Straight, 1 - Curve
     * @type {Number}
     */
    this.type = 0;

    /**
     * An array of positions. [x,y,x,y,x,y,...]
     * @type {Array}
     */
    this.points = [];

    /**
     * Tangents per positions. (If activated in parent path.)
     * @type {Array}
     */
    this.tangents = [];

    /**
     * Normals per positions. (If activated in parent path.)
     * @type {Array}
     */
    this.normals = [];

    /**
     * The total length of the sub-path.
     * @type {number}
     */
    this.length = 0;

    /**
     * The global offset of the sub-path relative to the paths total length.
     * @type {number}
     */
    this.offset = 0;

    /**
     * The offsets of the sub-path segments.
     * @type {Array}
     */
    this.segmentOffsets = [];

    /**
     * The lengths of ths sub-path segments.
     * @type {Array}
     */
    this.segmentLengths = [];


    this.cmd = '';

    /**
     * True if the sub-path is closed.
     * @type {boolean}
     */
    this.closed = false;

    this._dirty = true;
}

function clearSubPath(subPath){
    subPath.type = 0;
    subPath.length = 0;
    subPath.offset = 0;

    subPath.points.length = 0;
    subPath.tangents.length = 0;
    subPath.normals.length = 0;

    subPath.segmentOffsets.length = 0;
    subPath.segmentLengths.length = 0;


    subPath.closed = false;

    subPath._dirty = true;

    return subPath;
}

function copySubPath(subPath){
    var out = new SubPath();

    out.type           = subPath.type;
    out.points         = subPath.points.slice(0);
    out.length         = subPath.length;
    out.offset         = subPath.offset;
    out.closed         = subPath.closed;
    out.segmentLengths = subPath.segmentLengths.slice(0);
    out.tangents       = subPath.tangents.slice(0);
    out.normals        = subPath.normals.slice(0);
    out._dirty         = subPath._dirty;

    return out;
}

/*--------------------------------------------------------------------------------------------------------------------*/
// Path2d
/*--------------------------------------------------------------------------------------------------------------------*/

/**
 * 2d path representation
 * @param {Object} [options]
 * @constructor
 */
function Path2d(options){
    options = options || DEFAULT_OPTIONS;

    validateOptions(options);

    options.recordPoints = options.recordPoints === undefined ?
        DEFAULT_OPTIONS.recordPoints :
        options.recordPoints;

    options.recordSvgCmd = options.recordSvgCmd === undefined ?
        DEFAULT_OPTIONS.recordSvgCmd :
        options.recordSvgCmd;

    options.numCurvePointsCubic = options.numCurvePointsCubic === undefined ?
        DEFAULT_OPTIONS.numCurvePointsCubic :
        options.numCurvePointsCubic;

    options.numCurvePointsQuadratic = options.numCurvePointsQuadratic === undefined ?
        DEFAULT_OPTIONS.numCurvePointsQuadratic :
        options.numCurvePointsQuadratic;

    options.numArcPoints = options.numArcPoints === undefined ?
        DEFAULT_OPTIONS.numArcPoints :
        options.numArcPoints;

    options.numEllipsePoints = options.numEllipsePoints == undefined ?
        DEFAULT_OPTIONS.numEllipsePoints :
        options.numEllipsePoints;

    options.calcTangentsAndNormals = options.calcTangentsAndNormals === undefined ?
        DEFAULT_OPTIONS.calcTangentsAndNormals :
        options.calcTangentsAndNormals;

    if(!options.recordPoints && !options.recordSvgCmd){
        throw new Error('Path2d: No point or svg recording enabled.');
    }

    if(!options.recordPoints && options.calcTangentsAndNormals){
        throw new Error('Path2d: Tangent and normal calculation can only be enabled if points get recorded.');
    }

    this._numCurvePointsCubic     = options.numCurvePointsCubic;
    this._numCurvePointsQuadratic = options.numCurvePointsQuadratic;
    this._numArcPoints            = options.numArcPoints;
    this._numEllipsePoints        = options.numEllipsePoints;

    this._recordPoints = options.recordPoints;
    this._recordSvgCmd = options.recordSvgCmd;

    this._calcTangentsAndNormals = options.calcTangentsAndNormals;

    this._subPaths = [];
    this._subPath  = null;

    this._subPathCmds = [];
    this._pathCmd     = '';

    this._dirty = false;
    this._lengthTotal = -1;

    this._tempSegIndicesRatio = [
        0,    //index sub-path
        0, 0, //index point a & b
        0     //ratio
    ];

    this._tempSegIndices = [
        0,    //index sub-path
        0     //index point
    ];

    this._tempSegPoint = [
        0, 0, //0,1 – point on segment x,y
        0,    //2   – distance point on segment to input
        0,    //3   – sub-path index
        0,    //4   – segment index
        0     //5   – distance on path
    ];

    this._tempSegIndicesOut  = [0,0];
    this._tempSubPathPoint   = [0,0,0,0,0,0];
    this._tempPointOut       = [0,0,0,0,0,0];
    this._tempPointProjected = [0,0,0,0,0,0];

    this._lengthIndexRatioPassedPrev = -1;
    this._lengthIndexPassedPrev = -1;

    if(this._calcTangentsAndNormals){
        this._update = this._updateB;
    } else {
        this._update = this._updateA;
    }
}

/*--------------------------------------------------------------------------------------------------------------------*/
// Internal
/*--------------------------------------------------------------------------------------------------------------------*/

/**
 * Returns the sub-path segment index at the length given.
 * @param length
 * @returns {Array}
 * @private
 */
Path2d.prototype._getSegIndexAtLength = function(length){
    var out = this._tempSegIndices;

    var subPaths = this._subPaths;
    var lengthTotal = this._lengthTotal;

    if(length <= 0){
        out[0] = out[1] = 0;
        return out;
    } else if(length >= lengthTotal){
        var last = subPaths.length - 1;
        out[0] = last;
        out[1] = subPaths[last].points.length / 2 - 1;
        return out;
    }

    var subPath;

    var subPathIndex = -1;
    for(var i = 0, l = subPaths.length - 1, subPathNext; i < l; ++i){
        subPath     = subPaths[i  ];
        subPathNext = subPaths[i+1];
        if(length >= subPath.offset && length < subPathNext.offset){
            subPathIndex = i;
            break;
        }
    }

    subPathIndex = out[0] = (subPathIndex == -1) ? l : subPathIndex;
    subPath      = subPaths[subPathIndex];

    var segmentLength;
    var segmentLengths = subPath.segmentLengths;
    var remaining = length - subPath.offset;

    for(var i = 0, j = 0, l = segmentLengths.length; i < l; ++i, j+=2){
        segmentLength = segmentLengths[i];
        if(segmentLength < remaining){
            remaining -= segmentLength;
            continue;
        }
        out[1] = i;
        break;
    }

    return out;
};

/**
 * Returns the sub-path segment index and ration between segment start and end at the length given.
 * @param length
 * @returns {Array}
 * @private
 */
Path2d.prototype._getIndicesAndRatioAtLength = function(length){
    var out = this._tempSegIndicesRatio;

    var subPaths = this._subPaths;
    var lengthTotal = this._lengthTotal;

    var subPath;

    if(length <= 0){
        out[0] = 0;
        out[1] = out[2] = 0;
        out[3] = 0;

        return out;
    }else if (length >= lengthTotal){
        var last = subPaths.length - 1;
        out[0] = last;
        out[1] = out[2] = subPaths[last].points.length / 2 - 1;
        out[3] = 1.0;

        return out;
    }

    var subPathIndex = -1;
    for(var i = 0, l = subPaths.length - 1, subPathNext; i < l; ++i){
        subPath     = subPaths[i  ];
        subPathNext = subPaths[i+1];
        if(length >= subPath.offset && length < subPathNext.offset){
            subPathIndex = i;
            break;
        }
    }

    subPathIndex = out[0] = (subPathIndex == -1) ? l : subPathIndex;
    subPath      = subPaths[subPathIndex];

    var segmentLength;
    var segmentLengths = subPath.segmentLengths;

    var remaining = length - subPath.offset;
    var ratio;

    for(var i = 0, j = 0, l = segmentLengths.length; i < l; ++i, j+=2){
        segmentLength = segmentLengths[i];
        if(segmentLength < remaining){
            remaining -= segmentLength;
            continue;
        }

        ratio = remaining / segmentLength;

        out[1] = i;
        out[2] = i+1;
        out[3] = ratio;
        break;
    }

    return out;
};

/**
 * Updates on lengths.
 * @private
 */
Path2d.prototype._updateA = function(){
    var subPaths = this._subPaths;
    var subPath;

    var lengthSegment;
    var lengthLocal;
    var lengthGlobal = 0;

    var points;
    var pointsLength;

    var numSegments;
    var segmentLengths;
    var segmentOffsets;

    var dx, dy;

    for(var i = 0, l = subPaths.length; i < l; ++i){
        subPath = subPaths[i];

        if(!subPath._dirty){
            subPath.offset = lengthGlobal;
            lengthGlobal  += subPath.length;
            continue;
        }

        points       = subPath.points;
        pointsLength = points.length;

        numSegments    = pointsLength / 2 - 1;
        segmentLengths = subPath.segmentLengths;
        segmentOffsets = subPath.segmentOffsets;

        segmentLengths.length = segmentOffsets.length =
            segmentLengths.length == numSegments ?
            segmentLengths.length :
            numSegments;

        lengthLocal = 0;

        for(var j = 0, m = 0, k = points.length-2; j < k; j+=2, m++){
            dx = points[j+2] - points[j  ];
            dy = points[j+3] - points[j+1];

            lengthSegment     = segmentLengths[m] = Math.sqrt(dx * dx + dy * dy);
            segmentOffsets[m] = lengthLocal;
            lengthLocal      += lengthSegment;
        }

        subPath.length = lengthLocal;
        lengthGlobal  += lengthLocal;

        subPath._dirty = false;
    }

    this._lengthTotal = lengthGlobal;
};

/**
 * Updates lengths, tangents and normals.
 * @private
 */
Path2d.prototype._updateB = function(){
    var subPaths = this._subPaths;
    var subPath;

    var lengthSegment;
    var lengthLocal;
    var lengthGlobal = 0;

    var points;
    var pointsLength;

    var numSegments;
    var segmentLengths;
    var segmentOffsets;

    var tangents;
    var normals;
    var dx, dy;
    var tx, ty;

    for(var i = 0, l = subPaths.length; i < l; ++i){
        subPath = subPaths[i];

        if(!subPath._dirty){
            lengthGlobal += subPath.length;
            continue;
        }

        points       = subPath.points;
        pointsLength = points.length;

        tangents = subPath.tangents;
        normals  = subPath.normals;

        numSegments    = pointsLength / 2 - 1;
        segmentLengths = subPath.segmentLengths;
        segmentOffsets = subPath.segmentOffsets;

        if(segmentLengths != pointsLength){
            tangents.length = normals.length = pointsLength;
            for(var j = (segmentLengths + 1) * 2; j < pointsLength; j++){
                tangents[j] = tangents[j] = 0;
            }

            segmentLengths.length = numSegments;
        }

        subPath.offset = lengthGlobal;

        lengthLocal = 0;

        for(var j = 0, m = 0, k = points.length-2; j < k; j+=2, m++){
            dx = points[j+2] - points[j  ];
            dy = points[j+3] - points[j+1];

            lengthSegment     = segmentLengths[m] = Math.sqrt(dx * dx + dy * dy);
            segmentOffsets[m] = lengthLocal;
            lengthLocal      += lengthSegment;

            lengthSegment = 1.0 / (lengthSegment || 1.0);
            tangents[j  ] = tx = dx * lengthSegment;
            tangents[j+1] = ty = dy * lengthSegment;

            normals[j  ] = -ty;
            normals[j+1] =  tx;
        }

        tangents[k  ] = tangents[k-2];
        tangents[k+1] = tangents[k-1];

        normals[k  ] = normals[k-2];
        normals[k+1] = normals[k-1];

        subPath.length = lengthLocal;
        lengthGlobal  += lengthLocal;
    }

    this._lengthTotal = lengthGlobal;
};

/**
 * Handles sub-path creation if the desired type differs.
 * @param from
 * @param to
 * @private
 */
Path2d.prototype._ensureSubPathType = function(from,to){
    var subPath = this._subPath;
    var points  = subPath.points;

    if(points.length === 2){
        subPath.type = to;
        return;
    }

    if(subPath.type === from){
        this.moveTo(
            points[points.length - 2],
            points[points.length - 1]
        );
        this._subPath.type = to;
    }
};

Path2d.prototype._getPointOnSegment = function(point,subPathIndex,segIndex,out){
    var subPath  = this._subPaths[subPathIndex];
    var points   = subPath.points;

    var index = segIndex * 2;

    var startx = points[index];
    var starty = points[index + 1];
    var endx   = points[index + 2];
    var endy   = points[index + 3];

    var px = point[0];
    var py = point[1];

    var a = px - startx;
    var b = py - starty;
    var c = endx - startx;
    var d = endy - starty;

    var dot = a * c + b * d;
    var len = c * c + d * d;
    var ppx, ppy;

    if(dot <= 0){
        ppx = startx;
        ppy = starty;
    } else if(dot >= len){
        ppx = endx;
        ppy = endy;
    } else {
        var t = dot / len;
        ppx = startx + t * c;
        ppy = starty + t * d;
    }

    out[0] = ppx;
    out[1] = ppy;

    var dx = ppx - px;
    var dy = ppy - py;

    out[2] = Math.sqrt(dx * dx + dy * dy);

    out[3] = subPathIndex;
    out[4] = segIndex;

    dx = startx - ppx;
    dy = starty - ppy;

    out[5] = subPath.offset + subPath.segmentOffsets[segIndex] + Math.sqrt(dx * dx + dy * dy);

    return out;
};

Path2d.prototype._getPointOnSubPath = function(point,subPathIndex,out){
    var subPath = this._subPaths[subPathIndex];
    var points  = subPath.points;

    var distanceToPoint;
    var distanceMin = Number.MAX_VALUE;

    var pointOnSegment = this._tempSegPoint;

    var x, y, d, i0, i1, dp;

    for(var i = 0, j = 0, l = points.length - 2; i < l; i+=2, j++){
        this._getPointOnSegment(point,subPathIndex,j,pointOnSegment);
        distanceToPoint = pointOnSegment[2];

        if(distanceToPoint <= distanceMin){
            x  = pointOnSegment[0];
            y  = pointOnSegment[1];
            d  = pointOnSegment[2];
            i0 = pointOnSegment[3];
            i1 = pointOnSegment[4];
            dp = pointOnSegment[5];

            distanceMin = distanceToPoint;
        }
    }

    out[0] = x;
    out[1] = y;
    out[2] = d;
    out[3] = i0;
    out[4] = i1;
    out[5] = dp;

    return out;
};

Path2d.prototype._getPointOnPath = function(point,out){
    var subPaths = this._subPaths;
    var subPath;
    var points;

    var distanceToPoint;
    var distanceMin = Number.MAX_VALUE;

    var pointOnSubPath = this._tempSubPathPoint;

    var x, y, d, i0, i1, dp;

    for(var i = 0, l = subPaths.length; i < l; ++i){
        subPath = subPaths[i];
        points  = subPath.points;

        this._getPointOnSubPath(point,i,pointOnSubPath);
        distanceToPoint = pointOnSubPath[2];

        if(distanceToPoint <= distanceMin){
            x  = pointOnSubPath[0];
            y  = pointOnSubPath[1];
            d  = pointOnSubPath[2];
            i0 = pointOnSubPath[3];
            i1 = pointOnSubPath[4];
            dp = pointOnSubPath[5];

            distanceMin = distanceToPoint;
        }
    }

    out[0] = x;
    out[1] = y;
    out[2] = d;
    out[3] = i0;
    out[4] = i1;
    out[5] = dp;

    return out;
};

/*--------------------------------------------------------------------------------------------------------------------*/
// SubPath modifier
/*--------------------------------------------------------------------------------------------------------------------*/

Path2d.prototype.createSubPathAtIndex = function(index){
    if(index > this._subPaths.length - 1){
        throw new Range('Path2d: Sub-path index out of range');
    }
    this._subPath = new SubPath();
    this._subPaths.push(this._subPath);
    this._dirty = true;
};

Path2d.prototype.removeSubPathAtIndex = function(subPathIndex){
    if(this._subPaths[subPathIndex] === undefined){
        throw new RangeError('Path2d: Sub-path index out of range.');
    }
    this._subPaths.splice(subPathIndex,1);
    this._dirty = true;
};

Path2d.prototype.clearSubPath = function(){
    clearSubPath(this._subPath);
    this._dirty = true;
};

Path2d.prototype.clearSubPathAtIndex = function(subPathIndex){
    var subPath = this._subPaths[subPathIndex];
    if(subPath === undefined){
        throw new RangeError('Path2d: Sub-path index out of range.');
    }
    clearSubPath(subPath);
    this._dirty = true;
};

Path2d.prototype.moveToSubPathAtIndex = function(subPathIndex){
    var subPath = this._subPaths[subPathIndex];
    if(subPath === undefined){
        throw new RangeError('Path2d: Sub-path index out of range.');
    }
    this._subPath = subPath;
};

/*--------------------------------------------------------------------------------------------------------------------*/
// Path modifier
/*--------------------------------------------------------------------------------------------------------------------*/

/**
 * Updates all sub-path components. Called internally if the path is dirty on
 * [getTotalLength]{@link Path2d#getTotalLength},
 * [getPointAtLength]{@link Path2d#getPointAtLength},
 * [getTangentAtLength]{@link Path2d#getTangentAtLength},
 * [getNormalAtLength]{@link Path2d#getNormalAtLength},
 * [getSubPathAtLength]{@link Path2d#getSubPathIndexAtLength},
 * [getPathSegAtLength]{@link Path2d#getPathSegIndexAtLength},
 * [getSubPaths]{@link Path2d#getSubPaths}.
 */
Path2d.prototype.update = function(){
    if(!this._dirty){
        return;
    }

    if(this._recordPoints){
        this._update();
        if(this._recordSvgCmd){
            this._pathCmd = '';
            var subPaths = this._subPaths;
            for(var i = 0, l = subPaths.length; i < l; ++i){
                this._pathCmd += subPaths[i].cmd;
            }
        }
    } else {
        this._lengthTotal = 0;
    }

    this._dirty = false;
};

/**
 * Clears all path points.
 */
Path2d.prototype.clear = function(){
    if(this._recordPoints){
        this._subPaths.length = 0;
        this._lengthTotal = 0;
    }

    if(this._recordSvgCmd){
        this._pathCmd = '';
    }

    this._dirty = true;
};

/**
 * Moves the starting point of a new sub-path to the (x, y) coordinates.
 * @param {Number} x - The x axis of the point.
 * @param {Number} y - The y axis of the point.
 */
Path2d.prototype.moveTo = function(x,y){
    if(this._recordPoints){
        if(this._subPath && this._subPath.points.length == 0){
            this._subPath.points.push(x,y);
        } else {
            this._subPath = new SubPath();
            this._subPath.points.push(x,y);
            this._subPaths.push(this._subPath);
        }
        if(this._recordSvgCmd){
            this._subPath.cmd += createSvgPathCmdMoveTo(x,y) + ' ';
        }
        this._subPath._dirty = true;
    } else {
        this._pathCmd += createSvgPathCmdMoveTo(x,y) + ' ';
    }

    this._dirty = true;
};

/**
 * Connects the last point in the sub-path to the x, y coordinates with a straight line.
 * @param {Number} x - The x axis of the coordinate for the end of the line.
 * @param {Number} y - The y axis of the coordinate for the end of the line.
 */
Path2d.prototype.lineTo = function(x,y){
    if(this._recordPoints){
        this._ensureSubPathType(TYPE_CURVE,TYPE_LINE);

        this._subPath.points.push(x,y);
        this._subPath.segmentLengths.push(-1);

        if(this._recordSvgCmd){
            this._subPath.cmd += createSvgPathCmdLineTo(x,y) + ' ';
        }

        this._subPath._dirty = true;
    } else {
        this._pathCmd += createSvgPathCmdLineTo(x,y) + ' ';
    }

    this._dirty = true;
};

/**
 *
 * @param points
 */
Path2d.prototype.linesTo = function(points){
    var isFlat  = points[0].length === undefined;
    if(this._recordPoints){
        this._ensureSubPathType(TYPE_CURVE,TYPE_LINE);

        var subPath = this._subPath;
        var points_ = subPath.points;
        var pointsLength = points.length;
        var offset = points_.length;

        if(!isFlat){
            points_.length += pointsLength;
            for(var i = 0, j = offset; i < pointsLength; ++i, ++j){
                subPath[offset + j] = points[i];
            }
        } else {
            points_.length += pointsLength * 2;
            for(var i = 0, j = offset, point; i < pointsLength; ++i, j+=2){
                point = points[i];
                subPath[offset + j    ] = point[0];
                subPath[offset + j + 1] = point[1];
            }
        }

        if(this._recordSvgCmd){
            if(isFlat){
                for(var i = 0; i < pointsLength; i+=2){
                    this._subPath.cmd += createSvgPathCmdLineTo(points[i],points[i+1]) + ' ';
                }
            } else {
                for(var i = 0; i < pointsLength; ++i){
                    this._subPath.cmd += createSvgPathCmdLineTo(points[i][0],points[i][1]) + ' ';
                }
            }
        }
    } else {

    }

    this._dirty = subPath._dirty = true;
};

/**
 * Adds a quadratic Bézier curve to the path. It requires two points. The first point is a control point and the second
 * one is the end point. The starting point is the last point in the current path, which can be changed using moveTo()
 * before creating the quadratic Bézier curve.
 * @param {Number} cpx - The x axis of the coordinate for the control point.
 * @param {Number} cpy - The y axis of the coordinate for the control point.
 * @param {Number} x - The x axis of the coordinate for the end point.
 * @param {Number} y - The y axis of the coordinate for the end point.
 * @param {Boolean} [numCurvePoints]
 */
Path2d.prototype.quadraticCurveTo = function(cpx,cpy,x,y,numCurvePoints){
    if(this._recordPoints){
        numCurvePoints = numCurvePoints == undefined ? this._numCurvePointsQuadratic : Math.max(numCurvePoints);

        this._ensureSubPathType(TYPE_LINE,TYPE_CURVE);

        var subPath    = this._subPath;
        var points     = subPath.points;

        var pointsLen0       = points.length;
        var numCurvePoints_1 = numCurvePoints - 1;

        var sx = points[pointsLen0 - 2];
        var sy = points[pointsLen0 - 1];

        var pointsLen1 = points.length = pointsLen0 + numCurvePoints * 2;

        var n,_n;
        var b1,b2,b3;

        for(var i = pointsLen0, j = 0; i < pointsLen1; i+=2, j++){
            n  = j / numCurvePoints_1;
            _n = 1.0 - n;
            b1 = _n * _n;
            b2 = 2 * _n * n;
            b3 = n * n;

            points[i  ] = sx * b1 + cpx * b2 + x * b3;
            points[i+1] = sy * b1 + cpy * b2 + y * b3;
        }
        if(this._recordSvgCmd){
            this._subPath.cmd += createSvgPathCmdQuadraticCurveTo(
                cpx, cpy,
                x, y
            ) + ' ';
        }
    } else {
        this._pathCmd += createSvgPathCmdQuadraticCurveTo(
            cpx, cpy,
            x, y
        ) + ' ';
    }

    this._dirty = true;
};

/**
 * Adds a cubic Bézier curve to the path. It requires three points. The first two points are control points and the
 * third one is the end point. The starting point is the last point in the current path, which can be changed using
 * moveTo() before creating the Bézier curve.
 * @param {Number} cp1x - The x axis of the coordinate for the first control point.
 * @param {Number} cp1y - The y axis of the coordinate for first control point.
 * @param {Number} cp2x - The x axis of the coordinate for the second control point.
 * @param {Number} cp2y - The y axis of the coordinate for the second control point.
 * @param {Number} x - The x axis of the coordinate for the end point.
 * @param {Number} y - The y axis of the coordinate for the end point.
 * @param {Boolean} [numCurvePoints] - Number of curve points.
 */
Path2d.prototype.cubicCurveTo = function(cp1x,cp1y,cp2x,cp2y,x,y,numCurvePoints){
    if(this._recordPoints){
        numCurvePoints = numCurvePoints == undefined ? this._numCurvePointsCubic : Math.max(2,numCurvePoints);

        this._ensureSubPathType(TYPE_LINE,TYPE_CURVE);

        var subPath    = this._subPath;
        var points     = subPath.points;
        var pointsLen0 = points.length;

        var numCurvePoints_1 = numCurvePoints - 1;

        var sx = points[pointsLen0 - 2];
        var sy = points[pointsLen0 - 1];

        var pointsLen1 = points.length = pointsLen0 + numCurvePoints * 2;

        var n, n2, _n, _n2;
        var b1, b2, b3, b4;

        for(var i = pointsLen0, j = 0; i < pointsLen1; i+=2, j++){
            n   = 1.0 - j / numCurvePoints_1;
            n2  = n * n;
            _n  = 1 - n;
            _n2 = _n * _n;

            b1 = n2 * n;
            b2 = 3 * n2 * _n;
            b3 = 3 * n * _n2;
            b4 = _n2 * _n;

            points[i  ] = sx * b1 + cp1x * b2 + cp2x * b3 + x * b4;
            points[i+1] = sy * b1 + cp1y * b2 + cp2y * b3 + y * b4;
        }
        if(this._recordSvgCmd){
            this._subPath.cmd += createSvgPathCmdCubicCurveTo(
                cp1x,cp1y,
                cp2x,cp2y,
                x,y
            ) + ' ';
        }
    } else {
        this._pathCmd += createSvgPathCmdCubicCurveTo(
            cp1x,cp1y,
            cp2x,cp2y,
            x,y
        ) + ' ';
    }

    this._dirty = true;
};

/**
 * Adds an arc to the path which is centered at (x, y) position with radius r starting at startAngle and ending at
 * endAngle going in the given direction by anticlockwise (defaulting to clockwise).
 * @param {Number} cx - The x coordinate of the arc's center.
 * @param {Number} cy - The y coordinate of the arc's center.
 * @param {Number} r - The arc's radius.
 * @param {Number} sAngle - The angle at which the arc starts, measured clockwise from the positive x axis and
 * expressed in radians.
 * @param {Number} eAngle - The angle at which the arc ends, measured clockwise from the positive x axis and
 * expressed in radians.
 * @param {Boolean} [counterclockwise] - An optional Boolean which, if true, causes the arc to be drawn
 * counter-clockwise between the two angles. By default it is drawn clockwise.
 * @param {Number} [numArcPoints] - Number of arc points.
 */
Path2d.prototype.arc = function(cx,cy,r,sAngle,eAngle,counterclockwise,numArcPoints){
    if(this._recordPoints){

        if(sAngle === eAngle){
            this.lineTo(cx + Math.cos(sAngle) * r,cy + Math.sin(sAngle) * r);
            return;
        }

        numArcPoints     = numArcPoints == undefined ? this._numArcPoints : Math.max(2,numArcPoints);
        counterclockwise = counterclockwise === undefined ? false : counterclockwise;

        this._ensureSubPathType(TYPE_LINE,TYPE_CURVE);

        var subPath    = this._subPath;
        var points     = subPath.points;
        var pointsLen0 = points.length;
        var pointsLen1 = points.length = pointsLen0 + numArcPoints * 2;

        var numArcPoints_1 = numArcPoints - 1;

        sAngle = fmod(sAngle,PI2);
        eAngle = fmod(eAngle,PI2);

        if( counterclockwise && sAngle <= eAngle ) {
            sAngle += PI2;
        } else if( !counterclockwise && eAngle <= sAngle ) {
            eAngle += PI2;
        }

        var sweep     = counterclockwise ? -(sAngle - eAngle) : (eAngle - sAngle);
        var angleStep = sweep / numArcPoints_1;

        for(var i = pointsLen0, j = 0, angle; i < pointsLen1; i+=2, j++){
            angle = sAngle + angleStep * j;
            points[i  ] = cx + r * Math.cos(angle);
            points[i+1] = cy + r * Math.sin(angle);
        }

        if(this._recordSvgCmd){
            this._subPath.cmd += createSvgPathCmdLineTo(
                            points[pointsLen0],points[pointsLen0+1]
                         ) + ' ' +
                         createSvgPathCmdArc(
                            r,r,
                            0,
                            0,0,
                            points[pointsLen1-2],points[pointsLen1-1]
                         ) + ' ';
        }
    } else {

    }

    this._dirty = true;
};

/**
 * Adds an arc to the path with the given control points and radius, connected to the previous point by a straight line.
 * @param {Number} x1 - The x axis of the coordinate for the first control point.
 * @param {Number} y1 - The y axis of the coordinate for the first control point.
 * @param {Number} x2 - The x axis of the coordinate for the second control point.
 * @param {Number} y2 - The y axis of the coordinate for the second control point.
 * @param {Number} radius - The arc's radius.
 * @param {Number} [numArcPoints] - Number of arc points.
 */
//http://d.hatena.ne.jp/mindcat/20100131/1264958828
Path2d.prototype.arcTo = function(x1,y1,x2,y2,rad,numArcPoints){
    if(this._recordPoints){
        numArcPoints = numArcPoints === undefined ? this._numArcPoints : Math.max(2,numArcPoints);

        var x0 = this._subPath.points[this._subPath.points.length-2];
        var y0 = this._subPath.points[this._subPath.points.length-1];
        var a1 = y0 - y1;
        var b1 = x0 - x1;
        var a2 = y2 - y1;
        var b2 = x2 - x1;
        var mm = Math.abs(a1*b2 - b1*a2);

        if (mm === 0 || rad === 0) {
            this.lineTo(x1, y1)
        } else {
            var dd = a1 * a1 + b1 * b1;
            var cc = a2 * a2 + b2 * b2;
            var tt = a1 * a2 + b1 * b2;
            var k1 = rad * Math.sqrt(dd) / mm;
            var k2 = rad * Math.sqrt(cc) / mm;
            var j1 = k1 * tt / dd;
            var j2 = k2 * tt / cc;
            var cx = k1 * b2 + k2 * b1;
            var cy = k1 * a2 + k2 * a1;
            var px = b1 * (k2 + j1);
            var py = a1 * (k2 + j1);
            var qx = b2 * (k1 + j2);
            var qy = a2 * (k1 + j2);
            var ang1 = Math.atan2(py - cy, px - cx);
            var ang2 = Math.atan2(qy - cy, qx - cx);

            var ang3 = Math.abs(ang2-ang1);


            this.arc(300,300,rad,ang1,ang1 + Math.PI,false);
            //this.lineTo(px + x1, py + y1);
            //this.arc(cx + x1, cy + y1, rad, ang1, ang2, b1 * a2 > b2 * a1, numArcPoints);
            //this.arc(cx + x1, cy + y1, rad, ang2, ang2 + ang3, b1 * a2 > b2 * a1, numArcPoints);
        }


        if(this._recordSvgCmd){

        }
    } else {

    }

    this._dirty = true;
};

/**
 * Adds an ellipse to the path which is centered at (x, y) position with the radii radiusX and radiusY starting at
 * startAngle and ending at endAngle going in the given direction by anticlockwise (defaulting to clockwise).
 * @param {Number} x - The x axis of the coordinate for the ellipse's center.
 * @param {Number} y - The y axis of the coordinate for the ellipse's center.
 * @param {Number} radiusX - The ellipse's major-axis radius.
 * @param {Number} radiusY - The ellipse's minor-axis radius.
 * @param {Number} rotation - The rotation for this ellipse, expressed in degrees.
 * @param {Number} sAngle - The starting point, measured from the x axis, from which it will be drawn, expressed in
 * radians.
 * @param {Number} eAngle - The end ellipse's angle to which it will be drawn, expressed in radians.
 * @param {Boolean} [counterclockwise] - An optional Boolean which, if true, draws the ellipse anticlockwise
 * (counter-clockwise), otherwise in a clockwise direction.
 * @param [numEllipsePoints] - Number of ellipse points.
 */
Path2d.prototype.ellipse = function(x,y,radiusX,radiusY,rotation,sAngle,eAngle,counterclockwise,numEllipsePoints){


    counterclockwise = counterclockwise === undefined ? false : counterclockwise;

    var cosrot = Math.cos(rotation);
    var sinrot = Math.sin(rotation);

    var direction = counterclockwise ? -1 : 1;
    var angle;

    var sx, sy;
    var px, py;
    var exr, eyr;
    var ex, ey;

    if(this._recordPoints){
        numEllipsePoints = numEllipsePoints == undefined ? this._numEllipsePoints : Math.max(2,numEllipsePoints);

        var subPathInitial = false;
        if(this._subPath === null){
            var srx = Math.cos(sAngle) * radiusX * direction;
            var sry = Math.sin(sAngle) * radiusY * direction;
            sx = srx * cosrot - sry * sinrot + x;
            sy = srx * sinrot + sry * cosrot + y;

            this.moveTo(sx,sy);
            this._subPath.type = TYPE_CURVE;
            subPathInitial = true;
        }


        this._ensureSubPathType(TYPE_LINE,TYPE_CURVE);

        var subPath    = this._subPath;
        var points     = subPath.points;
        var pointsLen0 = points.length;
        var pointsLen1 = points.length = pointsLen0 + numEllipsePoints * 2;

        var numEllipsePoints_1 = numEllipsePoints - 1;

        //eAngle == 0
        if(counterclockwise && (sAngle <= eAngle)){
            sAngle += PI2;
        } else if(!counterclockwise && eAngle <= sAngle){
            eAngle += PI2;
        }

        var sweep     = counterclockwise ? -(sAngle - eAngle) : (eAngle - sAngle);
        var angleStep = sweep / numEllipsePoints_1;

        for(var i = pointsLen0, j = 0; i < pointsLen1; i+=2, j++){
            angle = sAngle + angleStep * j;

            px = radiusX * Math.cos(angle);
            py = radiusY * Math.sin(angle);

            points[i  ] = px * cosrot - py * sinrot + x;
            points[i+1] = px * sinrot + py * cosrot + y;
        }

        if(this._recordSvgCmd){
            //mimics canvas
            rotation = rotation * 180 / Math.PI;
            angle    = eAngle - sAngle;

            if(Math.abs(angle) == PI2){
                if(!subPathInitial) {
                    sx = points[pointsLen0  ];
                    sy = points[pointsLen0+1];
                }

                exr = radiusX * Math.cos(Math.PI);
                eyr = radiusY * Math.sin(Math.PI);
                ex  = exr * cosrot - eyr * sinrot + x;
                ey  = exr * sinrot + eyr * cosrot + y;

                this._subPath.cmd += createSvgPathCmdLineTo(
                                sx,sy
                             ) + ' ' +
                             createSvgPathCmdArc(
                                 radiusX,radiusY,
                                 rotation,
                                 0,1,
                                 ex,ey
                             ) + ' ' +
                             createSvgPathCmdLineTo(
                                ex,ey
                             ) + ' ' +
                             createSvgPathCmdArc(
                                 radiusX,radiusY,
                                 rotation,0,1,
                                 radiusX * cosrot + x,radiusX * sinrot + y
                             ) + ' ';

            } else {
                this._subPath.cmd += createSvgPathCmdLineTo(
                                 points[pointsLen0],points[pointsLen0+1]
                             ) + ' ' +
                             createSvgPathCmdArc(
                                 radiusX,radiusY,
                                 rotation,
                                 1,1,
                                 points[pointsLen1-2],points[pointsLen1-1]
                             ) + ' ';

            }
        }
    } else {
        //mimics canvas
        rotation = rotation * 180 / Math.PI;
        angle    = eAngle - sAngle;

        if(Math.abs(angle) == PI2){
            sx = radiusX;
            sy = 0;
            exr = radiusX * Math.cos(Math.PI);
            eyr = radiusY * Math.sin(Math.PI);
            ex  = exr * cosrot - eyr * sinrot + x;
            ey  = exr * sinrot + eyr * cosrot + y;

            this._pathCmd += createSvgPathCmdLineTo(
                            sx,sy
                         ) + ' ' +
                         createSvgPathCmdArc(
                             radiusX,radiusY,
                             rotation,
                             0,1,
                             ex,ey
                         ) + ' ';

            this._pathCmd += createSvgPathCmdLineTo(
                            ex,ey
                         ) + ' ' +
                         createSvgPathCmdArc(
                             radiusX,radiusY,
                             rotation,
                             0,1,
                             radiusX * cosrot + x,radiusX * sinrot + y
                         ) + ' ';

        } else {

            px = radiusX * Math.cos(sAngle) * direction;
            py = radiusY * Math.sin(sAngle) * direction;

            this._pathCmd += createSvgPathCmdLineTo(
                px * cosrot - py * sinrot + x,px * sinrot + py * cosrot + y
            ) + ' ';

            px = radiusX * Math.cos(eAngle) * direction;
            py = radiusY * Math.sin(eAngle) * direction;

            this._pathCmd += createSvgPathCmdArc(
                radiusX,radiusY,
                rotation,
                1,1,
                px * cosrot - py * sinrot + x,px * sinrot + py * cosrot + y
            ) + ' ';
        }
    }

    this._dirty = true;
};

/**
 * Creates a new sub path ellipse which is centered at (x, y) position with the radii radiusX and radiusY starting at
 * startAngle and ending at endAngle going in the given direction by anticlockwise (defaulting to clockwise).
 * @param {Number} x - The x axis of the coordinate for the ellipse's center.
 * @param {Number} y - The y axis of the coordinate for the ellipse's center.
 * @param {Number} radiusX - The ellipse's major-axis radius.
 * @param {Number} radiusY - The ellipse's minor-axis radius.
 * @param {Number} rotation - The rotation for this ellipse, expressed in degrees.
 * @param {Number} startAngle - The starting point, measured from the x axis, from which it will be drawn, expressed in
 * radians.
 * @param {Number} endAngle - The end ellipse's angle to which it will be drawn, expressed in radians.
 * @param {Boolean} [counterclockwise] - An optional Boolean which, if true, draws the ellipse anticlockwise
 * (counter-clockwise), otherwise in a clockwise direction.
 * @param [numEllipsePoints] - Number of ellipse points.
 */
Path2d.prototype.ellipseAt = function(x,y,radiusX,radiusY,rotation,startAngle,endAngle,counterclockwise,numEllipsePoints){
    this._subPath = null;
    this.ellipse(
        x,y,
        radiusX,radiusY,
        rotation,
        startAngle,endAngle,
        counterclockwise,
        numEllipsePoints
    );
};

/**
 * Creates a path for a rectangle at position (x, y) with a size that is determined by width and height. Those four
 * points are connected by straight lines and the sub-path is marked as closed.
 * @param x
 * @param y
 * @param width
 * @param height
 */
Path2d.prototype.rect = function(x,y,width,height){
    var xw = x + width;
    var yh = y + height;

    if(this._recordPoints){
        this.moveTo(x,y);
        this._subPath.points.push(xw,y, xw,yh, x,yh, x,y);

        if(this._recordSvgCmd){
            this._subPath.cmd += createSvgPathCmdLineTo(xw,y) + ' ' +
                                 createSvgPathCmdLineTo(xw,yh) + ' ' +
                                 createSvgPathCmdLineTo(x,yh) + ' ' +
                                 createSvgPathCmdClose() + ' ';
        }
    } else {
        this._pathCmd += createSvgPathCmdLineTo(xw,y) + ' ' +
                         createSvgPathCmdLineTo(xw,yh) + ' ' +
                         createSvgPathCmdLineTo(x,yh) + ' ' +
                         createSvgPathCmdClose() + ' ';
    }

    this._dirty = true;
};

/**
 * Closes the current sub path.
 */
Path2d.prototype.close = function(){
    var subPath = this._subPath;
    subPath.closed = true;
    if(this._recordPoints){
        var points       = subPath.points;
        var pointsLength = points.length;

        if(points[0] == points[pointsLength-2] &&
           points[1] == points[pointsLength-1]){
            return;
        }

        points.push(points[0],points[1]);

        if(this._recordSvgCmd){
            this._subPath.cmd += createSvgPathCmdClose() + ' ';
        }
    } else {
        this._pathCmd += createSvgPathCmdClose() + ' ';
    }

    this._dirty = true;
};

/*--------------------------------------------------------------------------------------------------------------------*/
// Properties
/*--------------------------------------------------------------------------------------------------------------------*/

/**
 * Returns the value for the total length of the path.
 * Returns -1 if points recording is deactivated.
 * @returns {Number}
 */
Path2d.prototype.getTotalLength = function(){
    this.update();
    return this._lengthTotal;
};

/**
 * Returns the coordinate which is distance units along the path.
 * Returns [-1,-1] if points recording is deactivated.
 * @param {Number} length - The distance along the path. (Positive Number)
 * @param {Number[]} [out] - Optional out [x,y]
 * @returns {Number[]}
 */
Path2d.prototype.getPointAtLength = function(length,out){
    if(!this._recordPoints){
        return [-1,-1];
    }

    out = out || [0,0];

    var indicesRatio;

    if(!this._dirty && length == this._lengthIndexRatioPassedPrev){
        indicesRatio = this._tempSegIndicesRatio;
    } else {
        this.update();
        indicesRatio = this._getIndicesAndRatioAtLength(length);
    }

    var subPath = this._subPaths[indicesRatio[0]];
    var indexA  = indicesRatio[1] * 2;
    var indexB  = indicesRatio[2] * 2;
    var ratio   = indicesRatio[3];

    var points  = subPath.points;

    var x0 = points[indexA  ];
    var y0 = points[indexA+1];

    out[0] = x0 + (points[indexB  ] - x0) * ratio;
    out[1] = y0 + (points[indexB+1] - y0) * ratio;

    this._lengthIndexRatioPassedPrev = length;
    return out;
};

/**
 * Returns the tangent which is distance units along the path.
 * Returns [-1,-1] if tangent and normal calculation is deactivated.
 * @param {Number} length - The distance along the path. (Positive Number)
 * @param {Number[]} [out] - Optional out [x,y]
 * @returns {Number[]}
 */
Path2d.prototype.getTangentAtLength = function(length,out){
    if(!this._calcTangentsAndNormals){
        return [-1,-1];
    }

    out = out || [0,0];

    var indices;

    if(!this._dirty && length == this._lengthIndexPassedPrev){
        indices = this._tempSegIndices;
    } else {
        this.update();
        indices = this._getSegIndexAtLength(length);
    }

    var subPath = this._subPaths[indices[0]];
    var index   = indices[1] * 2;

    var tangents = subPath.tangents;

    out[0] = tangents[index  ];
    out[1] = tangents[index+1];

    this._lengthIndexPassedPrev = length;
    return out;
};

/**
 * Returns the normal which is distance units along the path.
 * Returns [-1,-1] if tangent and normal calculation is deactivated.
 * @param {Number} length - The distance along the path. (Positive Number)
 * @param {Number[]} [out] - Optional out. [x,y]
 * @returns {Number[]}
 */
Path2d.prototype.getNormalAtLength = function(length,out){
    if(!this._calcTangentsAndNormals){
        return [-1,-1];
    }

    out = out || [0,0];

    var indices;

    if(!this._dirty && length == this._lengthIndexPassedPrev){
        indices = this._tempSegIndices;
    } else {
        this.update();
        indices = this._getSegIndexAtLength(length);
    }

    var subPath = this._subPaths[indices[0]];
    var index   = indices[1] * 2;

    var normals = subPath.normals;

    out[0] = normals[index  ];
    out[1] = normals[index+1];

    this._lengthIndexPassedPrev = length;
    return out;
};

/**
 * Returns the point, tangent and normal which are distance units along the path.
 * Returns [-1,-1,-1,-1,-1,-1] if tangent and normal calculation is deactivated.
 * @param {Number} length - The distance along the path. (Positive Number)
 * @param {Number[]} [out] - Optional out. [px,py,tx,ty,nx,ny]
 * @returns {Number[]}
 */
Path2d.prototype.getPointAndTangentAndNormalAtLength = function(length,out){
    if(!this._calcTangentsAndNormals){
        return [-1,-1,-1,-1,-1,-1];
    }

    out = out || [0,0,0,0,0,0];

    var indicesRatio;

    if(!this._dirty && length == this._lengthIndexRatioPassedPrev){
        indicesRatio = this._tempSegIndicesRatio;
    } else {
        this.update();
        indicesRatio = this._getIndicesAndRatioAtLength(length);
    }

    var subPath = this._subPaths[indicesRatio[0]];
    var indexA  = indicesRatio[1] * 2;
    var indexB  = indicesRatio[2] * 2;
    var ratio   = indicesRatio[3];

    var points   = subPath.points;
    var tangents = subPath.tangents;
    var normals  = subPath.normals;

    var x0 = points[indexA  ];
    var y0 = points[indexA+1];

    out[0] = x0 + (points[indexB  ] - x0) * ratio;
    out[1] = y0 + (points[indexB+1] - y0) * ratio;
    out[2] = tangents[indexA  ];
    out[3] = tangents[indexA+1];
    out[4] = normals[indexA  ];
    out[5] = normals[indexA+1];

    this._lengthIndexRatioPassedPrev = length;
    return out;
};

/**
 * Returns the tangent and normal which are distance units along the path.
 * Returns [-1,-1,-1,-1] if tangent and normal calculation is deactivated.
 * @param {Number} length - The distance along the path. (Positive Number)
 * @param {Number[]} [out] - Optional out. [tx,ty,nx,ny]
 * @returns {Number[]}
 */
Path2d.prototype.getTangentAndNormalAtLength = function(length,out){
    if(!this._calcTangentsAndNormals){
        return [-1,-1,-1,-1];
    }

    out = out || [0,0,0,0];

    var indices;

    if(!this._dirty && length == this._lengthIndexPassedPrev){
        indices = this._tempSegIndices;
    } else {
        this.update();
        indices = this._getSegIndexAtLength(length);
    }

    var subPath = this._subPaths[indices[0]];
    var index   = indices[1] * 2;

    var tangents = subPath.tangents;
    var normals  = subPath.normals;

    out[0] = tangents[index  ];
    out[1] = tangents[index+1];
    out[2] = normals[index  ];
    out[3] = normals[index+1];

    this._lengthIndexPassedPrev = length;
    return out;
};

/**
 * Returns the nearest point on the segment to the point given.
 * @param {Number[]} point - The point. [x,y]
 * @param {Number}  subPathIndex - The sub-path index.
 * @param {Number}  segIndex - The segment index.
 * @param {Number[]} out - Optional out. [segPx,segPy,distSegPToP]
 * @returns {Number[]}
 */
Path2d.prototype.getPointOnSegment = function(point,subPathIndex,segIndex,out){
    if(!this._recordPoints){
        return [-1,-1,-1];
    }
    out = out || [0,0];
    this.update();

    var data = this._getPointOnSegment(point,subPathIndex,segIndex,this._tempPointProjected);

    out[0] = data[0];
    out[1] = data[1];
    return out;
};


/**
 * Returns the nearest point on the sub-path to the point given.
 * @param {Number[]} point - The point. [x,y]
 * @param {Number}  subPathIndex - The sub-path index.
 * @param {Number[]} out - Optional out. [x,y]
 * @returns {Number[]}
 */
Path2d.prototype.getPointOnSubPath = function(point,subPathIndex,out){
    if(!this._recordPoints){
        return [-1,-1];
    }
    out = out || [0,0];
    this.update();

    var data = this._getPointOnSubPath(point,subPathIndex,this._tempPointOut);

    out[0] = data[0];
    out[1] = data[1];
    return out;
};

/**
 * Returns the nearest point on the path to the point given.
 * @param {Number[]} point - The point. [x,y]
 * @param {Number[]} [out] - Optional out. [x,y]
 * @returns {Number[]}
 */
Path2d.prototype.getPointOnPath = function(point,out){
    if(!this._recordPoints){
        return [-1,-1];
    }
    out = out ||  [0,0];
    this.update();

    var data = this._getPointOnPath(point,this._tempPointOut);

    out[0] = data[0];
    out[1] = data[1];
    return out;
};

/**
 * Returns the index of the nearest segment relative to the point given.
 * @param {Number[]} point - The point. [x,y]
 * @param {Number[]} [out] - Optional out. [sup-path index, seg index]
 * @returns {Number[]}
 */
Path2d.prototype.getSegmentIndexNearestToPoint = function(point,out){
    if(!this._recordPoints){
        return [-1,-1]
    }
    out = out || [0,0];
    this.update();

    var data = this.getPointOnPath(point,this._tempPointOut);

    out[0] = data[3];
    out[1] = data[4];
    return out;
};

/**
 * Returns the index of the nearest sub-path relative to the point given.
 * @param {Number[]} point - The point. [x,y]
 * @returns {Number}
 */
Path2d.prototype.getSubPathIndexNearestToPoint = function(point){
    if(!this._recordPoints){
        return -1;
    }
    this.update();
    return this._getPointOnPath(point)[3];
};

/**
 * Returns a copy of the nearest sub-path segment relative to the point given.
 * @param {Number[]} point - The point. [x,y]
 * @param {Number[]} [out] - Optional out. [start x, start y, end x, end y]
 * @returns {Number[]}
 */
Path2d.prototype.getSegmentCopyNearestToPoint = function(point,out){
    if(!this._recordPoints){
        return [-1,-1,-1,-1];
    }

    out = out || [0,0,0,0];
    this.update();

    var data    = this._getPointOnPath(point,this._tempPointOut);
    var subPath = this._subPaths[data[3]];
    var points  = subPath.points;
    var index   = data[4] * 2;

    out[0] = points[index  ];
    out[1] = points[index+1];
    out[2] = points[index+2];
    out[3] = points[index+3];

    return out;
};

/**
 * Returns the nearest sub-path relative to the point given.
 * @param {Number[]} point - The point. [x,y]
 * @returns {SubPath}
 */
Path2d.prototype.getSubPathNearestToPoint = function(point){
    if(!this._recordPoints){
        return null;
    }

    return this._subPaths[this._getPointOnPath(point,this._tempPointOut)[3]];
};

/**
 * Returns the distance of a point on or off the path to the point project on the segment specified.
 * @param {Number[]} point - The point. [x,y]
 * @param {Number} subPathIndex - The index of the sub path.
 * @param {Number} segIndex - The index of segment.
 * @returns {Number}
 */
Path2d.prototype.getDistanceToSegment = function(point,subPathIndex,segIndex){
    if(!this._recordPoints){
        return -1;
    }

    this.update();

    return this._getPointOnSegment(point,subPathIndex,segIndex,this._tempPointOut)[2];
};

/**
 * Returns the distance of a point on or off the path to the point project on the sub-path specified.
 * @param {Number[]} point - The point. [x,y]
 * @param {Number} subPathIndex - The index of the sub path.
 * @returns {Number}
 */
Path2d.prototype.getDistanceToSubPath = function(point,subPathIndex){
    if(!this._recordPoints){
        return -1;
    }

    this.update();

    return this._getPointOnSubPath(point,subPathIndex,this._tempPointOut)[2];
};

/**
 * Returns the distance of a point on or off the path to the point project on the path.
 * @param {Number[]} point - The point. [x,y]
 * @returns {Number}
 */
Path2d.prototype.getDistanceToPath = function(point){
    if(!this._recordPoints){
        return -1;
    }

    this.update();

    return this._getPointOnPath(point,this._tempPointOut)[2];
};

/**
 * Returns the distance to a point on or off the path to the point project on the segment specified.
 * @param {Number[]} point - The point. [x,y]
 * @param {Number} subPathIndex - The index of the sub path.
 * @param {Number} segIndex - The index of segment.
 * @returns {Number}
 */
Path2d.prototype.getLengthOnSegment = function(point,subPathIndex,segIndex){
    return this.getPointOnSegment(point,subPathIndex,segIndex,this._tempPointOut)[5];
};

/**
 * Returns the distance to a point on or off the path to the point project on the sub-path specified.
 * @param {Number[]} point - The point. [x,y]
 * @param {Number} subPathIndex - The index of the sub path.
 * @returns {Number}
 */
Path2d.prototype.getLengthOnSubPath = function(point,subPathIndex){
    return this.getPointOnSubPath(point,subPathIndex,this._tempPointOut)[5];
};

/**
 * Returns the distance to a point on or off the path to the point project on the path.
 * @param {Number[]} point - The point. [x,y]
 * @returns {Number}
 */
Path2d.prototype.getLengthOnPath = function(point){
    if(!this._recordPoints){
        return -1;
    }
    this.update();
    return this._getPointOnPath(point,this._tempPointOut)[5];
};

/**
 * Returns the sub path index which is distance units along the path.
 * @param {Number} length - The distance along the path.
 * @returns {Number}
 */
Path2d.prototype.getSubPathIndexAtLength = function(length){
    if(!this._recordPoints){
        return -1;
    }
    var indices;

    if(!this._dirty && length == this._lengthIndexPassedPrev){
        indices = this._tempSegIndices;
    } else {
        this.update();
        indices = this._getSegIndexAtLength(length);
    }

    this._lengthIndexPassedPrev = length;
    return indices[0];
};

/**
 * Returns ths sub path segment index which is distance units along the path.
 * Returns [-1,-1] if points recording is deactivated.
 * @param {Number} length - The distance along the path.
 * @param {Number[]} [out] - Optional out. [index sub-path, index segment]
 * @returns {Number[]}
 */
Path2d.prototype.getPathSegIndexAtLength = function(length,out){
    if(!this._recordPoints){
        return [-1,-1];
    }
    var indices;

    if(!this._dirty && length == this._lengthIndexPassedPrev){
        indices = this._tempSegIndices;
    } else {
        this.update();
        indices = this._getSegIndexAtLength(length);
    }

    out[0] = indices[0];
    out[1] = indices[1];

    this._lengthIndexPassedPrev = length;
    return out;
};

/**
 * Returns the sub path which is distance units along the path.
 * @param {Number} length - The distance along the path.
 * @returns {SubPath||null}
 */
Path2d.prototype.getSubPathAtLength = function(length){
    if(!this._recordPoints){
        return null;
    }
    return this._subPaths[this.getSubPathIndexAtLength(length)];
};

/**
 * Returns a copy of the sub path segment which is distance units along the path.
 * Returns [-1,-1,-1,-1] if points recording is deactivated.
 * @param length
 * @param out
 * @returns {*}
 */
Path2d.prototype.getSegmentCopyAtLength = function(length,out){
    if(!this._recordPoints){
        return [-1,-1,-1,-1];
    }
    out = out || [0,0,0,0];

    var data   = this.getPathSegIndexAtLength(length,this._tempSegIndicesOut);
    var index  = data[1] * 2;
    var points = this._subPaths[data[0]].points;

    out[0] = points[index  ];
    out[1] = points[index+1];
    out[2] = points[index+2];
    out[3] = points[index+3];

    return out;
};

/**
 * Returns the paths sub paths.
 * @returns {Array}
 */
Path2d.prototype.getSubPaths = function(){
    if(!this._recordPoints){
        throw new Error('Recording of points deactivated.');
    }
    this.update();
    return this._subPaths;
};

/**
 * Returns a copy of the path.
 * @returns {Path2d}
 */
Path2d.prototype.copy = function(){
    var out = new Path2d();
    out._numCurvePointsCubic     = this._numCurvePointsCubic;
    out._numCurvePointsQuadratic = this._numCurvePointsQuadratic;
    out._numArcPoints            = this._numArcPoints;
    out._numEllipsePoints        = this._numEllipsePoints;

    out._recordPoints = this._recordPoints;
    out._recordSvgCmd = this._recordSvgCmd;

    out._calcTangentsAndNormals = this._calcTangentsAndNormals;

    out._subPaths.length = this._subPaths.length;
    for(var i = 0, l = out._subPaths.length; i < l; ++i){
        out._subPaths[i] = copySubPath(this._subPaths[i]);
    }

    out._subPath = this._subPath;
    out._pathCmd = this._pathCmd;
    out._dirty = this._dirty;
    out._lengthTotal = this._lengthTotal;
    out._tempSegIndicesRatio = this._tempSegIndicesRatio.slice(0);
    out._tempSegIndices = this._tempSegIndices.slice(0);
    out._tempSegPoint = this._tempSegPoint.slice(0);
    out._tempPointProjected = this._tempPointProjected.slice(0);
    out._lengthIndexRatioPassedPrev = this._lengthIndexRatioPassedPrev;
    out._lengthIndexPassedPrev = this._lengthIndexPassedPrev;

    if(out._calcTangentsAndNormals){
        out._update = out._updateB;
    } else {
        out._update = out._updateA;
    }

    return out;
};

/*--------------------------------------------------------------------------------------------------------------------*/
// Svg path cmd
/*--------------------------------------------------------------------------------------------------------------------*/

//function parseSvgCmd(cmd){
//    var partials = cmd.split();
//}

//TODO: Add non Path2d generated svg cmds
/**
 * Creates points from svg path command.
 * @param cmd
 */
Path2d.prototype.setSvgPathCmd = function(cmd){
    this.clear();
    this.update();
};

/**
 * Returns the svg path command.
 * @returns {String}
 */
Path2d.prototype.getSvgPathCmd = function(){
    this.update();
    return this._pathCmd;
};

/*--------------------------------------------------------------------------------------------------------------------*/
// Resolution Setter & Getter
/*--------------------------------------------------------------------------------------------------------------------*/

/**
 * Sets the number of points to create path segments for [cubicCurveTo]{@link Path2d#cubicCurveTo}.
 * @param {Number} num
 */
Path2d.prototype.setNumCurvePointsCubic = function(num){
    this._numCurvePointsCubic = Math.max(2,num);
};

/**
 * Returns the number of points to create path segments for [cubicCurveTo]{@link Path2d#cubicCurveTo}.
 * @returns {Number}
 */
Path2d.prototype.getNumCurvePointsCubic = function(){
    return this._numCurvePointsCubic;
};

/**
 * Sets the number of points to create path segments for [quadraticCurveTo]{@link Path2d#quadraticCurveTo}.
 * @param {Number} num
 */
Path2d.prototype.setNumCurvePointsQuadratic = function(num){
    this._numCurvePointsQuadratic = Math.max(2,num);
};

/**
 * Returns the number of points to create path segments for [quadraticCurveTo]{@link Path2d#quadraticCurveTo}.
 * @returns {Number}
 */
Path2d.prototype.getNumCurvePointsQuadratic = function(){
    return this._numCurvePointsQuadratic;
};

/**
 * Sets the number of points to create path segments for [arc]{@link Path2d#arc} and [arcTo]{@link Path2d#arcTo}.
 * @param {Number} num
 */
Path2d.prototype.setNumArcPoints = function(num){
    this._numArcPoints = Math.max(2,num);
};

/**
 * Returns the number of points to create path segments for [arc]{@link Path2d#arc} and [arcTo]{@link Path2d#arcTo}.
 * @returns {Number}
 */
Path2d.prototype.getNumArcPoints = function(){
    return this._numArcPoints;
};

/**
 * Sets the number of points to create path segments for [ellipse]{@link Path2d#ellipse} and
 * [ellipseAt]{@link Path2d#ellipseAt}.
 * @param {Number} num
 */
Path2d.prototype.setNumEllipsePoints = function(num){
    this._numEllipsePoints = Math.max(2,num);
};

/**
 * Returns the number of points to create path segments for [ellipse]{@link Path2d#ellipse} and
 * [ellipseAt]{@link Path2d#ellipseAt}.
 * @returns {Number}
 */
Path2d.prototype.getNumEllipsePoints = function(){
    return this._numArcPoints;
};

/*--------------------------------------------------------------------------------------------------------------------*/
// Component Calculation Setter & Getter
/*--------------------------------------------------------------------------------------------------------------------*/

/**
 * If true tangents and normal will be calculated.
 * @param enable
 */
Path2d.prototype.setCalculateTangentsAndNormals = function(enable){
    if(this._calcTangentsAndNormals == enable){
        return;
    }
    this.clear();
    this._calcTangentsAndNormals = enable;
};

/**
 * Returns true if tangents and normals get calculated.
 * @returns {Boolean}
 */
Path2d.prototype.getCalculateTangentsAndNormals = function(){
    return this._calcTangentsAndNormals;
};

/*--------------------------------------------------------------------------------------------------------------------*/
// Svg Commands
/*--------------------------------------------------------------------------------------------------------------------*/

/**
 * If true svg commands will be created on every path modification. Clears the path.
 * @param {Boolean} enable
 */
Path2d.prototype.setRecordSvgCmd = function(enable){
    if(this._recordSvgCmd == enable){
        return;
    }
    this.clear();
    this._recordSvgCmd = enable;
};

/**
 * Returns true if svg commands recoding is enabled.
 * @returns {Boolean}
 */
Path2d.prototype.isRecordSvgCmdEnabled = function(){
    return this._recordSvgCmd;
};

/*--------------------------------------------------------------------------------------------------------------------*/
// Factory
/*--------------------------------------------------------------------------------------------------------------------*/

/**
 * Creates a path from svg command.
 * @param {String} cmd
 * @param {Object} [options]
 * @returns {Path2d}
 */
Path2d.createFromSvgCmd = function(cmd,options){
    var path = new Path2d(options);
    path.setSvgPathCmd(cmd);
    return path;
};

/*--------------------------------------------------------------------------------------------------------------------*/
// Shared options
/*--------------------------------------------------------------------------------------------------------------------*/

/**
 * Returns the shared default option object.
 * @returns {{}}
 */
Path2d.getDefaultOptions = function(){
    var out = {};
    for(var p in DEFAULT_OPTIONS){
        out[p] = DEFAULT_OPTIONS[p];
    }
    return out;
};

/**
 * Sets the shared default option object used for newly created Path2d instances.
 * @param options
 */
Path2d.setDefaultOptions = function(options){
    validateOptions(options);
    DEFAULT_OPTIONS = options;
};

/*--------------------------------------------------------------------------------------------------------------------*/
// Export
/*--------------------------------------------------------------------------------------------------------------------*/

module.exports = Path2d;