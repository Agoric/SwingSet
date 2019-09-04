/**
 * Setup the build() function which will be called to create the device
 * attenuator (AKA device slots) which can be handed to vats to use the Timer.
 *
 * The first step is to register a callBack
 */

import harden from '@agoric/harden';
import Nat from '@agoric/nat';

export default function setup(syscall, state, helpers, endowments) {

  let deliverInboundMessages;
  let deliverInboundAck;

  function inboundCallback(hPeer, hMessages, hAck) {
  }
  endowments.registerInboundCallback(inboundCallback);

  // we keep no state in the device, it all lives elsewhere, as decided by
  // the host

  function makeRootDevice({ SO, getDeviceState, setDeviceState }) {
    let { inboundHandler } = getDeviceState() || {};
    deliverInboundMessages = (peer, newMessages) => {
      if (!inboundHandler) {
        throw new Error(`deliverInboundMessages before registerInboundHandler`);
      }
      try {
        SO(inboundHandler).deliverInboundMessages(peer, newMessages);
      } catch (e) {
        console.log(`error during deliverInboundMessages: ${e} ${e.message}`);
      }
    };

    deliverInboundAck = (peer, ack) => {
      if (!inboundHandler) {
        throw new Error(`deliverInboundAck before registerInboundHandler`);
      }
      try {
        SO(inboundHandler).deliverInboundAck(peer, ack);
      } catch (e) {
        console.log(`error during deliverInboundAck: ${e} ${e.message}`);
      }
    };

    // The Root Device Node
    return harden({
      registerInboundHandler(handler) {
        if (inboundHandler) {
          throw new Error(`already registered`);
        }
        inboundHandler = handler;
        setDeviceState(harden({ inboundHandler }));
      },

      setWakeUp(delta, callback) {
        endowments.setTimer(delta, callback);
      }
      add(peer, msgnum, body) {
        try {
          endowments.add(`${peer}`, Nat(msgnum), `${body}`);
        } catch (e) {
          throw new Error(`error in add: ${e} ${e.message}`);
        }
      },
    });
  }

  // return dispatch object
  return helpers.makeDeviceSlots(syscall, state, makeRootDevice, helpers.name);
}
