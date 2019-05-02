// Copyright (C) 2019 Agoric
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Maps from EMaps to encapsulated Maps. All lookups from this table
// are only queries. (Except for the one in the FlexMap constructor)
const hiddenEMap = new WeakMap();


// Abstract superclass with query-only methods.
class EMap {
  constructor(optIterable = undefined) {
    if (new.target === EMap) {
      throw new TypeError(`EMap is abstract`);
    }
    const newHidden = new Map(optIterable);
    hiddenEMap.set(this, newHidden);
  }

  snapshot() {
    // copy
    return new FixedMap(hiddenEMap.get(this));
  }
  diverge() {
    // copy
    return new FlexMap(hiddenEMap.get(this));
  }
  readOnlyView() {
    const result = new InternalReadOnlyMap();
    // Share the hidden map itself, but the readOnlyView only grants
    // the ability to query it.
    hiddenEMap.set(result, hiddenEMap.get(this));
    return result;
  }

  // Forward query protocol from Map
  
  keys() {
    return hiddenEMap.get(this).keys();
  }
  values() {
    return hiddenEMap.get(this).values();
  }
  entries() {
    return hiddenEMap.get(this).entries();
  }
  [Symbol.iterator]() {
    return hiddenEMap.get(this)[Symbol.iterator]();
  }
  forEach(callback) {
    return hiddenEMap.get(this).forEach(callback);
  }
  get(member) {
    return hiddenEMap.get(this).get(member);
  }
  has(member) {
    return hiddenEMap.get(this).has(member);
  }
  get size() {
    return hiddenEMap.get(this).size;
  }
}


// Guarantees that the map contents is stable.
// TODO: Somehow arrange for this to be pass-by-copy-ish.
class FixedMap extends EMap {
  constructor(optIterable = undefined) {
    if (new.target !== FixedMap) {
      throw new TypeError(`FixedMap is final`);
    }
    super(optIterable);
  }
  // override
  snapshot() {
    return this;
  }
  // override
  readOnlyView() {
    return this;
  }
}


// Maps from FlexMaps to encapsulated Maps, a subset of
// hiddenEMap. Lookups from this table can mutate.
const hiddenFlexMap = new WeakMap();

// Supports mutation.
class FlexMap extends EMap {
  constructor(optIterable = undefined) {
    if (new.target !== FlexMap) {
      throw new TypeError(`FlexMap is final`);
    }
    super(optIterable);
    // Be very scared of the following line, since it looks up on
    // hiddenEMap for purposes of enabling mutation. We assume it is
    // safe because the `new.target` check above ensures this
    // constructor is being called as-if directly with `new`. We say
    // "as-if" because it might be invoked by `Reflect.construct`, but
    // only in an equivalent manner.
    hiddenFlexMap.set(this, hiddenEMap.get(this));
  }

  // Like snapshot() except that this FlexMap loses ownership and
  // becomes useless.
  takeSnapshot() {
    const hiddenMap = hiddenFlexMap.get(this);
    hiddenFlexMap.delete(this);
    hiddenEMap.delete(this);
    const result = new FixedMap();
    hiddenEMap.set(result, hiddenMap);
    return result;
  }

  // Like diverge() except that this FlexMap loses ownership and
  // becomes useless.
  takeDiverge() {
    const hiddenMap = hiddenFlexMap.get(this);
    hiddenFlexMap.delete(this);
    hiddenEMap.delete(this);
    const result = new FlexMap();
    hiddenEMap.set(result, hiddenMap);
    hiddenFlexMap.set(result, hiddenMap);
    return result;
  }

  // Forward update protocol from Map

  set(k, v) {
    return hiddenFlexMap.get(this).set(k, v);
  }
  clear() {
    return hiddenFlexMap.get(this).clear();
  }
  delete(m) {
    return hiddenFlexMap.get(this).delete(m);
  }
}


// The constructor for internal use only. The rest of the class is
// available from the pseudo-constructor ReadOnlyMap.
class InternalReadOnlyMap extends EMap {
  constructor(optIterable = undefined) {
    super();
  }
  // override
  readOnlyView() {
    return this;
  }
}

// Fake constructor becomes the public identity of the class.
// Guarantee that an instance of ReadOnlyMap does not provide the
// ability to modify.
function ReadOnlyMap() {
  if (new.target !== ReadOnlyMap) {
    throw new TypeError(`ReadOnlyMap is final`);
  }
  throw new TypeError(`Use readOnlyView() to view an existing EMap`);
}
ReadOnlyMap.__proto__ = EMap;
ReadOnlyMap.prototype = InternalReadOnlyMap.prototype;
ReadOnlyMap.prototype.constructor = ReadOnlyMap;
