/*
  This vat manages our equivalent of VatTP. We are given access to some
  device nodes to let us communicate with the outside world.

  This is not the comms vat: that is a separate vat which invokes our
  sendOutbound() and registerInboundHandler(). The comms vat deals with
  managing promises, questions, answers, and three-party handoff. We deal
  with how to get a message to a specific machine (which may involve acks).

*/


import Nat from '@agoric/nat';
import harden from '@agoric/harden';

function build(E, D) {
  return harden({
    init( ) {
    },

    // these are used to set up libp2p connections

    initLibP2P(devnode, myMachineName, mySigningKey) {},
    addLibP2PConnection(theirMachineName, theirVerifyingKey) {},

    // these are to be a cosmos chain node

    initProtoIBCChain(outboxDevnode, inboundDevnode) {},

    // these are to be a solo machine talking to a cosmos chain

    initProtoIBCSolo(followerDevnode, senderDevnode) {},

    // these are used by the comms vat

    registerInboundHandler(handler) {
    },

    sendOutbound(fromMachineName, toMachineName, data) {
    },
    

  });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(syscall, state, build, helpers.vatID);
}
