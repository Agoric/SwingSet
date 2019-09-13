import harden from '@agoric/harden';
import Nat from '@agoric/nat';

export default function setup(syscall, state, helpers, endowments) {
  const highestInboundDelivered = harden(new Map());
  const highestInboundAck = harden(new Map());

  let deliverInboundMessages;
  let deliverInboundAck;

  function inboundCallback(hPeer, hMessages, hAck) {
    const peer = `${hPeer}`;
    if (!inboundCallback) {
      throw new Error(
        `mailbox.inboundCallback(${peer}) called before handler was registered`,
      );
    }
    const ack = Nat(hAck);
    let didSomething = false;

    let latestMsg = 0;
    if (highestInboundDelivered.has(peer)) {
      latestMsg = highestInboundDelivered.get(peer);
    }
    const newMessages = [];
    hMessages.forEach(m => {
      const [hNum, hMsg] = m;
      const num = Nat(hNum);
      if (num > latestMsg) {
        newMessages.push([num, `${hMsg}`]);
        latestMsg = num;
        highestInboundDelivered.set(peer, latestMsg);
      }
    });
    if (newMessages.length) {
      deliverInboundMessages(peer, harden(newMessages));
      didSomething = true;
    }
    let latestAck = 0;
    if (highestInboundAck.has(peer)) {
      latestAck = highestInboundAck.get(peer);
    }
    if (ack > latestAck) {
      highestInboundAck.set(peer, ack);
      deliverInboundAck(peer, ack);
      didSomething = true;
    }
    return didSomething;
  }
  endowments.registerInboundCallback(inboundCallback);

  // we keep no state in the device, it all lives elsewhere, as decided by
  // the host

  function makeRootDevice({ SO, getDeviceState, setDeviceState }) {
    let { inboundHandler } = getDeviceState() || {};
    // console.log(`mailbox-src build: inboundHandler is`, inboundHandler);
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

    // the Root Device Node.
    return harden({
      registerInboundHandler(handler) {
        if (inboundHandler) {
          throw new Error(`already registered`);
        }
        inboundHandler = handler;
        setDeviceState(harden({ inboundHandler }));
      },

      add(peer, msgnum, body) {
        try {
          endowments.add(`${peer}`, Nat(msgnum), `${body}`);
        } catch (e) {
          throw new Error(`error in add: ${e} ${e.message}`);
        }
      },

      remove(peer, msgnum) {
        try {
          endowments.remove(`${peer}`, Nat(msgnum));
        } catch (e) {
          throw new Error(`error in remove: ${e} ${e.message}`);
        }
      },

      ackInbound(peer, msgnum) {
        try {
          endowments.setAcknum(`${peer}`, Nat(msgnum));
        } catch (e) {
          throw new Error(`error in ackInbound: ${e} ${e.message}`);
        }
      },
    });
  }

  // return the dispatch object.
  return helpers.makeDeviceSlots(syscall, state, makeRootDevice, helpers.name);
}
