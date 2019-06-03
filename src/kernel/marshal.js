// @flow

import harden from '@agoric/harden';
import Nat from '@agoric/nat';

// Special property name that indicates an encoding that needs special
// decoding.
const QCLASS = '@qclass';
export { QCLASS };

// objects can only be passed in one of two/three forms:
// 1: pass-by-presence: all properties (own and inherited) are methods,
//    the object itself is of type object, not function
// 2: pass-by-copy: all string-named own properties are data, not methods
//    the object must inherit from Object.prototype or null
// 3: the empty object is pass-by-presence, for identity comparison

// todo: maybe rename pass-by-presence to pass-as-presence, or pass-by-proxy
// or remote reference

// all objects must be frozen

// anything else will throw an error if you try to serialize it

// with these restrictions, our remote call/copy protocols expose all useful
// behavior of these objects: pass-by-presence objects have no other data (so
// there's nothing else to copy), and pass-by-copy objects have no other
// behavior (so there's nothing else to invoke)

const errorConstructors = new Map([
  ['Error', Error],
  ['EvalError', EvalError],
  ['RangeError', RangeError],
  ['ReferenceError', ReferenceError],
  ['SyntaxError', SyntaxError],
  ['TypeError', TypeError],
  ['URIError', URIError],
]);

export function getErrorContructor(name /* : string */) {
  return errorConstructors.get(name);
}

// boring: "This type cannot be coerced to string" in template literals
// https://github.com/facebook/flow/issues/2814
const ss = x => String(x);

/* ::
export interface PassByCopyError {
  name: string,
  message: string,
};

declare function BigInt(x: mixed): mixed;

*/
function isPassByCopyError(val /* : mixed */) {
  // TODO: Need a better test than instanceof
  if (!(val instanceof Error)) {
    return false;
  }
  const proto = Object.getPrototypeOf(val);
  const { name } = val;
  const EC = getErrorContructor(name);
  // $FlowFixMe https://github.com/facebook/flow/issues/6110
  if (!EC || EC.prototype !== proto) {
    throw TypeError(`Must inherit from an error class .prototype ${ss(val)}`);
  }

  const {
    message: { value: messageStr },
    // Allow but ignore only extraneous own `stack` property.
    // TODO: I began the variable below with "_". Why do I still need
    // to suppress the lint complaint?
    // eslint-disable-next-line no-unused-vars
    stack: _optStackDesc,
    ...restDescs
  } = Object.getOwnPropertyDescriptors(val);
  const restNames = Object.keys(restDescs);
  if (restNames.length >= 1) {
    throw new TypeError(`Unexpected own properties in error: ${ss(restNames)}`);
  }
  if (typeof messageStr !== 'string') {
    throw new TypeError(`malformed error object: ${ss(val)}`);
  }
  return true;
}

function isPassByCopyArray(val /* : mixed */) {
  if (!Array.isArray(val)) {
    return false;
  }
  // $FlowFixMe https://github.com/facebook/flow/issues/6110
  if (Object.getPrototypeOf(val) !== Array.prototype) {
    throw new TypeError(`malformed array: ${ss(val)}`);
  }
  const len = val.length;
  // $FlowFixMe https://github.com/facebook/flow/blob/master/lib/core.js#L63
  const descs = Object.getOwnPropertyDescriptors(val);
  for (let i = 0; i < len; i += 1) {
    const desc = descs[ss(i)];
    if (!desc) {
      throw new TypeError(`arrays must not contain holes`);
    }
    if (!('value' in desc)) {
      throw new TypeError(`arrays must not contain accessors`);
    }
    if (typeof desc.value === 'function') {
      throw new TypeError(`arrays must not contain methods`);
    }
  }
  if (Object.keys(descs).length !== len + 1) {
    throw new TypeError(`array must not have non-indexes ${ss(val)}`);
  }
  return true;
}

function isPassByCopyRecord(val /* : mixed */) {
  // $FlowFixMe https://github.com/facebook/flow/issues/6110
  if (Object.getPrototypeOf(val) !== Object.prototype) {
    return false;
  }
  const descList = Object.values(Object.getOwnPropertyDescriptors(val));
  if (descList.length === 0) {
    // empty non-array objects are pass-by-presence, not pass-by-copy
    return false;
  }
  for (const desc of descList) {
    if (!('value' in desc)) {
      // Should we error if we see an accessor here?
      return false;
    }
    if (typeof desc.value === 'function') {
      return false;
    }
  }
  return true;
}

export function mustPassByPresence(val /* : mixed */) {
  // throws exception if cannot
  if (!Object.isFrozen(val)) {
    throw new Error(`cannot serialize non-frozen objects like ${ss(val)}`);
  }
  if (typeof val !== 'object') {
    throw new Error(`cannot serialize non-objects like ${ss(val)}`);
  }
  if (Array.isArray(val)) {
    throw new Error(`Arrays cannot be pass-by-presence`);
  }
  if (val === null) {
    throw new Error(`null cannot be pass-by-presence`);
  }

  const names /* : string[] */ = Object.getOwnPropertyNames(val);
  names.forEach(name => {
    if (name === 'e') {
      // hack to allow Vows to pass-by-presence
      // TODO: Make sure .e. is gone. Then get rid of this hack.
      return;
    }
    if (typeof val[name] !== 'function') {
      throw new Error(
        `cannot serialize objects with non-methods like the .${name} in ${ss(
          val,
        )}`,
      );
      // return false;
    }
  });

  const p = Object.getPrototypeOf(val);
  // $FlowFixMe https://github.com/facebook/flow/issues/6110
  if (p !== null && p !== Object.prototype) {
    mustPassByPresence(p);
  }
  // ok!
}

// How would val be passed?  For primitive values, the answer is
//   * 'null' for null
//   * throwing an error for an unregistered symbol
//   * that value's typeof string for all other primitive values
// For frozen objects, the possible answers
//   * 'copyRecord' for non-empty records with only data properties
//   * 'copyArray' for arrays with only data properties
//   * 'copyError' for instances of Error with only data properties
//   * 'presence' for non-array objects with only method properties
//   * 'promise' for genuine promises only
//   * throwing an error on anything else, including thenables.
// We export passStyleOf so other algorithms can use this module's
// classification.
export function passStyleOf(val /* : mixed */) {
  const typestr = typeof val;
  switch (typeof val) {
    case 'object': {
      if (val === null) {
        return 'null';
      }
      if (QCLASS in val) {
        // TODO Hilbert hotel
        throw new Error(`property "${QCLASS}" reserved`);
      }
      if (!Object.isFrozen(val)) {
        throw new Error(`cannot pass non-frozen objects like ${ss(val)}`);
      }
      if (Promise.resolve(val) === val) {
        return 'promise';
      }
      if (typeof val.then === 'function') {
        throw new Error(`Cannot pass non-promise thenables`);
      }
      if (isPassByCopyError(val)) {
        return 'copyError';
      }
      if (isPassByCopyArray(val)) {
        return 'copyArray';
      }
      if (isPassByCopyRecord(val)) {
        return 'copyRecord';
      }
      mustPassByPresence(val);
      return 'presence';
    }
    case 'function': {
      throw new Error(`bare functions like ${ss(val)} are disabled for now`);
    }
    // $FlowFixMe
    case 'bigint':
    case 'undefined':
    case 'string':
    case 'boolean':
    case 'number': {
      return typestr;
    }
    case 'symbol': {
      // $FlowFixMe flow, you're confused.
      if (Symbol.keyFor(val) === undefined) {
        throw new TypeError('Cannot pass unregistered symbols');
      }
      return typestr;
    }
    default: {
      throw new TypeError(`unrecognized typeof ${typestr}`);
    }
  }
}

// ISSUE: passStyleOf could be more static-typing friendly.
function asTy /* :: <T> */(x /* : any */) /* : T */ {
  return x;
}

// The ibid logic relies on
//    * JSON.stringify on an array visiting array indexes from 0 to
//      arr.length -1 in order, and not visiting anything else.
//    * JSON.parse of a record (a plain object) creating an object on
//      which a getOwnPropertyNames will enumerate properties in the
//      same order in which they appeared in the parsed JSON string.

function makeReplacerIbidTable() {
  const ibidMap = new Map();
  let ibidCount = 0;

  return harden({
    has(obj) {
      return ibidMap.has(obj);
    },
    get(obj) {
      return ibidMap.get(obj);
    },
    add(obj) {
      ibidMap.set(obj, ibidCount);
      ibidCount += 1;
    },
  });
}

function makeReviverIbidTable(cyclePolicy /* : mixed */) {
  const ibids /* : mixed[] */ = [];
  const unfinishedIbids = new WeakSet();

  return harden({
    get(allegedIndex /* : mixed */) {
      const index = Nat(allegedIndex);
      if (index >= ibids.length) {
        throw new RangeError(`ibid out of range: ${index}`);
      }
      const result = ibids[index];
      if (unfinishedIbids.has(result)) {
        switch (cyclePolicy) {
          case 'allowCycles': {
            break;
          }
          case 'warnOfCycles': {
            console.log(`Warning: ibid cycle at ${index}`);
            break;
          }
          case 'forbidCycles': {
            throw new TypeError(`Ibid cycle at ${index}`);
          }
          default: {
            throw new TypeError(
              `Unrecognized cycle policy: ${ss(cyclePolicy)}`,
            );
          }
        }
      }
      return result;
    },
    register(obj /* : mixed */) {
      ibids.push(obj);
      return obj;
    },
    start /* :: <T: mixed[] | { [string]: mixed }> */(obj /* : T */) /* : T */ {
      ibids.push(obj);
      unfinishedIbids.add(obj);
      return obj;
    },
    finish(obj /* : mixed */) {
      unfinishedIbids.delete(obj);
      return obj;
    },
  });
}

export function makeMarshal(
  serializeSlot /* : (mixed, mixed, mixed) => mixed */,
  unserializeSlot /* : (mixed, mixed) => mixed */,
) {
  function makeReplacer(slots, slotMap) {
    const ibidTable = makeReplacerIbidTable();

    return function replacer(_, val /* : mixed */) {
      // First we handle all primitives. Some can be represented directly as
      // JSON, and some must be encoded as [QCLASS] composites.
      const passStyle = passStyleOf(val);
      switch (passStyle) {
        case 'null': {
          return null;
        }
        case 'undefined': {
          return harden({ [QCLASS]: 'undefined' });
        }
        case 'string':
        case 'boolean': {
          return val;
        }
        case 'number': {
          if (Number.isNaN(val)) {
            return harden({ [QCLASS]: 'NaN' });
          }
          if (Object.is(val, -0)) {
            return harden({ [QCLASS]: '-0' });
          }
          if (val === Infinity) {
            return harden({ [QCLASS]: 'Infinity' });
          }
          if (val === -Infinity) {
            return harden({ [QCLASS]: '-Infinity' });
          }
          return val;
        }
        case 'symbol': {
          // $FlowFixMe flow is confused about Symbol
          const key = Symbol.keyFor(val);
          return harden({
            [QCLASS]: 'symbol',
            key,
          });
        }
        case 'bigint': {
          return harden({
            [QCLASS]: 'bigint',
            digits: String(val),
          });
        }
        default: {
          // if we've seen this object before, serialize a backref
          if (ibidTable.has(val)) {
            // Backreference to prior occurrence
            return harden({
              [QCLASS]: 'ibid',
              index: ibidTable.get(val),
            });
          }
          ibidTable.add(val);

          switch (passStyle) {
            case 'copyRecord':
            case 'copyArray': {
              // console.log(`canPassByCopy: ${val}`);
              // Purposely in-band for readability, but creates need for
              // Hilbert hotel.
              return val;
            }
            case 'copyError': {
              // We deliberately do not share the stack, but it would
              // be useful to log the stack locally so someone who has
              // privileged access to the throwing Vat can correlate
              // the problem with the remote Vat that gets this
              // summary. If we do that, we could allocate some random
              // identifier and include it in the message, to help
              // with the correlation.
              // eslint-disable-next-line prettier/prettier
              const ceval = asTy/* :: <PassByCopyError> */(val);
              return harden({
                [QCLASS]: 'error',
                name: `${ss(ceval.name)}`,
                message: `${ss(ceval.message)}`,
              });
            }
            case 'presence':
            case 'promise': {
              // console.log(`serializeSlot: ${val}`);
              return serializeSlot(val, slots, slotMap);
            }
            default: {
              throw new TypeError(`unrecognized passStyle ${passStyle}`);
            }
          }
        }
      }
    };
  }

  // val might be a primitive, a pass by (shallow) copy object, a
  // remote reference, or other.  We treat all other as a local object
  // to be exported as a local webkey.
  function serialize(val /* : mixed */) {
    const slots = [];
    const slotMap = new Map(); // maps val (proxy or presence) to
    // index of slots[]
    return {
      argsString: JSON.stringify(val, makeReplacer(slots, slotMap)),
      slots,
    };
  }

  function makeFullRevive(slots /* : mixed[] */, cyclePolicy /* : mixed */) {
    // ibid table is shared across recursive calls to fullRevive.
    const ibidTable = makeReviverIbidTable(cyclePolicy);

    // We stay close to the algorith at
    // https://tc39.github.io/ecma262/#sec-json.parse , where
    // fullRevive(JSON.parse(str)) is like JSON.parse(str, revive))
    // for a similar reviver. But with the following differences:
    //
    // Rather than pass a reviver to JSON.parse, we first call a plain
    // (one argument) JSON.parse to get rawTree, and then post-process
    // the rawTree with fullRevive. The kind of revive function
    // handled by JSON.parse only does one step in post-order, with
    // JSON.parse doing the recursion. By contrast, fullParse does its
    // own recursion, enabling it to interpret ibids in the same
    // pre-order in which the replacer visited them, and enabling it
    // to break cycles.
    //
    // In order to break cycles, the potentially cyclic objects are
    // not frozen during the recursion. Rather, the whole graph is
    // hardened before being returned. Error objects are not
    // potentially recursive, and so may be harmlessly hardened when
    // they are produced.
    //
    // fullRevive can produce properties whose value is undefined,
    // which a JSON.parse on a reviver cannot do. If a reviver returns
    // undefined to JSON.parse, JSON.parse will delete the property
    // instead.
    //
    // fullRevive creates and returns a new graph, rather than
    // modifying the original tree in place.
    //
    // fullRevive may rely on rawTree being the result of a plain call
    // to JSON.parse. However, it *cannot* rely on it having been
    // produced by JSON.stringify on the replacer above, i.e., it
    // cannot rely on it being a valid marshalled
    // representation. Rather, fullRevive must validate that.
    return function fullRevive(rawTree /* : mixed */) /* : mixed */ {
      if (typeof rawTree !== 'object' || rawTree === null) {
        // primitives pass through
        return rawTree;
      }
      if (QCLASS in rawTree) {
        const qclass = rawTree[QCLASS];
        if (typeof qclass !== 'string') {
          throw new TypeError(`invalid qclass typeof ${typeof qclass}`);
        }
        switch (qclass) {
          // Encoding of primitives not handled by JSON
          case 'undefined': {
            return undefined;
          }
          case '-0': {
            return -0;
          }
          case 'NaN': {
            return NaN;
          }
          case 'Infinity': {
            return Infinity;
          }
          case '-Infinity': {
            return -Infinity;
          }
          case 'symbol': {
            if (typeof rawTree.key !== 'string') {
              throw new TypeError(
                `invalid symbol key typeof ${typeof rawTree.key}`,
              );
            }
            return Symbol.for(rawTree.key);
          }
          case 'bigint': {
            if (typeof rawTree.digits !== 'string') {
              throw new TypeError(
                `invalid digits typeof ${typeof rawTree.digits}`,
              );
            }
            /* eslint-disable-next-line no-undef */
            return BigInt(rawTree.digits);
          }

          case 'ibid': {
            return ibidTable.get(rawTree.index);
          }

          case 'error': {
            if (typeof rawTree.name !== 'string') {
              throw new TypeError(
                `invalid error name typeof ${typeof rawTree.name}`,
              );
            }
            if (typeof rawTree.message !== 'string') {
              throw new TypeError(
                `invalid error message typeof ${typeof rawTree.message}`,
              );
            }
            const EC = getErrorContructor(`${rawTree.name}`) || Error;
            return ibidTable.register(harden(new EC(`${ss(rawTree.message)}`)));
          }

          case 'slot': {
            return ibidTable.register(unserializeSlot(rawTree, slots));
          }

          default: {
            // TODO reverse Hilbert hotel
            throw new TypeError(`unrecognized ${QCLASS} ${qclass}`);
          }
        }
      } else if (Array.isArray(rawTree)) {
        const result = ibidTable.start([]);
        const len = rawTree.length;
        for (let i = 0; i < len; i += 1) {
          result[i] = fullRevive(rawTree[i]);
        }
        return ibidTable.finish(result);
      } else {
        const result = ibidTable.start({});
        const names /* : string[] */ = Object.getOwnPropertyNames(rawTree);
        for (const name of names) {
          result[name] = fullRevive(rawTree[name]);
        }
        return ibidTable.finish(result);
      }
    };
  }

  function unserialize(
    str /* : string */,
    slots /* : mixed[] */,
    cyclePolicy /* : string */ = 'forbidCycles',
  ) {
    const rawTree /* : mixed */ = harden(JSON.parse(str));
    const fullRevive = makeFullRevive(slots, cyclePolicy);
    return harden(fullRevive(rawTree));
  }

  return harden({
    serialize,
    unserialize,
  });
}
