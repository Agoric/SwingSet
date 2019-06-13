import { test } from 'tape-promise/tape';
import handleCommsController from '../../../src/kernel/commsSlots/commsController';
import makeState from '../../../src/kernel/commsSlots/state';

test('handleCommsController addEgress', t => {
  let fulfillToDataArgs;

  const mockSyscall = {
    fulfillToData(...args) {
      fulfillToDataArgs = args;
    },
  };

  const state = makeState();

  const resolverID = 2;
  const sender = 'user';
  const index = 4;
  const valslot = { '@qclass': 'slot', index: 0 };
  const caps = [{ type: 'import', id: 10 }];
  const helpers = {
    log: console.log,
  };

  const result = handleCommsController(
    state,
    mockSyscall,
    'addEgress',
    JSON.stringify({
      args: [sender, index, valslot],
    }),
    caps,
    resolverID,
    helpers,
  );

  t.equal(result, undefined);

  const UNDEFINED = JSON.stringify({ '@qclass': 'undefined' });

  // ensure calls to syscall are correct
  t.deepEqual(fulfillToDataArgs, [resolverID, UNDEFINED, []]);

  // ensure state updated correctly
  const youToMeSlot = {
    type: 'your-egress',
    id: index,
  };
  const meToYouSlot = state.clists.changePerspective(youToMeSlot);
  const kernelToMeSlot = state.clists.mapIncomingWireMessageToKernelSlot(
    sender,
    youToMeSlot,
  );
  const {
    meToYouSlot: actualMeToYouSlot,
  } = state.clists.mapKernelSlotToOutgoingWireMessage(caps[0], sender);
  t.deepEqual(kernelToMeSlot, caps[0]); // actual, expected
  t.deepEqual(actualMeToYouSlot, meToYouSlot);
  t.end();
});

test('handleCommsController addEgress - same twice', t => {
  let fulfillToDataArgs;

  const mockSyscall = {
    fulfillToData(...args) {
      fulfillToDataArgs = args;
    },
  };

  const state = makeState();

  const resolverID = 2;
  const sender = 'user';
  const index = 4;
  const valslot = { '@qclass': 'slot', index: 0 };
  const caps = [{ type: 'import', id: 10 }];
  const helpers = {
    log: console.log,
  };

  const result = handleCommsController(
    state,
    mockSyscall,
    'addEgress',
    JSON.stringify({
      args: [sender, index, valslot],
    }),
    caps,
    resolverID,
    helpers,
  );

  t.equal(result, undefined);

  const UNDEFINED = JSON.stringify({ '@qclass': 'undefined' });

  // ensure calls to syscall are correct
  t.deepEqual(fulfillToDataArgs, [resolverID, UNDEFINED, []]);

  // ensure state updated correctly
  const youToMeSlot = {
    type: 'your-egress',
    id: index,
  };
  const meToYouSlot = state.clists.changePerspective(youToMeSlot);
  const kernelToMeSlot = state.clists.mapIncomingWireMessageToKernelSlot(
    sender,
    youToMeSlot,
  );
  const {
    meToYouSlot: actualMeToYouSlot,
  } = state.clists.mapKernelSlotToOutgoingWireMessage(caps[0], sender);
  t.deepEqual(kernelToMeSlot, caps[0]); // actual, expected
  t.deepEqual(actualMeToYouSlot, meToYouSlot);

  // do it again, should receive an error
  t.throws(
    () =>
      handleCommsController(
        state,
        mockSyscall,
        'addEgress',
        JSON.stringify({
          args: [sender, index, valslot],
        }),
        caps,
        resolverID,
        helpers,
      ),
    'kernel-import-10 already exists in clist',
  );
  t.end();
});
