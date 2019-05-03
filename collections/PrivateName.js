// Copyright (C) 2019 Agoric, uner Apache license 2.0

import harden from '@agoric/harden';

import { check } from './insist';

function makePrivateName(...args) {
  const wm = new WeakMap(...args);
  return harden({
    has(key) {
      return wm.has(key);
    },
    init(key, value) {
      check(!wm.has(key))`\
key already registered: ${key}`;
      wm.set(key, value);
    },
    get(key) {
      check(wm.has(key))`\
key not found: ${key}`;
      return wm.get(key);
    },
    set(key, value) {
      check(wm.has(key))`\
key not found: ${key}`;
      wm.set(key, value);
    },
  });
}
harden(makePrivateName);

const bootPN = makePrivateName();

class PrivateName {
  constructor(...args) {
    bootPN.init(this, makePrivateName(...args));
    harden(this);
  }

  has(key) {
    return bootPN.get(this).has(key);
  }

  init(key, value) {
    bootPN.get(this).init(key, value);
  }

  get(key) {
    return bootPN.get(this).get(key);
  }

  set(key, value) {
    return bootPN.get(this).set(key, value);
  }
}
harden(PrivateName);

export { makePrivateName, PrivateName };
