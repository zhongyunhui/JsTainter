---
layout: post
title:  "Reflection about JavaScript Taint Analysis"
date:   2019-04-29 01:01:05 +0000
categories: jekyll update
---

# 0x00 Abstract

Unlike binary program, whose behavior is simple and easy to analysis, JavaScirpt is highly dynamic and very complex, thus hard to analysis. I will cover possible implementations of data structure of shadow value along with JavaScript variable, and their pros and cons. Also, here is some of my reflection about the cases that we need to consider when implementing dynamic taint analysis for JavaScript, possible ways to deal with them, and the drawbacks of these approaches.

# 0x01 Data Structure of Shadow Value

Here the shadow value is the taint information of a particular variable. We can simply use a `boolean` to represent taint state, in which `true` means `tainted` and `false` means `not tainted`; we can also use an `boolean array` to represent taint state, in which boolean variables at different indeces represent taint state from `different taint sources`. The second approach provides more information but harder to implement. To make it more convinient, I will call such boolean variable and boolean array variable as `taint infomation variable`.

Then I will discuss design choice(s) of different types of variables in JavaScipt.

## Number

The number includes `int` and `float` in JavaScript. Its shadow value is one taint information variable. It is also possible to trace the taint information for each bit?

## String

The string is a sequence of characters. Its shadow value is an array of taint information variable whose length is same as the length of the string.

## Object and Array

One design choice for these is never taint the object itself, but taint the elements or fields inside the array or object. For example, if we have a array of integers and all of them are tainted, we do not taint the array to a `AnnotatedValue` with actual value as an array, but taint each individual elements such that the array becomes an array of `AnnotatedValue` with actual value as an integer. However, here is a drawback of this degisn, which might cause false negative: the key is never tainted.

Array to string == `.join(',')`

## Boolean

This type of variable can be dealed in the same way as number. When bool converted to int, taint level?

## NaN, undefined, and null

These are some special cases. 

Firstly, `typeof NaN === 'number'`, so maybe this can be dealed in the same way as number. 

Secondly, `undefined` will be produced when a variable or a field is not defined. We could never taint it, or also treat it in the same way as number, depending on the design choice. //todo

Thirdly, since `typeof null === 'object'`, and `Object` is never tained as I mentioned above, `null` will not be tained either.

## Function

I don't think it is possible for a function to be tainted, so let's leave it to be `never tainted`.

## Others

Taint degree?

# 0x02 Taint Propagation Rule

Due to the dynamic and weakly-typed feature of JavaScript, the taint propagation rule is much more complicated than dynamic taint analysis over binary executables.

## Binary Operators

### Add

Since there is no overloading operator in JavaScript, there are only 2 functionalities for `+` operator: *numeric plus* and *string concatination*. I have written a script that shows the behavior of `+` for different types:

```javascript
function Test()
{
	this.t = 1;
}
var arr = [];
arr[0] = 1;
arr[2] = 4;
arr["a"] = 'b';
arr["c"] = new Test();
var typeVals = {str : "abc", numstr : "123", num : 123,
	undefined : undefined, null:null, bool : true, object : {a:1, b:1},
	objectTest: new Test(), arr : arr};

const print = (s)=>process.stdout.write(''+s);
const println = (s)=>print(s+'\n');

print('\"\",')
for (var t2 in typeVals)
{
	print('\"' + t2 + '\",');
}
println('');
for (var t1 in typeVals)
{
	print(t1 + ',');
	for (var t2 in typeVals)
	{
		var res = typeVals[t2] - typeVals[t1]
		var type = typeof res;
		print('\"' + type + ': ' + res + '\",');
	}
	println('');
}
```

Opening the output as `.csv` file, we can clearly see that if both operands are among `number`, `undefined`, `null` and `boolean`, the result would be `number` type, so we can regard them as numeric add; for other cases, since the result is `string` tyoe, so we can regard them as string concatenation. For string concatination, this will happen not only when 2 operands are `string` type, but will also happen when they are array or object, which makes things complex. The approach to solve this is to implement a function that takes a value as input and returns the corresponding taint array if that value is converted to string. The argument value does not have to be `actual value` (e.i. can be `AnnotatedValue`). There are serveral cases to consider:

**String**

If the value is string, just return its shadow value directly, since nothing will change if it is used as string.

**Number, Boolean and Undefined**

In current implementation, the method is easy: if the shadow value says the value is tainted, then every character is tainted when it is converted to `string`; if the shadow value says the value is untainted, then every character is untainted when it is converted to `string`. However, such design has drawbacks: the string is tainted even if the string cannot be completely controlled by the user who provides the input, and this will cause false positive if the goal is to detect vulnerability such as `XSS`. For example, consider the following code:

```javascript
//variable `input` is tainted and can be controlled by attacker
var num = parseInt(input); 
document.write("Age: " + num);
```

The num must be a `number` type, and attacker can control it by controlling variable `input`. When `num` is converted to `string`, every character will be tainted according to the rule described above, then it is passed into `document.write`. If the rule that is used to detect vulnerability is to report the vulnerability as long as data passed into sink is tainted, the false positive will be reported in this case. The reason is that even if the string converted from variable `num` is tainted, attacker cannot have full control of the string: attacker can only control the character ranging from `'0'` to `'9'`, so DOM-based XSS is not here. If we are using taint analysis to detect vulnerabilities, we may want to remove the taint as long as it is sanitized, or to use different taint value strategy that can specify different `taint level` (e.g. use `enum` instead of `boolean`). When it is sanitized, the taint state will be somewhat different from the taint state before sanitizing.

**Array**

When array is converted to string, every element //todo

//todo, handle circular structure

//todo: add a picture



### Binary Arithmetic Operator

It works fine for numeric operands, but for other types, it becomes hard to analyze. For example, `NaN` will be generated when using arithmetic operator over string, for example `"abc" - "def"` will produce `NaN`. Do we mark the `NaN` to be tainted if these 2 strings are tainted? Also for the case `"789" - "234"`, how do we mark taint state of result?

### Boolean Operator

This is even complicated, and could easily produce false negatives/positives; also when `==` is used, things will get more complicated. In addition, for `||` and `&&`, we also need to consider the case when operands are not boolean... For example, `("a" || "b") === "a"` 

### Bit-wise Operator

The problem is not only false positives that will be produced if bit-wise taint information is not used, we may also need to consider cases like `"a" | "b"`

## Get Field

Array case, Object case, key is tainted...

## Set Field

## Function Call

### Native Function Call

This should be regarded like operators instead of functions, which will be implemented further. However, the edge case is also hard to consider. For example, what if arguments passed into `substr` function is not `string` type?

### User Defined Function Call

### Constructor

todo, there are some wired behavior

### SandBox

What if the codes being analyzed is malicious and want to gain previlidge? e.g. define another `AnnotatedValue` class, or defined a function with same name as function in `Analyzer`, but this seems to be already solved by `Jalangi`