// Copyright (C) 2019 Agoric, uner Apache license 2.0


import harden from '@agoric/harden';


export const makePrivateName = harden(function makePrivateName(...args) {
  const wm = new WeakMap(...args);
  return harden({
    has(key) {
      return wm.has(key);
    },
    init(key, value) {
      if (wm.has(key)) { throw new TypeError('key already registered'); }
      wm.set(key, value);
    },
    get(key) {
      if (!(wm.has(key))) { throw new TypeError('key not found'); }
      return wm.get(key);
    },
    set(key, value) {
      if (!(wm.has(key))) { throw new TypeError('key not found'); }
      wm.set(key, value);
    }
  });
});

const bootPN = makePrivateName();

export const PrivateName = harden(class PrivateName {
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
});
