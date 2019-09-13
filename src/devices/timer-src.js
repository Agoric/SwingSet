/**
 * setup(...) calls makeDeviceSlots(..., makeRootDevice, ...), which calls
 * deviceSlots' build() function to create the root device. Selected vats that
 * need to schedule events can be given access to the device.
 *
 * This code runs in the inner half of the device vat. It handles kernel objects
 * in serialized format, and uses SO() to send messages to them.
 */

import harden from '@agoric/harden';
import Nat from '@agoric/nat';
import { insist } from '../insist';

/**
 * A MultiMap from times to one or more values. In addition to add() and
 * remove(), removeEventsThrough() supports removing (and returning)) all the
 * key-value pairs with keys (deadlines) less than or equal to some value. The
 * values are either a callback (stored as { cb }) or a callback and a repeater
 * (stored as { cb, r }).
 *
 * To support quiescent solo vats (which normally only run if there's an
 * incoming event), we'd want to tell the host loop when we should next be
 * scheduled. It might be cheaper to find the smallest index in a sorted map.
 */
function buildTimerMap() {
  const numberToList = new Map();
  function add(time, cb, r = undefined) {
    const cbRecord = r ? { cb, r } : { cb };
    if (!numberToList.has(time)) {
      numberToList.set(time, [cbRecord]);
    } else {
      numberToList.get(time).push(cbRecord);
    }
  }

  // We don't expect this to be called often, so we don't optimize for it.
  // There's some question as to whether it's important to invoke the callbacks
  // in the order of their deadlines. If so, we should probably ensure that the
  // recorded deadlines don't have finer granularity than the turns.
  function remove(cb) {
    for (const [time, cbs] of numberToList) {
      if (cbs.length === 1) {
        if (cbs[0].cb === cb) {
          numberToList.delete(time);
          return cb;
        }
      } else {
        cbs.splice(cbs.indexOf(cb), 1);
        return cb;
      }
    }
    return null;
  }

  // Remove and return all pairs indexed by numbers up to target
  function removeEventsThrough(target) {
    const returnValues = new Map();
    for (const [time, cbs] of numberToList) {
      if (time <= target) {
        returnValues.set(time, cbs);
        numberToList.delete(time);
      }
    }
    return returnValues;
  }
  return harden({ add, remove, removeEventsThrough });
}

// curryPollFn provided at top level so it can be exported and tested.
function curryPollFn(SO, deadlines) {
  // poll() is intended to be called by the host loop. Now might be Date.now(),
  // or it might be a block height.
  function poll(now) {
    const timeAndEvents = deadlines.removeEventsThrough(now);
    let wokeAnything = false;
    timeAndEvents.forEach(events => {
      for (const event of events) {
        try {
          if (event.r) {
            SO(event.cb).wake(event.r);
          } else {
            SO(event.cb).wake();
          }
          wokeAnything = true;
        } catch (e) {
          if (event.r) {
            event.r.disable();
          }
          // continue to wake other events.
        }
      }
    });
    return wokeAnything;
  }

  return poll;
}

// bind the repeater builder over deadlines so it can be exported and tested.
function curryRepeaterBuilder(deadlines, getLastPolled) {
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
        const lastPolled = getLastPolled();
        // nextTime is the smallest startTime + N * interval after lastPolled
        const nextTime =
          lastPolled + interval - ((lastPolled - startTime) % interval);
        deadlines.add(nextTime, callback, r);
      },
      disable() {
        disabled = true;
      },
    });
    return r;
  }

  return buildRecurringTimeout;
}

function setup(syscall, state, helpers, endowments) {
  function makeRootDevice({ SO, getDeviceState, setDeviceState }) {
    const initialDeviceState = getDeviceState();

    // A MultiMap from times to schedule objects, with repeaters when present
    // { time: [{callback}, {callback, repeater}, ... ], ... }
    const deadlines = initialDeviceState
      ? initialDeviceState.deadlines
      : buildTimerMap();

    // The latest time poll() was called. This might be a block height or it
    // might be a time from Date.now(). The current time is not reflected back
    // to the user.
    let lastPolled = initialDeviceState ? initialDeviceState.lastPolled : 0;

    function updateState(time) {
      insist(
        time > lastPolled,
        `Time is monotonic. ${time} must be greater than ${lastPolled}`,
      );
      lastPolled = time;
      setDeviceState(harden({ lastPolled, deadlines }));
    }

    const innerPoll = curryPollFn(SO, deadlines);
    const poll = t => {
      updateState(t);
      return innerPoll(t);
    };
    endowments.registerDevicePollFunction(poll);

    const buildRepeater = curryRepeaterBuilder(deadlines, () => lastPolled);

    // The Root Device Node
    return harden({
      setWakeup(delaySecs, callback) {
        deadlines.add(lastPolled + Nat(delaySecs), callback);
        setDeviceState(harden({ lastPolled, deadlines }));
      },
      removeWakeup(callback) {
        deadlines.remove(callback);
        setDeviceState(harden({ lastPolled, deadlines }));
      },
      createRepeater(delaySecs, interval) {
        return buildRepeater(lastPolled + Nat(delaySecs), Nat(interval));
      },
    });
  }

  // return dispatch object
  return helpers.makeDeviceSlots(syscall, state, makeRootDevice, helpers.name);
}

export { buildTimerMap, curryPollFn, curryRepeaterBuilder, setup };
