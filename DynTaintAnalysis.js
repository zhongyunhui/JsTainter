//todo: --------------nodejs
const Utils = new (require("./Utils").Utils)();
const Log = new (require("./Log").Log)();
const assert = require("assert");
//----------nodejs

var config = new (function ()
{
	this.ifTaintNaN = true;
})();


function AnnotatedValue(val, shadow)
{
	this.val = val;
	this.shadow = shadow;
}
function actual(val)
{
	return val instanceof AnnotatedValue ? val.val : val;
}
function shadow(val, noTaint)
{
	if (val instanceof AnnotatedValue)
	{
		return val.shadow;
	}
	else if (typeof val === 'string')
	{
		var ret = [];//todo, optimize to logn
		for (var i = 0; i < val.length; i++)
		{
			ret[i] = noTaint;
		}
		return ret;
	}
	else if (typeof val === 'number')
	{
		return noTaint;
	}
	return noTaint;//todo???
}

function assertTaint(val, taint, rule, position)
{
	function myAssert(b)
	{
		if (!b)
		{
			process.stdout.write("Assertion failure at" + position);
			assert(false);
		}
	}
	var s = shadow(val, rule.noTaint);
	myAssert(typeof s === typeof taint);
	if (Array.isArray(s))
	{
		myAssert(s.length === taint.length);
		for (var i = 0; i < s.length; i++)
		{
			myAssert(s[i] === taint[i]);
		}
	}
	else
	{
		myAssert(s === taint);
	}
}

const numAddTypes = new Set(['undefined', 'boolean', 'number']);
const isNumAddOperands = (val) => numAddTypes.has(typeof val) || val === null;
/*undefined and null in array will not be shown
when they are in array,
and array is converted to string*/
const isSolidStrInArr = (val, outArrs) => typeof val != 'undefined'
	&& val !== null && outArrs.indexOf(val) === -1;

function getTaintArrayForArray(arr, rule, outArrs)
{//pre: Array.isArray(aval)
	if (arr.length === 0)
		return [];
	outArrs.push(arr);
	var ret = [];
	for (var i = 0; i < arr.length - 1; i++)
	{//iterate except for last element
		if (isSolidStrInArr(actual(arr[i]), outArrs))
		{
			ret = ret.concat(getTaintArrayH(arr[i], rule, outArrs));
		}
		ret = ret.concat(false);//',' is not tainted
	}
	if (isSolidStrInArr(actual(arr[i]), outArrs))
	{
		ret = ret.concat(getTaintArrayH(arr[i], rule, outArrs));
	}
	//Utils.assert(ret.length === (''+arr).length);
	//cannot be true due to AnnotatedValue Object
	outArrs.pop();
	return ret;
}
function getTaintArrayH(val, rule, outArrs)
{//get the taint array when `val` is converted to string
	var aval = actual(val);
	switch(typeof aval)
	{
		case 'string':
			return shadow(val, rule.noTaint);
		case 'object':
		{
			if (Array.isArray(aval))
				return getTaintArrayForArray(aval, rule, outArrs);
			else //this includes the case where aval === null
				return Utils.fillArray(rule.noTaint, ('' + aval).length)
		}
		case 'number':
		case 'boolean':
		case 'undefined':
		{
			return rule.toStringTaint(aval, shadow(val, rule.noTaint));
		}
		default:
			throw Error("Currently does not support type \'" + typeof val + "\' for add");
	}
}

function getTaintArray(val, rule)
{
	return getTaintArrayH(val, rule, []);
}

function addTaintProp(left, right, result, rule, op)
{
	if (isNumAddOperands(actual(left)) &&
		isNumAddOperands(actual(right)))
	{//numeric add
		var taint_state = rule.arithmetic(
			shadow(left, rule.noTaint), shadow(right, rule.noTaint));

		process.stdout.write(actual(left) + ' ' + op + ' ' +
			actual(right) + ' = ' + result + '; ');
		process.stdout.write(shadow(left, rule.noTaint) + ' ' + op + ' ' +
			shadow(right, rule.noTaint) + ' = ' + taint_state + '\n');

		return new AnnotatedValue(result, taint_state);
	}
	else //if (typeof actual(left) === "string" &&
		//typeof actual(right) === "string")
	{//string concatenation
		return new AnnotatedValue(actual(left) + actual(right),
			getTaintArray(left, rule).concat(getTaintArray(right, rule)));
	}
}

const numChar = new Set("0123456789xXabcdefABCDEF.-InfinityNaN");
function alwaysGiveNaNStr(v, s, rule)
{//pre: s is string
	var tmp = "";
	for (var i = 0; i < v.length; i++)
	{
		if (s[i] !== rule.noTaint)
		{//if tainted, try to convert to number
			tmp += '0';
		}
		else if (!numChar.has(v[i]))
		{//if not in standard numChar, must be NaN
			return true;
		}
		else
		{//if it is standard, leave it
			tmp += v[i];
		}
	}
	return isNaN(Number(tmp));
}

const numArithTypes = new Set(['boolean', 'number']);
function alwaysGiveNaN(rawVal, rule)
{
	var val = actual(rawVal);
	var s = shadow(rawVal, rule.noTaint);
	var t = typeof val;
	var b = (t === 'string') && alwaysGiveNaNStr(val, s, rule);
	/*if (b || rule.isTainted(s))
		Log.log("Tainted String is producing NaN, " +
			"assuming result to be untainted, " +
			"change the input to number for higher accuracy");*/
	return (t === 'object' && val !== null &&
		alwaysGiveNaNStr(''+val, rule.toStringTaint(val, s), rule)) ||
		t === 'undefined' || b || (t === 'number' && isNaN(val));
}
//string that will always produce NaN




function arithTaintProp(left, right, result, rule, op)
{
	if (alwaysGiveNaN(left, rule) ||
		alwaysGiveNaN(right, rule))
	{
		return result;//no taint
	}
	else
	{//might still be false positive if s == 'true'
		var taint_state = rule.arithmetic(
			rule.compressTaint(shadow(left, rule.noTaint)),
			rule.compressTaint(shadow(right, rule.noTaint)));

		process.stdout.write(actual(left) + ' ' + op + ' ' +
			actual(right) + ' = ' + result + '; ');
		process.stdout.write(shadow(left, rule.noTaint) + ' ' + op + ' ' +
			shadow(right, rule.noTaint) + ' = ' + taint_state + '\n');

		return new AnnotatedValue(result, taint_state);
	}
}

function isTaintAsNum(val, rule)
{
	if (alwaysGiveNaN(val, rule))
		return false;
	return rule.isTainted(shadow(val));
}

const isZeroInBitOper = (v, rule) =>
	v === null || alwaysGiveNaN(v, rule) ||
	(typeof v == "number" && (isNaN(v) || v === 0));

function shiftTaintProp(left, right, result, rule, op)
{
	if (isZeroInBitOper(left, rule))
	{//if LHS is always NaN, result is always 0
		return result;
	}
	else
	{//might still be false positive if s == 'true'
		var taint_state = rule.arithmetic(
			rule.compressTaint(shadow(left, rule.noTaint)),
			rule.compressTaint(shadow(right, rule.noTaint)));

		process.stdout.write(actual(left) + ' ' + op + ' ' +
			actual(right) + ' = ' + result + '; ');
		process.stdout.write(shadow(left, rule.noTaint) + ' ' + op + ' ' +
			shadow(right, rule.noTaint) + ' = ' + taint_state + '\n');

		return new AnnotatedValue(result, taint_state);
	}
}

function cmpTaintProp(left, right, result, rule, op)
{//todo, consider more cases to improve accuracy
	var taint_state = rule.arithmetic(
	rule.compressTaint(shadow(left, rule.noTaint)),
	rule.compressTaint(shadow(right, rule.noTaint)));

	process.stdout.write(actual(left) + ' ' + op + ' ' +
		actual(right) + ' = ' + result + '; ');
	process.stdout.write(shadow(left, rule.noTaint) + ' ' + op + ' ' +
		shadow(right, rule.noTaint) + ' = ' + taint_state + '\n');

	return new AnnotatedValue(result, taint_state);
}


function binaryRec(left, right, taintProp, sandbox, iid)
{//todo
	/*if (isTainted(shadow(left, noTaint)) || isTainted(shadow(right, noTaint)))
	{
		taintProp[(sandbox.iidToLocation(
			sandbox.getGlobalIID(iid)))] = 1;
	}*/
}
function funcInvokeRec(func, base, args)
{

}

function taintAll(val)
{
	if (typeof val == 'object')
	{//todo: should we change strategy
		ret = Array.isArray(val) ? [] : {};
		for (var k in val)
		{
			taintAll(val[k]);
		}
	}
}
function untaintAll()
{
	//todo
}

function andTaintProp(left, right, result, rule, op)
{
	if (isZeroInBitOper(left, rule) ||
		 isZeroInBitOper(right, rule))
	{
		return result;
	}
	else
	{
		var taint_state = rule.arithmetic(
		rule.compressTaint(shadow(left, rule.noTaint)),
		rule.compressTaint(shadow(right, rule.noTaint)));

		process.stdout.write(actual(left) + ' ' + op + ' ' +
			actual(right) + ' = ' + result + '; ');
		process.stdout.write(shadow(left, rule.noTaint) + ' ' + op + ' ' +
			shadow(right, rule.noTaint) + ' = ' + taint_state + '\n');

		return new AnnotatedValue(result, taint_state);
	}
}


(function (sandbox)
{
function TaintAnalysis(rule)
{
	this.taintProp = {};
	this.binaryPre = function(iid, op, left, right)
	{
		return {op:op,left:left,right:right,skip:true}
	};
	this.binary = function(iid, op, left, right, result)
	{
		var aleft = actual(left);
		var aright = actual(right);
		binaryRec(left, right, this.taintProp, sandbox, iid);
		var ret;
		switch (op)
		{
		case "+":
			result = aleft + aright;
			ret = {result: addTaintProp(left, right, result, rule, op)};
			break;
		case "-":
			result = aleft - aright;
			ret = {result: arithTaintProp(left, right, result, rule, op)};
			break;
		case "*":
			result = aleft * aright;
			ret = {result: arithTaintProp(left, right, result, rule, op)};
			break;
		case "/":
			result = aleft / aright;
			ret = {result: arithTaintProp(left, right, result, rule, op)};
			break;
		case "%":
			result = aleft % aright;
			ret = {result: arithTaintProp(left, right, result, rule, op)};
			break;
		case "<<":
			result = aleft << aright;
			ret = {result: shiftTaintProp(left, right, result, rule, op)};
			break;
		case ">>":
			result = aleft >> aright;
			ret = {result: shiftTaintProp(left, right, result, rule, op)};
			break;
		case ">>>":
			result = aleft >>> aright;
			ret = {result: shiftTaintProp(left, right, result, rule, op)};
			break;
		case "<":
			result = aleft < aright;
			ret = {result: cmpTaintProp(left, right, result, rule, op)};
			break;
		case ">":
			result = aleft > aright;
			ret = {result: cmpTaintProp(left, right, result, rule, op)};
			break;
		case "<=":
			result = aleft <= aright;
			ret = {result: cmpTaintProp(left, right, result, rule, op)};
			break;
		case ">=":
			result = aleft >= aright;
			ret = {result: cmpTaintProp(left, right, result, rule, op)};
			break;
		case "==":
			result = aleft == aright;
			ret = {result: cmpTaintProp(left, right, result, rule, op)};
			break;
		case "!=":
			result = aleft != aright;
			ret = {result: cmpTaintProp(left, right, result, rule, op)};
			break;
		case "===":
			result = aleft === aright;
			ret = {result: cmpTaintProp(left, right, result, rule, op)};
			break;
		case "!==":
			result = aleft !== aright;
			ret = {result: cmpTaintProp(left, right, result, rule, op)};
			break;
		case "&":
			result = aleft & aright;//todo: imprive accracy
			ret = {result: andTaintProp(left, right, result, rule, op)};
			break;
		case "|":
			result = aleft | aright;
			ret = {result: cmpTaintProp(left, right, result, rule, op)};
			break;
		case "^":
			result = aleft ^ aright;
			ret = {result: cmpTaintProp(left, right, result, rule, op)};
			break;
		case "delete":
			result = delete aleft[aright];
			ret = {result: result};
			break;
		case "instanceof":
			result = aleft instanceof aright;
			ret = {result: result};
			break;
		case "in":
			result = aleft in aright;
			ret = {result: result};
			break;
		default:
			throw new Error(op + " at " + iid + " not found");
			break;
		}
		return ret;
	};
	this.literal = function (iid, val, hasGetterSetter)
	{
		if (typeof val === 'function')
		{//sandbox
			//process.stdout.write(''+val)
		}
		//functinon for testing
		if (typeof val === 'string')
		{
			if (val.substr(0, 11) === "ta1nt3d_int")
			{
				return {
					result: new AnnotatedValue(
						Number(val.substr(11)), rule.fullTaint)
				};
			}
			else if (val.substr(0, 14) === "ta1nt3d_string")
			{
				var ret = val.substr(14);
				var taint = Utils.fillArray(rule.fullTaint, ret.length);
				return {result: new AnnotatedValue(ret, taint)};
			}
			else if (val === "ta1nt3d_bool")
			{
				return {result: new AnnotatedValue(true, rule.fullTaint)};
			}
		}
	};
	this.endExecution = function()
	{
		process.stdout.write(JSON.stringify(this.taintProp) + '\n')
	};
	this.invokeFunPre = function(iid, f, base, args, isConstructor, isMethod)
	{
		return {f:f, base:base, args:args, skip:true}
	};
	this.invokeFun = function(iid, f, base, args, result, isConstructor, isMethod)
	{
		//todo: to remove, for test only
		if (f.name === 'assertTaint')
		{
			assertTaint(args[0], args[1], rule,
				(sandbox.iidToLocation(sandbox.getGlobalIID(iid))));
		}
		if (Utils.isNative(f))
		{
			//convert arguments to actual value
			var abase = actual(base);
			var aargs = [];
			for (var i = 0; i < args.length; i++)
			{
				aargs[i] = actual(args[i]);
			}
			var sv;
			if (f === String.prototype.substr && typeof abase == 'string')
			{//todo: what if index and size are tainted?
				sv = shadow(base, rule.noTaint).slice(aargs[0], aargs[0] + aargs[1]);
			}
			if (f === Number)
			{
				if (!alwaysGiveNaN(args[0], rule))
				{
					sv = rule.compressTaint(shadow(args[0], rule.noTaint));
				}
			}
			//todo: process other type of native function
			process.stdout.write("sv " + JSON.stringify(sv));
			if (sv)
				return {result:new AnnotatedValue(
					f.apply(abase, aargs), sv)};
			else
				return {result:f.apply(abase, aargs)};
		}
		else
		{
			//process.stdout.write('--------'+actual(base));
			//if (isConstructor)
			return {result:f.apply(base, args)};
		}
	};
	this.getFieldPre = function(iid, base, offset)
	{
		//todo, when offset is tainted
		process.stdout.write((base) + ' ' + offset + '\n');
		return {base:actual(base), offset:actual(offset)};
	};
}
sandbox.analysis = new TaintAnalysis(new (require("./TaintLogic").TaintUnit)());
})(J$);