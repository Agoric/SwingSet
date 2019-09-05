/**
 * Setup the build() function which will be called to create the root device
 * which can be handed to vats that should be allowed to use the Timer.
 */

import harden from '@agoric/harden';
import Nat from '@agoric/nat';

export default function setup(syscall, state, helpers, endowments) {
  function makeRootDevice({ SO, getDeviceState, setDeviceState }) {
    function assertCallbackHasWake(callback) {
      if (!('wake' in callback)) {
        throw new TypeError(
          `callback.wake() does not exist, has ${Object.getOwnPropertyNames(
            callback,
          )}`,
        );
      }
      if (!(callback['wake'] instanceof Function)) {
        throw new TypeError(
          `callback[wake] is not a function, typeof is ${typeof callback[
            'wake'
            ]}, callback has ${Object.getOwnPropertyNames(callback['wake'])}`,
        );
      }
    }

    // The Root Device Node
    return harden({
      setWakeup(when, callback) {
        assertCallbackHasWake(callback);
        endowments.setTimer(Nat(when), callback);
      },
      removeWakeup(when, callback) {
        assertCallbackHasWake(callback);
        endowments.removeTimer(Nat(when), callback);
      },
      createRepeater(when, interval) {
        return endowments.createRepeater(Nat(when), Nat(interval));
      }
    });
  }

  // return dispatch object
  return helpers.makeDeviceSlots(syscall, state, makeRootDevice, helpers.name);
}
