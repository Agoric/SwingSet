import Nat from '@agoric/nat';

/**
 * Endowments for a Timer device that can be made available to SwingSet vats.
 *
 * This is code that runs in outer half of the device, which is in the primal
 * realm. We provide a poll function, which calls a device level function that
 * will be provided later when the device root node is created.
 */
export function buildTimer() {
  const srcPath = require.resolve('./timer-src');
  let devicePollFunction;

  function registerDevicePollFunction(pollFn) {
    devicePollFunction = pollFn;
  }

  function poll(time) {
    try {
      return Boolean(devicePollFunction(Nat(time)));
    } catch (e) {
      throw new Error(`error in devicePollFunction: ${e} ${e.message}`);
    }
  }

  // Functions made available to the host. Endowments are used by the Device
  // itself, while poll() will used by the kernel.
  return {
    srcPath,
    endowments: { registerDevicePollFunction },
    poll,
  };
}
