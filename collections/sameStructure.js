import harden from '@agoric/harden';

import { insist } from './insist';
import { passStyleOf } from '../src/kernel/marshal';

// Are left and right structurally equivalent? This compares
// pass-by-copy data deeply until non-pass-by-copy values are
// reached. The non-pass-by-copy values at the leaves of the
// comparison may only be pass-by-presence objects. If they are
// anything else, including promises, throw an error.
//
// Pass-by-presence objects compare identities.

function sameStructure(left, right) {
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
      const leftNames = Object.getOwnPropertyNames(left);
      const rightNames = Object.getOwnPropertyNames(right);
      if (leftNames.length !== rightNames.length) {
        return false;
      }
      for (const name of leftNames) {
        // TODO: Better hasOwnProperty check
        if (!Object.getOwnPropertyDescriptor(right, name)) {
          return false;
        }
        // TODO: Make cycle tolerant
        if (!sameStructure(left[name], right[name])) {
          return false;
        }
      }
      return true;
    }
    case 'copyError': {
      return left.name === right.name && left.message === right.message;
    }
    default: {
      throw new TypeError(`unrecognized passStyle ${leftStyle}`);
    }
  }
}
harden(sameStructure);

function pathStr(path) {
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
function mustBeSameStructureInternal(left, right, message, path) {
  function complain(problem) {
    const template = harden([
      `${message}:${problem} at ${pathStr(path)}: (`,
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
      const leftNames = Object.getOwnPropertyNames(left);
      const rightNames = Object.getOwnPropertyNames(right);
      if (leftNames.length !== rightNames.length) {
        complain(`${leftNames.length} vs ${rightNames.length} own properties`);
      }
      for (const name of leftNames) {
        // TODO: Better hasOwnProperty check
        if (!Object.getOwnPropertyDescriptor(right, name)) {
          complain(`${name} not found on right`);
        }
        // TODO: Make cycle tolerant
        mustBeSameStructureInternal(left[name], right[name], message, [
          path,
          name,
        ]);
      }
      break;
    }
    case 'copyError': {
      if (left.name !== right.name) {
        complain(`different error name: ${left.name} vs ${right.name}`);
      }
      if (left.message !== right.message) {
        complain(
          `different error message: ${left.message} vs ${right.message}`,
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
function mustBeSameStructure(left, right, message) {
  mustBeSameStructureInternal(left, right, `${message}`, null);
}
harden(mustBeSameStructure);

// If `val` would be a valid input to `sameStructure`, return
// normally. Otherwise error.
function mustBeComparable(val) {
  mustBeSameStructure(val, val, 'not comparable');
}

export { sameStructure, mustBeSameStructure, mustBeComparable };
