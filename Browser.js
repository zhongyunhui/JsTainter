(function (sandbox) {
function Browser()
{
	var nextId = 1;
	this.getNextId = function ()
	{
		if (nextId >= 32)
			throw Error("Too many input sources");
		return nextId++; // return nextId, and increment it
	};
	var inputsArr = [];
	this.getInputId = function (input)
	{
		for (var i = 0; i < inputsArr; i++)
		{
			if (inputsArr[i].input === input)
				return inputsArr[i].id;
		}
		const nextId = this.getNextId();
		inputsArr.push({input:input, id:nextId});
		return nextId;
	};
}//todo : putField, native functions

Browser.prototype.getField = function (base, offset, config)
{
	const nt = sandbox.dtaTaintLogic.noTaint;
	const fillArr = sandbox.dtaUtils.fillArray;
	var ft = sandbox.dtaTaintLogic.taintSource;
	function getRet(val, start, ft, id)
	{
		if (typeof val == 'undefined')
		{
			return {ret: val,
				id: config.ifTaintUndefined ? id : undefined,
				sv: config.ifTaintUndefined ? ft : nt};
		}
		else
		{
			const end = val.length;
			return {
				ret: val, id: id,
				sv: fillArr(nt, start).concat(fillArr(ft, end - start))
			};
		}
	}
	if (base === window.location)
	{
		const id = 0;
		ft = ft(id);
		switch (offset)
		{
		case "hash":
		case "search":
			return getRet(base[offset], 0, ft, id);
		case "pathname":
			if (config.taintPathName)
				return getRet(base[offset], 0, ft, id);
			else
				return {ret:base[offset]};
		case "href":
			const getStart = (idx) => idx === -1 ? base.href.length : idx;
			const taintStart = Math.min(getStart(base.href.indexOf('?')),
				getStart(base.href.indexOf('#')));
			const start = config.taintPathName ?
				base.href.indexOf(base.origin) + base.origin.length : taintStart;
			return getRet(base[offset], start, ft, id);
		default:
			return;
		}
	}
	else if (String(base) === '[object HTMLInputElement]'
		&& offset === 'value' && base.type === 'text')
	{
		const id = this.getInputId(base);
		ft = ft(id);
		return getRet(base.value, 0, ft, id);
	}
};
Browser.prototype.invokeFunSrc = function (f, abase, args)
{
	var ret,sv;
	const ft = sandbox.dtaTaintLogic.taintSource;
	const fillArray = sandbox.dtaUtils.fillArray;
	switch (f)
	{
	case prompt:
		ret = f.apply(abase, args);
		if (typeof ret == 'string')
		{
			const id = this.getNextId();
			sv = fillArray(ft(id), ret.length);
			return {ret: ret, sv: sv, id:id};
		}
		else
		{
			return {ret:ret};
		}
	default:
		return;
	}

};
Browser.prototype.putField = function (base, offset, val, sval, config)
{
	function genMsg(c)
	{
		var ret;
		try
		{
			JSON.stringify(val);
			JSON.stringify(sval);
			ret = {value: val, shadow: sval, name: c+'.'+offset};
		}
		catch (e)
		{
			ret = {value: "[cyclic object]", shadow: "[cyclic object]", name: c+'.'+offset};
		}
		return ret;
	}
	switch (base)
	{
	case window.location:
		switch (offset)
		{
		case 'hash':
		case 'host':
		case 'hostname':
		case 'href':
		case 'origin':
		case 'pathname':
		case 'port':
		case 'protocol':
		case 'search':
			return genMsg("window.location");
		}
		return;
	case document:
		if (offset === 'cookie')
			return genMsg("cookie");
		return;
	}
	const m = String(base).match(/\[object HTML[a-zA-Z0-9]+Element]/);
	if (m !== null && m[0] === String(base))
	{
		return genMsg(String(base));
	}
};

Browser.prototype.invokeFunSnk = function (f, abase, aargs, sbase ,sargs, isTainted)
{
	function genMsg()
	{
		var ret;
		try
		{
			JSON.stringify(aargs);
			JSON.stringify(sargs);
			ret = {value: aargs, shadow: sargs, name: f.name};
		}
		catch (e)
		{
			ret = {value: "[cyclic object]", shadow: "[cyclic object]", name: f.name};
		}
		return ret;
	}
	switch (f)
	{
	case document.write:
	case document.writeln:
	case XMLHttpRequest.prototype.send:
	case XMLHttpRequest.prototype.open:
		if (sargs.map(isTainted).reduce((a,b) => a || b))
			return genMsg();
	}
};
sandbox.dtaBrowser = new Browser();
})(J$);