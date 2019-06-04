// Copyright (C) 2019 Agoric, uner Apache license 2.0
// @flow

import harden from '@agoric/harden';

import { insist } from './insist';

/* ::
type MapKey = {} | $ReadOnlyArray<mixed>;
interface IPrivateName<K: MapKey, V>{
  has(key: K): boolean;
  init(key: K, value: V): void;
  get(key: K): V;
  set(key: K, value: V): void;
}

type Boot = IPrivateName<PrivateName<any, any>, IPrivateName<any, any>>;
*/

function makePrivateName /* :: <K: MapKey, V> */(
  ...args /* : [Object, any][] */
) /* : IPrivateName<K, V> */ {
  // eslint-disable-next-line prettier/prettier
  const wm = new WeakMap/* :: <K, V> */(...args);
  return harden({
    has(key /* : K */) {
      return wm.has(key);
    },
    init(key /* : K */, value /* : V */) {
      insist(!wm.has(key))`\
key already registered: ${key}`;
      wm.set(key, value);
    },
    get(key /* : K */) {
      insist(wm.has(key))`\
key not found: ${key}`;
      const value = wm.get(key);
      if (typeof value === 'undefined') {
        throw new Error('flow does not grok insist');
      }
      return value;
    },
    set(key /* : K */, value /* : V */) {
      insist(wm.has(key))`\
key not found: ${key}`;
      wm.set(key, value);
    },
  });
}
harden(makePrivateName);

const bootPN /* : Boot */ = makePrivateName();

class PrivateName /* :: <K: MapKey, V> implements IPrivateName<K, V> */ {
  constructor(...args /* : [Object, any][] */) {
    // eslint-disable-next-line prettier/prettier
    bootPN.init(this, makePrivateName /* :: <K, V> */(...args));
    harden(this);
  }

  has(key /* : K */) {
    return bootPN.get(this).has(key);
  }

  init(key /* : K */, value /* : V */) {
    bootPN.get(this).init(key, value);
  }

  get(key /* : K */) /* : V */ {
    return bootPN.get(this).get(key);
  }

  set(key /* : K */, value /* : V */) {
    return bootPN.get(this).set(key, value);
  }
}
harden(PrivateName);

export { makePrivateName, PrivateName };
