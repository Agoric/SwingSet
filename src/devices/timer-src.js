/**
 * Setup the build() function which will be called to create the root device
 * which can be handed to vats that should be allowed to use the Timer.
 */

import harden from '@agoric/harden';
import Nat from '@agoric/nat';
import { insist } from '../kernel/insist';

let assertCallbackHasWake;

/**
 * A MultiMap from times to one or more values. In addition to add() and
 * remove(), removeValuesUpTo() supports removing (and returning)) all the
 * key-value pairs with keys (deadlines) less than or equal to some value.
 *
 * To support quiescent solo vats (which normally only run if there's an
 * incoming event), we'd want to tell the host loop when we should next be
 * scheduled. It might be cheaper to find the smallest index in a sorted map.
 */
function buildTimerMap() {
  const numberToList = new Map();
  function add(key, value) {
    if (!numberToList.has(key)) {
      numberToList.set(key, [value]);
    } else {
      numberToList.get(key).push(value);
    }
  }

  function remove(key, value) {
    if (!numberToList.has(key)) {
      return null;
    }

    const values = numberToList.get(key);
    if (values.length === 1) {
      if (values[0] === value) {
        numberToList.delete(key);
      } else {
        return null;
      }
    } else {
      values.splice(values.indexOf(value), 1);
    }
    return new Map().set(key, value);
  }

  // Remove and return all pairs indexed by numbers up to target
  function removeValuesUpTo(target) {
    const returnValues = new Map();
    for (const [key, values] of numberToList) {
      if (key <= target) {
        returnValues.set(key, values);
        numberToList.delete(key);
      }
    }
    return returnValues;
  }

  function minimumKey() {
    let min = Number.MAX_SAFE_INTEGER;
    numberToList.foreach((key, _ignore) => (min = Math.min(min, key)));
    return min;
  }

  return harden({ add, remove, removeValuesUpTo });
}

function setup(syscall, state, helpers, endowments) {
  // The latest time poll() was called. This might be a block height or it might
  // be a time from Date.now(). The current time is not reflected back to the
  // user.
  let lastPolled = null;

  // A MultiMap from times to schedule objects, with repeaters when present
  // { time: [{callback}, {callback, repeater}, ... ], ... }
  const deadlines = buildTimerMap();

  // An object whose presence can be shared with Vat code to enable reliable
  // repeating schedules. There's no guarantee that the callback will happen at
  // the precise time, but the repeated calls will reliably be triggered at
  // consistent intervals.
  //
  // The timer can also create Repeater objects that allow holders to schedule
  // events at regular intervals even though individual callbacks can be
  // arbitrarily delayed. The Repeaters have access to their startTime and
  // interval as well as the latest time we were polled. This allows them to
  // reschedule.
  function buildRecurringTimeout(startTime, interval) {
    let disabled = false;
    const r = harden({
      schedule(callback) {
        if (disabled) {
          return;
        }
        // nextTime is the smallest startTime + N * interval after lastPolled
        const nextTime =
          lastPolled + interval - ((lastPolled - startTime) % interval);
        deadlines.add(nextTime, { callback, r });
      },
      disable() {
        disabled = true;
      },
    });
    return r;
  }

  const inboundStateAccessor = {
    setLastPolled(time) {
      insist(
        time > lastPolled,
        `Time is monotonic. ${time} must be greater than ${lastPolled}`,
      );
      lastPolled = time;
    },

    /** All callbacks up to TIME should be called. */
    removeEventsTo(time) {
      return deadlines.removeValuesUpTo(time);
    },
  };
  endowments.registerInboundStateAccess(inboundStateAccessor);

  function initializeState(getDeviceState, setDeviceState) {
    if (!getDeviceState()) {
      setDeviceState({ lastPolled, deadlines });
    }
  }

  function makeRootDevice({ getDeviceState, setDeviceState }) {
    // The Root Device Node
    return harden({
      setWakeup(when, callback) {
        assertCallbackHasWake(callback);
        initializeState(getDeviceState, setDeviceState);
        deadlines.add(Nat(when), { callback });
        setDeviceState({ lastPolled, deadlines });
      },
      removeWakeup(when, callback) {
        assertCallbackHasWake(callback);
        initializeState(getDeviceState, setDeviceState);
        deadlines.remove(Nat(when), callback);
        setDeviceState({ lastPolled, deadlines });
      },
      createRepeater(when, interval) {
        initializeState(getDeviceState, setDeviceState);
        return buildRecurringTimeout(Nat(when), Nat(interval));
      },
    });
  }

  // return dispatch object
  return helpers.makeDeviceSlots(syscall, state, makeRootDevice, helpers.name);
}

assertCallbackHasWake = callback => {
  if (!('wake' in callback)) {
    throw new TypeError(
      `callback.wake() does not exist, has ${Object.getOwnPropertyNames(
        callback,
      )}`,
    );
  }
  if (!(callback.wake instanceof Function)) {
    throw new TypeError(
      `callback[wake] is not a function, typeof is ${typeof callback.wake}, callback has ${Object.getOwnPropertyNames(
        callback.wake,
      )}`,
    );
  }
};

export { setup, buildTimerMap };
