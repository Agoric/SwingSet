/*global module*/

function makeBootPrivateName(...args) {
  const wm = new WeakMap(...args);
  return Object.freeze({
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
}

const bootWM = makeBootPrivateName();

class PrivateName {
  constructor(...args) {
    bootWM.init(this, makeBootPrivateName(...args));
    Object.freeze(this);
  }
  has(key) {
    return bootWM.get(this).has(key);
  }
  init(key, value) {
    bootWM.get(this).init(key, value);
  }
  get(key) {
    return bootWM.get(this).get(key);
  }
  set(key, value) {
    return bootWM.get(this).set(key, value);
  }
}
Object.freeze(PrivateName);
Object.freeze(PrivateName.prototype);
Object.freeze(PrivateName.prototype.has);
Object.freeze(PrivateName.prototype.init);
Object.freeze(PrivateName.prototype.get);
Object.freeze(PrivateName.prototype.set);

module.exports = PrivateName;
