/**
 * Endowments for a Timer device that can be made available to SwingSet vats.
 *
 * buildStateMap() builds a representation of the stored state of the device
 * (which remembers persistent requests for callbacks), while
 * buildTimerEndowments() builds an object that provides facilities (evaluated
 * outside the secure compartment) that can be used by the part of the Timer
 * that runs inside the secure layer.
 */

import harden from '@agoric/harden';
import Nat from '@agoric/nat';

// a MultiMap from numbers to one or more values. We often want to return the
// lowest index or remove all the values at the lowest index, so we remember
// the smallest index. When the lowest index changes, we recalculate.
function buildMultiMapWithLowerBound() {
  let lowerBound = 0;
  let map = new Map();
  function add(key, value) {
    if (key < lowerBound) {
      lowerBound = key;
    }
    if (!map.has(key)) {
      map.set(key, [value]);
    } else {
      map.get(key).push(value);
    }
  };

  function remove(key, value) {
    if (!map.has(key)) {
      return;
    }

    const values = map.get(key);
    if (values.length === 1) {
      map.delete(key);
      resetLowerBound(key);
    } else {
      values.splice(values.indexOf(value), 1);
    }
  };

  function getLowerBound() {
    return lowerBound;
  };

  function removeValuesAt(key) {
    if (!map.has(key)) {
      return null;
    }

    const values = map.delete(key);
    resetLowerBound(key);
    return values;
  };

  // Remove and return all items indexed by numbers up to key
  function removeValuesUpTo(target) {
    if (target < lowerBound) {
      return null;
    }

    const returnValues = [];
    for (const [key, values] of map) {
      if (key > target) {
        continue;
      }
      returnValues.push(map.delete(key));
    }
    resetLowerBound(target);
    return returnValues;
  };

  function resetLowerBound(key) {
    if (key > lowerBound) {
      return;
    }

    // TODO: find new lower bound
  };

  return harden({add, remove, getLowerBound, removeValuesAt, removeValuesUpTo});
}

/**
 * build a representation of the state of the timer device. The timer has to
 * remember its schedule of upcoming events, and when they should trigger. It
 * also keeps a collection of repeater objects that allow holders to schedule
 * events at regular intervals even though individual callbacks can be
 * arbitrarily delayed.
 */
export function buildTimerStateMap() {
  const repeaters = new Map();
  // An array of schedule objects, [ { time, [callback, ... ] }, ... ]
  const deadlines = buildMultiMapWithLowerBound();
  const lastPolled;

  function buildRecurringTimeout(startTime, modulus) {
    return harden({
      schedule(currTime) {
        return currTime + modulus - ((currTime - startTime) % modulus);
      },
    })
  }

  // internal
  function setLastPolled(time) {
    lastPolled = time;
  };

  function addEvent(when, callback) {

  };

  function removeEvent(when, callback) {
    deadlines.remove(when, callback);
  }

  function addRepeater(delta) {
    const repeater = buildRecurringTimeout(delta);
    const repeaterToken = {};
    repeaters.put(repeaterToken, repeater);
    return repeaterToken;
  };

  function reschedule(now, repeater, callback) {
    const nextTime = repeater.nextTime(now);
    deadlines.add(nextTime, callback);
  }

  // We don't remove remaining events scheduled on this repeater
  function removeRepeater(timeBase, delta) {
    repeaters.delete()

  };

  /** All callbacks up to TIME should be called. */
  function getEventsTo(time) {

  }

  return harden({
    setLastPolled,
    addEvent,
    removeEvent,
    addRepeater,
    removeRepeater,
    getEventsTo,
  })
}

export function buildTimerEndowments(state) {
  const srcPath = require.resolve('./timer-src');

  // endowments made available to the inner half
  let inboundCallback;

  function registerInboundCallback(cb) {
    inboundCallback = cb;
  };

  function setTimer(when, callback) {
    state.addEvent(when, callback)
  };

  function removeTimer(when, callback) {
    state.removeEvent(when, callback)
  };

  function reschedule(now, repeater, callback) {
    state.reschedule(now, repeater, callback);
  }

  function createRepeater(now, delta) {
    return state.addRepeater(now, delta);
  };

  function poll(now) {
    const events = state.getEventsTo(now);
    let madeCall = false;
    for (event of events) {
      try {
        
        state.removeEvent(event.time, event.callback);
        madeCall |= Boolean(inboundCallback(event.callback));
      } catch (e) {
        throw new Error(`error in inboundCallback: ${e} ${e.message}`);
      }
    }
    state.setLastPolled(now);
    return madeCall;
  };

  // Functions made available to the host: these are used for inbound
  // messages and acks. The outbound direction uses the mailboxState object.
  return {
    srcPath,
    endowments: { registerInboundCallback, setTimer, createRepeater },
    poll,
  };
}
