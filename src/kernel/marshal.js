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

function isPassByCopyError(val) {
  if (val instanceof Error) {
    // TODO: Need a better test than instanceof
    // TODO: Check no accessor and no extraneous properties.
    // TODO: Check that .name is own and .message inherited from a
    // known named error class.
    if (typeof val.name !== 'string' && typeof val.message !== 'string') {
      throw new TypeError(`malformed error object: ${val}`);
    }
    return true;
  }
  return false;
}

function isPassByCopyArray(val) {
  if (Array.isArray(val)) {
    if (Object.getPrototypeOf(val) !== Array.prototype) {
      throw new TypeError(`malformed array: ${val}`);
    }
    const len = val.length;
    const descs = Object.getOwnPropertyDescriptors(val);
    for (let i = 0; i < len; i += 1) {
      const desc = descs[i];
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
      throw new TypeError(`array must not have non-indexes ${val}`);
    }
    return true;
  }
  return false;
}

function isPassByCopyRecord(val) {
  if (Object.getPrototypeOf(val) !== Object.prototype) {
    return false;
  }
  const entries = Object.entries(Object.getOwnPropertyDescriptors(val));
  if (entries.length === 0) {
    // empty non-array objects are pass-by-presence, not pass-by-copy
    return false;
  }
  for (const [name, desc] of entries) {
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

export function mustPassByPresence(val) {
  // throws exception if cannot
  if (!Object.isFrozen(val)) {
    throw new Error(`cannot serialize non-frozen objects like ${val}`);
  }
  if (typeof val !== 'object') {
    throw new Error(`cannot serialize non-objects like ${val}`);
  }
  if (Array.isArray(val)) {
    throw new Error(`Arrays cannot be pass-by-presence`);
  }

  const names = Object.getOwnPropertyNames(val);
  names.forEach(name => {
    if (name === 'e') {
      // hack to allow Vows to pass-by-presence
      return;
    }
    if (typeof val[name] !== 'function') {
      throw new Error(
        `cannot serialize objects with non-methods like the .${name} in ${val}`,
      );
      // return false;
    }
  });

  const p = Object.getPrototypeOf(val);
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
export function passStyleOf(val) {
  const typestr = typeof val;
  switch (typestr) {
    case 'object': {
      if (val === null) {
        return 'null';
      }
      if (QCLASS in val) {
        // TODO Hilbert hotel
        throw new Error(`property "${QCLASS}" reserved`);
      }
      if (!Object.isFrozen(val)) {
        throw new Error(`cannot pass non-frozen objects like ${val}`);
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
      throw new Error(`bare functions like ${val} are disabled for now`);
    }
    case 'undefined':
    case 'string':
    case 'boolean':
    case 'number':
    case 'bigint': {
      return typestr;
    }
    case 'symbol': {
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

const errorConstructors = new Map([
  ['EvalError', EvalError],
  ['RangeError', RangeError],
  ['ReferenceError', ReferenceError],
  ['SyntaxError', SyntaxError],
  ['TypeError', TypeError],
  ['URIError', URIError],
]);

export function makeMarshal(serializeSlot, unserializeSlot) {
  function makeReplacer(slots, slotMap) {
    const ibidMap = new Map();
    let ibidCount = 0;

    return function replacer(_, val) {
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
          if (ibidMap.has(val)) {
            throw new Error(`ibids not yet implemented: ${val}`);
            // Backreference to prior occurrence
            return harden({
              [QCLASS]: 'ibid',
              index: ibidMap.get(val),
            });
          }
          ibidMap.set(val, ibidCount);
          ibidCount += 1;

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
              return harden({
                [QCLASS]: 'error',
                name: `${val.name}`,
                message: `${val.message}`,
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
  function serialize(val) {
    const slots = [];
    const slotMap = new Map(); // maps val (proxy or presence) to
    // index of slots[]
    return {
      argsString: JSON.stringify(val, makeReplacer(slots, slotMap)),
      slots,
    };
  }

  function makeReviver(slots) {
    const ibids = [];

    return function reviver(_, data) {
      if (Object(data) !== data) {
        // primitives pass through
        return data;
      }
      if (QCLASS in data) {
        const qclass = `${data[QCLASS]}`;
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
            return Symbol.for(data.key);
          }
          case 'bigint': {
            /* eslint-disable-next-line no-undef */
            return BigInt(data.digits);
          }

          case 'ibid': {
            throw new Error(`ibids not yet implemented: ${data}`);
            const index = Nat(data.index);
            if (index >= ibids.length) {
              throw new RangeError(`ibid out of range: ${index}`);
            }
            return ibids[index];
          }

          case 'error': {
            const EC = errorConstructors.get(`${data.name}`) || Error;
            const e = new EC(`${data.message}`);
            return harden(e);
          }

          case 'slot': {
            data = unserializeSlot(data, slots);
            // overwrite data and break to ibid registration.
            break;
          }

          default: {
            // TODO reverse Hilbert hotel
            throw new TypeError(`unrecognized ${QCLASS} ${qclass}`);
          }
        }
      } else {
        // The unserialized copy also becomes pass-by-copy, but we don't need
        // to mark it specially
        // todo: what if the unserializer is given "{}"?
      }
      // The ibids case returned early to avoid this.
      ibids.push(data);
      return harden(data);
    };
  }

  function unserialize(str, slots) {
    return JSON.parse(str, makeReviver(slots));
  }

  return harden({
    serialize,
    unserialize,
  });
}
