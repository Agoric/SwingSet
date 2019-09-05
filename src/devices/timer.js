/**
 * Endowments for a Timer device that can be made available to SwingSet vats.
 */

import harden from '@agoric/harden';
import { insist } from '../kernel/insist';

/**
 * A MultiMap from numbers to one or more values. In addition to add() and
 * remove(), it supports removing (and returning)) all the key-value pairs with
 * keys less than or equal to some value with removeValuesUpTo().
 */
// visible for testing
export function buildMultiMap() {
  let numberToList = new Map();
  function add(key, value) {
    if (!numberToList.has(key)) {
      numberToList.set(key, [value]);
    } else {
      numberToList.get(key).push(value);
    }
  };

  function remove(key, value) {
    if (!numberToList.has(key)) {
      return null;
    }

    const values = numberToList.get(key);
    if (values.length === 1 && values[0] === value) {
      numberToList.delete(key);
    } else {
      values.splice(values.indexOf(value), 1);
    }
    return [{ key:value }];
  };

  // Remove and return all pairs indexed by numbers up to target
  function removeValuesUpTo(target) {
    const returnValues = [];
    for (const [key, values] of numberToList) {
      if (key > target) {
        continue;
      }
      returnValues.push(numberToList.delete(key));
    }
    return returnValues;
  };

  return harden({add, remove, removeValuesUpTo});
}

/**
 * build a representation of the state of the timer device. The timer has to
 * remember its schedule of upcoming events, and when they should trigger. It
 * also keeps a collection of repeater objects that allow holders to schedule
 * events at regular intervals even though individual callbacks can be
 * arbitrarily delayed.
 */
export function buildTimerStateMap() {
  // The latest time poll() was called. This might be a block height or it might
  // be a time from Date.now(). The current time is not reflected back to the
  // user.
  const lastPolled;
  // A MultiMap from times to schedule objects, with repeaters when present
  // { time: [{callback}, {callback, repeater}, ... ], ... }
  const deadlines = buildMultiMap();

  // An object whose presence can be shared with Vat code to enable reliable
  // repeating schedules. There's no guarantee that the callback will happen at
  // the precise time, but the repeated calls will reliably be triggered at
  // consistent intervals.
  function buildRecurringTimeout(startTime, interval) {
    const r = harden({
      schedule(callback) {
        const nextTime =
          lastPolled + interval - ((lastPolled - startTime) % interval);
        deadlines.add(nextTime, {callback, r});
      },
    });
    return r;
  }

  // internal
  function setLastPolled(time) {
    insist(
      time > lastPolled,
      `Time is monotonic. ${time} must be greater than ${lastPolled}`);
    lastPolled = time;
  };

  function addEvent(when, callback) {
    deadlines.add(when, {callback});
  };

  function removeEvent(when, callback) {
    deadlines.remove(when, callback);
  }

  function addRepeater(interval) {
    return buildRecurringTimeout(interval);
  };

  /** All callbacks up to TIME should be called. */
  function removeEventsTo(time) {
    return deadlines.removeValuesUpTo(time);
  }

  return harden({
    setLastPolled,
    addEvent,
    removeEvent,
    addRepeater,
    removeRepeater,
    removeEventsTo,
  })
}

export function buildTimerEndowments(state) {
  const srcPath = require.resolve('./timer-src');

  function setTimer(when, callback) {
    state.addEvent(when, callback)
  };

  function removeTimer(when, callback) {
    state.removeEvent(when, callback)
  };

  function createRepeater(when, interval) {
    return state.addRepeater(when, interval);
  };

  // Now might be Date.now(), or it might be a block height.
  function poll(SO, now) {
    const events = state.removeEventsTo(now);
    for (event of events) {
      try {
        if (event.repeater) {
          SO(event.callback).wake(event.repeater);
        } else {
          SO(event.callback).wake();
        }
      } catch (e) {
        throw new Error(`error in calling event.wake(): ${e} ${e.message}`);
      }
    }
    state.setLastPolled(now);
    return events.length > 0;
  };

  // Functions made available to the host. Endowments are used by the Device
  // itself, while poll() will used by the kernel.
  return {
    srcPath,
    endowments: { setTimer, removeTimer, createRepeater },
    poll,
  };
}
