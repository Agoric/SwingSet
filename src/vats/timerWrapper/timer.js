import harden from '@agoric/harden';

function build(E, D) {
  let timerNode; // Timer device

  const timerHandler = harden({
    registerTimerDevice(TimerDevnode) {
      timerNode = TimerDevnode;
    },

    setWakeup(delaySecs, handler) {
      return D(timerNode).setWakeup(delaySecs, handler);
    },
    removeWakeup(handler) {
      return D(timerNode).removeWakeup(handler);
    },
    createRepeater(delaySecs, interval) {
      return D(timerNode).createRepeater(delaySecs, interval);
    },
  });

  return timerHandler;
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(syscall, state, build, helpers.vatID);
}
