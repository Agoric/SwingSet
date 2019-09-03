/**
 * Endowments for a Timer device that can be made selectively available to vats
 * in SwingSet.
 *
 * buildStateMap() builds a representation of the stored state of the device
 * (which remembers persistent requests for callbacks), while
 * buildTimerEndowments() builds an object that provides facilities (evaluated
 * outside the secure compartment) that can be used by the part of the Timer
 * that runs inside the secure layer.
 */

import harden from '@agoric/harden';
import Nat from '@agoric/nat';

export function buildStateMap() {
  const state = harden(new Map());

  function add() {
  }

  function exportToData() {
    const data = {};
    state.forEach((inout, peer) => {
      const messages = [];
      inout.outbox.forEach((body, msgnum) => {
        messages.push([msgnum, body]);
      });
      messages.sort((a, b) => a[0] - b[0]);
      data[peer] = { outbox: messages, inboundAck: inout.inboundAck };
    });
    return harden(data);
  }

  function populateFromData(data) {
    if (state.size) {
      throw new Error(`cannot populateFromData: outbox is not empty`);
    }
    for (const peer of Object.getOwnPropertyNames(data)) {
      const inout = getOrCreatePeer(peer);
      const d = data[peer];
      d.outbox.forEach(m => {
        inout.outbox.set(Nat(m[0]), m[1]);
      });
      inout.inboundAck = d.inboundAck;
    }
  }

  return harden({
    add,
    exportToData,
    populateFromData,
  });
}

export function buildTimerEndowments(state) {
  const srcPath = require.resolve('./timer-src');

  // endowments made available to the inner half
  let inboundCallback;

  function registerInboundCallback(cb) {
    inboundCallback = cb;
  }

  function add(peer, msgnum, body) {
    state.add(`${peer}`, Nat(msgnum), `${body}`);
  }

  function deliverInbound(peer, messages, ack) {
  }

  // Functions made available to the host: these are used for inbound
  // messages and acks. The outbound direction uses the mailboxState object.
  return {
    srcPath,
    endowments: { registerInboundCallback, add },
    deliverInbound,
  };
}
