// @flow

import harden from '@agoric/harden';

import { insist } from './insist';
import { passStyleOf } from '../src/kernel/marshal';

/* ::
import type { PassByCopyError } from '../src/kernel/marshal';
*/

// boring: "This type cannot be coerced to string" in template literals
// https://github.com/facebook/flow/issues/2814
const ss = x => String(x);

// Shim of Object.fromEntries from
// https://github.com/tc39/proposal-object-from-entries/blob/master/polyfill.js
function ObjectFromEntries(iter /* : Iterable<{ '0': string, '1': mixed }> */) {
  const obj = {};

  for (const pair of iter) {
    if (Object(pair) !== pair) {
      throw new TypeError('iterable for fromEntries should yield objects');
    }

    // Consistency with Map: contract is that entry has "0" and "1" keys, not
    // that it is an array or iterable.

    const { '0': key, '1': val } = pair;

    Object.defineProperty(obj, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: val,
    });
  }

  return obj;
}

// ISSUE: passStyleOf could be more static-typing friendly.
function asTy /* :: <T> */(x /* : any */) /* : T */ {
  return x;
}

// A *passable* is something that may be mashalled. It consists of a
// graph of pass-by-copy data terminating in leaves of passable
// non-pass-by-copy data. These leaves may be promises, or
// pass-by-presence objects. A *comparable* is a passable whose leaves
// contain no promises. Two comparables can be synchronously compared
// for structural equivalence.
//
// TODO: Currently, all algorithms here treat the pass-by-copy
// superstructure as a tree. This means that dags are unwound at
// potentially exponential code, and cycles cause failure to
// terminate. We must fix both problems, making all these algorthms
// graph-aware.

// We say that a function *reveals* an X when it returns either an X
// or a promise for an X.

// Given a passable, reveal a corresponding comparable, where each
// leaf promise of the passable has been replaced with its
// corresponding comparable.
function allComparable(passable /* : mixed */) {
  const passStyle = passStyleOf(passable);
  switch (passStyle) {
    case 'null':
    case 'undefined':
    case 'string':
    case 'boolean':
    case 'number':
    case 'symbol':
    case 'bigint':
    case 'presence':
    case 'copyError': {
      return passable;
    }
    case 'promise': {
      // eslint-disable-next-line prettier/prettier
      return asTy/* :: <Promise<mixed>> */(passable).then(nonp =>
        allComparable(nonp),
      );
    }
    case 'copyArray': {
      // eslint-disable-next-line prettier/prettier
      const valPs = asTy/* :: <Array<mixed>> */(passable).map(p =>
        allComparable(p),
      );
      return Promise.all(valPs).then(vals => harden(vals));
    }
    case 'copyRecord': {
      // eslint-disable-next-line prettier/prettier
      const passRec = asTy/* :: <{ [string]: mixed }> */(passable);
      const names /* : string[] */ = Object.getOwnPropertyNames(passRec);
      const valPs = names.map(name => allComparable(passRec[name]));
      return Promise.all(valPs).then(vals =>
        harden(
          ObjectFromEntries(
            vals.map((val, i) => ({ '0': names[i], '1': val })),
          ),
        ),
      );
    }
    default: {
      throw new TypeError(`unrecognized passStyle ${passStyle}`);
    }
  }
}
harden(allComparable);

// Are left and right structurally equivalent comparables? This
// compares pass-by-copy data deeply until non-pass-by-copy values are
// reached. The non-pass-by-copy values at the leaves of the
// comparison may only be pass-by-presence objects. If they are
// anything else, including promises, throw an error.
//
// Pass-by-presence objects compare identities.

function sameStructure(left /* : mixed */, right /* : mixed */) {
  const leftStyle = passStyleOf(left);
  const rightStyle = passStyleOf(right);
  insist(leftStyle !== 'promise')`\
Cannot structurally compare promises: ${left}`;
  insist(rightStyle !== 'promise')`\
Cannot structurally compare promises: ${right}`;

  if (leftStyle !== rightStyle) {
    return false;
  }
  switch (leftStyle) {
    case 'null':
    case 'undefined':
    case 'string':
    case 'boolean':
    case 'number':
    case 'symbol':
    case 'bigint':
    case 'presence': {
      return Object.is(left, right);
    }
    case 'copyRecord':
    case 'copyArray': {
      // eslint-disable-next-line prettier/prettier
      const leftObj = asTy/* :: <{[string]: mixed}> */(left);
      // eslint-disable-next-line prettier/prettier
      const rightObj = asTy/* :: <{[string]: mixed}> */(right);
      const leftNames = Object.getOwnPropertyNames(leftObj);
      const rightNames = Object.getOwnPropertyNames(rightObj);
      if (leftNames.length !== rightNames.length) {
        return false;
      }
      for (const name of leftNames) {
        // TODO: Better hasOwnProperty check
        if (!Object.getOwnPropertyDescriptor(right, name)) {
          return false;
        }
        // TODO: Make cycle tolerant
        if (!sameStructure(leftObj[name], rightObj[name])) {
          return false;
        }
      }
      return true;
    }
    case 'copyError': {
      // eslint-disable-next-line prettier/prettier
      const leftErr = asTy/* :: <PassByCopyError> */(left);
      // eslint-disable-next-line prettier/prettier
      const rightErr = asTy/* :: <PassByCopyError> */(right);
      return (
        leftErr.name === rightErr.name && leftErr.message === rightErr.message
      );
    }
    default: {
      throw new TypeError(`unrecognized passStyle ${leftStyle}`);
    }
  }
}
harden(sameStructure);

/* ::
type Path = null | [Path, string];
*/

function pathStr(path /* : Path */) /* : string */ {
  if (path === null) {
    return 'top';
  }
  const [base, index] = path;
  let i = index;
  const baseStr = pathStr(base);
  if (typeof i === 'string' && /^[a-zA-Z]\w*$/.test(i)) {
    return `${baseStr}.${i}`;
  }
  if (typeof i === 'string' && `${+i}` === i) {
    i = +i;
  }
  return `${baseStr}[${JSON.stringify(i)}]`;
}

// TODO: Reduce redundancy between sameStructure and
// mustBeSameStructureInternal
function mustBeSameStructureInternal(
  left /* : mixed */,
  right /* : mixed */,
  message /* : string */,
  path /* : Path */,
) {
  function complain(problem) {
    const template = harden([
      `${message}: ${problem} at ${pathStr(path)}: (`,
      ') vs (',
      ')',
    ]);
    insist(false)(template, left, right);
  }

  const leftStyle = passStyleOf(left);
  const rightStyle = passStyleOf(right);
  if (leftStyle === 'promise') {
    complain('Promise on left');
  }
  if (rightStyle === 'promise') {
    complain('Promise on right');
  }

  if (leftStyle !== rightStyle) {
    complain('different passing style');
  }
  switch (leftStyle) {
    case 'null':
    case 'undefined':
    case 'string':
    case 'boolean':
    case 'number':
    case 'symbol':
    case 'bigint':
    case 'presence': {
      if (!Object.is(left, right)) {
        complain('different');
      }
      break;
    }
    case 'copyRecord':
    case 'copyArray': {
      // eslint-disable-next-line prettier/prettier
      const leftObj = asTy/* :: <{[string]: mixed}> */(left);
      // eslint-disable-next-line prettier/prettier
      const rightObj = asTy/* :: <{[string]: mixed}> */(right);
      const leftNames = Object.getOwnPropertyNames(leftObj);
      const rightNames = Object.getOwnPropertyNames(rightObj);
      if (leftNames.length !== rightNames.length) {
        complain(`${leftNames.length} vs ${rightNames.length} own properties`);
      }
      for (const name of leftNames) {
        // TODO: Better hasOwnProperty check
        if (!Object.getOwnPropertyDescriptor(right, name)) {
          complain(`${name} not found on right`);
        }
        // TODO: Make cycle tolerant
        mustBeSameStructureInternal(leftObj[name], rightObj[name], message, [
          path,
          name,
        ]);
      }
      break;
    }
    case 'copyError': {
      // eslint-disable-next-line prettier/prettier
      const leftErr = asTy/* :: <PassByCopyError> */(left);
      // eslint-disable-next-line prettier/prettier
      const rightErr = asTy/* :: <PassByCopyError> */(right);
      if (leftErr.name !== rightErr.name) {
        complain(`different error name: ${leftErr.name} vs ${rightErr.name}`);
      }
      if (leftErr.message !== rightErr.message) {
        complain(
          `different error message: ${leftErr.message} vs ${rightErr.message}`,
        );
      }
      break;
    }
    default: {
      complain(`unrecognized passStyle ${leftStyle}`);
      break;
    }
  }
}
function mustBeSameStructure(
  left /* : mixed */,
  right /* : mixed */,
  message /* : mixed */,
) {
  mustBeSameStructureInternal(left, right, `${ss(message)}`, null);
}
harden(mustBeSameStructure);

// If `val` would be a valid input to `sameStructure`, return
// normally. Otherwise error.
function mustBeComparable(val /* : mixed */) {
  mustBeSameStructure(val, val, 'not comparable');
}

export { allComparable, sameStructure, mustBeSameStructure, mustBeComparable };
