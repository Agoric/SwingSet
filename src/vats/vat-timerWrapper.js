import harden from '@agoric/harden';
import nat from '@agoric/nat';
import { insist } from '../insist';

function build(E, D) {
  let timerNode; // Timer device

  function registerTimerDevice(TimerDevnode) {
    timerNode = TimerDevnode;
  }

  async function createTimerHandler() {
    return harden({
      setWakeup(delaySecs, handler) {
        return D(timerNode).setWakeup(delaySecs, handler);
      },
      removeWakeup(handler) {
        return D(timerNode).removeWakeup(handler);
      },
      createRepeater(delaySecs, interval) {
        insist(
          nat(delaySecs) && nat(interval),
          `createRepeater takes two numbers as arguments. ${delaySecs}, ${interval}`,
        );

        const r = D(timerNode).createRepeater(delaySecs, interval);

        const vatRepeater = harden({
          schedule(handler) {
            return D(r).schedule(handler);
          },
          disable() {
            return D(r).disable();
          },
        });
        return vatRepeater;
      },
    });
  }

  return harden({ registerTimerDevice, createTimerHandler });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(syscall, state, build, helpers.vatID);
}
