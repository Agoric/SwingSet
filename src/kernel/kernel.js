import harden from '@agoric/harden';
import Nat from '@agoric/nat';
import { QCLASS, makeMarshal } from '@agoric/marshal';

import { makeLiveSlots } from './liveSlots';
import { makeDeviceSlots } from './deviceSlots';
import { makeCommsSlots } from './commsSlots/index';
import makePromise from './makePromise';
import makeVatManager from './vatManager';
import makeDeviceManager from './deviceManager';
import makeKernelKeeper from './state/kernelKeeper';
import makeVatKeeper from './state/vatKeeper';
import makeDeviceKeeper from './state/deviceKeeper';
import makeExternalKVStore from './externalKVStore';

export default function buildKernel(kernelEndowments, external) {
  const { setImmediate } = kernelEndowments;

  const kernelKVStore = makeExternalKVStore('kernel', external);

  const kernelKeeper = makeKernelKeeper(
    kernelKVStore,
    'kernel',
    makeExternalKVStore,
    external,
  );

  kernelKeeper.createStartingKernelState();

  const ephemeral = {
    vats: new Map(),
    devices: new Map(),
  };

  const enableKDebug = false;
  function kdebug(...args) {
    if (enableKDebug) {
      console.log(...args);
    }
  }

  let running = false;

  // runQueue entries are {type, vatID, more..}. 'more' depends on type:
  // * deliver: target, msg
  // * notifyFulfillToData/notifyFulfillToPresence/notifyReject:
  //   kernelPromiseID

  // in the kernel table, promises and resolvers are both indexed by the same
  // value. kernelPromises[promiseID] = { decider, subscribers }

  /*
  function chaseRedirections(promiseID) {
    let targetID = Nat(promiseID);
    while (true) {
      const p = kernelKeeper.getKernelPromise(targetID);
      if (p.state === 'redirected') {
        targetID = Nat(p.redirectedTo);
        continue;
      }
      return targetID;
    }
  }
  */

  function createPromiseWithDecider(deciderVatID) {
    // deciderVatID can be undefined if the promise is "owned" by the kernel
    // (pipelining)

    // kernel promise is replaced if altered, so we can safely harden
    const kernelPromiseID = kernelKeeper.addKernelPromise(deciderVatID);
    return kernelPromiseID;
  }

  function makeError(s) {
    // TODO: create a @qclass=error, once we define those
    // or maybe replicate whatever happens with {}.foo()
    // or 3.foo() etc
    return s;
  }

  function send(target, msg) {
    if (target.type === 'export') {
      kernelKeeper.addToRunQueue({
        type: 'deliver',
        vatID: target.vatID,
        target,
        msg,
      });
    } else if (target.type === 'promise') {
      const kp = kernelKeeper.getKernelPromise(target.id);
      if (kp.state === 'unresolved') {
        kp.queue.push(msg);
        // we need to save what was pushed to queue
        kernelKeeper.updateKernelPromise(target.id, kp);
      } else if (kp.state === 'fulfilledToData') {
        const s = `data is not callable, has no method ${msg.method}`;
        // eslint-disable-next-line no-use-before-define
        reject(msg.kernelPromiseID, makeError(s), []);
      } else if (kp.state === 'fulfilledToPresence') {
        send(kp.fulfillSlot, msg);
      } else if (kp.state === 'rejected') {
        // TODO would it be simpler to redirect msg.kernelPromiseID to kp?
        // eslint-disable-next-line no-use-before-define
        reject(msg.kernelPromiseID, kp.rejectData, kp.rejectSlots);
      } else if (kp.state === 'redirected') {
        // TODO: shorten as we go
        send({ type: 'promise', id: kp.redirectedTo });
      } else {
        throw new Error(`unknown kernelPromise state '${kp.state}'`);
      }
    } else {
      throw Error(`unable to send() to slot.type ${target.slot}`);
    }
  }

  function notifySubscribersAndQueue(id, p, type) {
    const pslot = { type: 'promise', id };
    for (const subscriberVatID of kernelKeeper.getSubscribers(id)) {
      kernelKeeper.addToRunQueue({
        type,
        vatID: subscriberVatID,
        kernelPromiseID: id,
      });
    }
    // re-deliver msg to the now-settled promise, which will forward or
    // reject depending on the new state of the promise
    for (const msg of p.queue) {
      send(pslot, msg);
      // now that we know where the messages can be sent, we know to whom we
      // must subscribe to satisfy their resolvers. This wasn't working
      // correctly, so instead liveSlots just assumes that it must tell the
      // kernel about the resolution for resolver it hears about
      /*
      runQueue.push({
        type: 'subscribe',
        vatID: XXX,
        kernelPromiseID: msg.kernelResolverID,
      }); */
    }
  }

  function assertResolved(id, promiseState) {
    if (promiseState !== 'unresolved') {
      throw new Error(
        `kernelPromise[${id}] is '${promiseState}', not 'unresolved'`,
      );
    }
  }

  function deletePromiseData(kernelPromiseID) {
    kernelKeeper.deleteKernelPromiseData(kernelPromiseID);
  }

  function fulfillToPresence(id, targetSlot) {
    const p = kernelKeeper.getKernelPromise(id);
    assertResolved(id, p.state);
    if (targetSlot.type !== 'export') {
      throw new Error(
        `fulfillToPresence() must fulfill to export, not ${targetSlot.type}`,
      );
    }

    p.state = 'fulfilledToPresence';
    p.fulfillSlot = targetSlot;
    kernelKeeper.updateKernelPromise(id, p);
    notifySubscribersAndQueue(id, p, 'notifyFulfillToPresence');
    deletePromiseData(id);
  }

  function fulfillToData(id, data, slots) {
    kdebug(`fulfillToData[${id}] -> ${data} ${JSON.stringify(slots)}`);
    const p = kernelKeeper.getKernelPromise(id);
    assertResolved(id, p.state);

    p.state = 'fulfilledToData';
    p.fulfillData = data;
    p.fulfillSlots = slots;
    kernelKeeper.updateKernelPromise(id, p);
    notifySubscribersAndQueue(id, p, 'notifyFulfillToData');
    deletePromiseData(id);
  }

  function reject(id, val, valSlots) {
    const p = kernelKeeper.getKernelPromise(id);
    assertResolved(id, p.state);
    p.state = 'rejected';
    p.rejectData = val;
    p.rejectSlots = valSlots;
    kernelKeeper.updateKernelPromise(id, p);
    notifySubscribersAndQueue(id, p, 'notifyReject');
    deletePromiseData(id);
  }

  function invoke(device, method, data, slots) {
    const dev = ephemeral.devices.get(device.deviceName);
    if (!dev) {
      throw new Error(`unknown deviceRef ${JSON.stringify(device)}`);
    }
    return dev.manager.invoke(device, method, data, slots);
  }

  async function process(f, then, logerr) {
    // the delivery might cause some number of (native) Promises to be
    // created and resolved, so we use the IO queue to detect when the
    // Promise queue is empty. The IO queue (setImmediate and setTimeout) is
    // lower-priority than the Promise queue on browsers and Node 11, but on
    // Node 10 it is higher. So this trick requires Node 11.
    // https://jsblog.insiderattack.net/new-changes-to-timers-and-microtasks-from-node-v11-0-0-and-above-68d112743eb3

    const { p: queueEmptyP, res } = makePromise();
    setImmediate(() => res());

    // protect f() with promise/then
    Promise.resolve()
      .then(f)
      .then(undefined, logerr);
    await queueEmptyP;
    then();
  }

  const syscallManager = {
    kdebug,
    createPromiseWithDecider,
    send,
    fulfillToData,
    fulfillToPresence,
    reject,
    process,
    invoke,
    kernelKeeper,
  };

  function addVat(vatID, setup) {
    if (kernelKeeper.hasVat(vatID)) {
      throw new Error(`already have a vat named '${vatID}'`);
    }
    function abbreviateReviver(_, arg) {
      if (typeof arg === 'string' && arg.length >= 40) {
        // truncate long strings
        return `${arg.slice(0, 15)}...${arg.slice(arg.length - 15)}`;
      }
      return arg;
    }
    const helpers = harden({
      vatID,
      makeLiveSlots,
      makeCommsSlots,
      log(...args) {
        const rendered = args.map(arg =>
          typeof arg === 'string'
            ? arg
            : JSON.stringify(arg, abbreviateReviver),
        );
        kernelKeeper.log(rendered.join(''));
      },
    });

    const vatPath = `kernel.vats.${vatID}`;
    const vatKVStore = makeExternalKVStore(vatPath, external);
    const vatKeeper = makeVatKeeper(
      vatKVStore,
      vatPath,
      makeExternalKVStore,
      external,
    );

    vatKeeper.createStartingVatState();

    // the vatManager invokes setup() to build the userspace image
    const manager = makeVatManager(
      vatID,
      syscallManager,
      setup,
      helpers,
      vatKVStore,
    );
    ephemeral.vats.set(
      vatID,
      harden({
        id: vatID,
        manager,
      }),
    );
  }

  function addDevice(name, setup, endowments) {
    if (kernelKeeper.hasDevice(name)) {
      throw new Error(`already have a device named '${name}'`);
    }
    const helpers = harden({
      name,
      makeDeviceSlots,
      log(str) {
        kernelKeeper.log(`${str}`);
      },
    });

    const devicePath = `kernel.devices.${name}`;
    const deviceKVStore = makeExternalKVStore(devicePath, external);
    const deviceKeeper = makeDeviceKeeper(
      deviceKVStore,
      devicePath,
      makeExternalKVStore,
      external,
    );

    deviceKeeper.createStartingDeviceState();

    const manager = makeDeviceManager(
      name,
      syscallManager,
      setup,
      helpers,
      endowments,
      kernelKeeper,
      deviceKVStore,
    );
    // the vat record is not hardened: it holds mutable next-ID values
    ephemeral.devices.set(name, {
      id: name,
      manager,
    });
  }

  function addImport(forVatID, what) {
    const vat = ephemeral.vats.get(forVatID);
    return vat.manager.mapKernelSlotToVatSlot(what);
  }

  function mapQueueSlotToKernelRealm(s) {
    if (s.type === 'export') {
      return harden({
        type: `${s.type}`,
        vatID: `${s.vatID}`,
        id: Nat(s.id),
      });
    }
    if (s.type === 'device') {
      return harden({
        type: `${s.type}`,
        deviceName: `${s.deviceName}`,
        id: Nat(s.id),
      });
    }
    throw Error(`unrecognized type '${s.type}'`);
  }

  function queueToExport(vatID, facetID, method, argsString, slots = []) {
    // queue a message on the end of the queue, with 'absolute' slots. Use
    // 'step' or 'run' to execute it
    kernelKeeper.addToRunQueue(
      harden({
        vatID: `${vatID}`,
        type: 'deliver',
        target: {
          type: 'export',
          vatID: `${vatID}`,
          id: Nat(facetID),
        },
        msg: {
          method: `${method}`,
          argsString: `${argsString}`,
          // queue() is exposed to the controller's realm, so we must translate
          // each slot into a kernel-realm object/array
          slots: Array.from(slots.map(mapQueueSlotToKernelRealm)),
          kernelResolverID: null, // this will be json stringified
        },
      }),
    );
  }

  function processQueueMessage(message) {
    kdebug(`processQ ${JSON.stringify(message)}`);
    const vat = ephemeral.vats.get(message.vatID);
    if (vat === undefined) {
      throw new Error(
        `unknown vatID in target ${JSON.stringify(
          message,
        )}, have ${JSON.stringify(kernelKeeper.getAllVatNames())}`,
      );
    }
    const { manager } = vat;
    try {
      return manager.processOneMessage(message);
    } catch (e) {
      // log so we get a stack trace
      console.log(`error in processOneMessage: ${e} ${e.message}`, e);
      throw e;
    }
  }

  function callBootstrap(vatID, argvString) {
    const argv = JSON.parse(`${argvString}`);
    // each key of 'vats' will be serialized as a reference to its obj0
    const vrefs = new Map();
    const vatObj0s = {};
    kernelKeeper.getAllVatNames().forEach(name => {
      const targetVatID = name;
      // we happen to give _bootstrap to itself, because unit tests that
      // don't have any other vats (bootstrap-only configs) then get a
      // non-empty object as vatObj0s, since an empty object would be
      // serialized as pass-by-presence. It wouldn't make much sense for the
      // bootstrap object to call itself, though.
      const vref = harden({
        toString() {
          return targetVatID;
        },
      }); // marker
      vatObj0s[targetVatID] = vref;
      vrefs.set(vref, { type: 'export', vatID: targetVatID, id: 0 });
      console.log(`adding vref ${targetVatID}`);
    });

    const drefs = new Map();
    // we cannot serialize empty objects as pass-by-copy, because we decided
    // to make them pass-by-presence for use as EQ-able markers (eg for
    // Purses). So if we don't have any devices defined, we must add a dummy
    // entry to this object so it will serialize as pass-by-copy. We can
    // remove the dummy entry after we add the 'addVat' device
    const deviceObj0s = { _dummy: 'dummy' };
    kernelKeeper.getAllDeviceNames().forEach(deviceName => {
      const dref = harden({});
      deviceObj0s[deviceName] = dref;
      drefs.set(dref, { type: 'device', deviceName, id: 0 });
      console.log(`adding dref ${deviceName}`);
    });
    if (Object.getOwnPropertyNames(deviceObj0s) === 0) {
      throw new Error('pass-by-copy rules require at least one device');
    }

    function serializeSlot(ref, slots, slotMap) {
      if (!slotMap.has(ref)) {
        const slotIndex = slots.length;
        if (vrefs.has(ref)) {
          slots.push(vrefs.get(ref));
          slotMap.set(ref, slotIndex);
        } else if (drefs.has(ref)) {
          slots.push(drefs.get(ref));
          slotMap.set(ref, slotIndex);
        } else {
          console.log(`oops ${ref}`, ref);
          throw Error('bootstrap got unexpected pass-by-presence');
        }
      }
      const slotIndex = slotMap.get(ref);
      return harden({ [QCLASS]: 'slot', index: slotIndex });
    }
    const m = makeMarshal(serializeSlot);
    const s = m.serialize(harden({ args: [argv, vatObj0s, deviceObj0s] }));
    // queueToExport() takes 'neutral' { type: export, vatID, slotID } objects in s.slots
    queueToExport(vatID, 0, 'bootstrap', s.argsString, s.slots);
  }

  const kernel = harden({
    addVat(vatID, setup) {
      harden(setup);
      // 'setup' must be an in-realm function. This test guards against
      // accidents, but not against malice. MarkM thinks there is no reliable
      // way to test this.
      if (!(setup instanceof Function)) {
        throw Error('setup is not an in-realm function');
      }
      addVat(`${vatID}`, setup);
    },

    addDevice(deviceName, setup, endowments) {
      console.log(`kernel.addDevice(${deviceName})`);
      harden(setup);
      if (!(setup instanceof Function)) {
        throw Error('setup is not an in-realm function');
      }
      addDevice(`${deviceName}`, setup, endowments);
    },

    callBootstrap,

    addImport,

    log(str) {
      kernelKeeper.log(`${str}`);
    },

    dump() {
      return kernelKeeper.dump();
    },

    getState() {
      return kernelKeeper.getState();
    },

    async loadState(outerRealmState) {
      const newState = JSON.parse(JSON.stringify(outerRealmState));

      // copy in the data passively
      kernelKeeper.loadState(newState);

      // evaluate the transcript

      for (const vatID of Object.getOwnPropertyNames(newState.vats)) {
        const vatData = newState.vats[vatID];
        const vat = ephemeral.vats.get(vatID);
        // eslint-disable-next-line no-await-in-loop
        await vat.manager.loadState(vatData.state);
      }
    },

    async run() {
      // process all messages, until syscall.pause() is invoked
      running = true;
      while (running && !kernelKeeper.isRunQueueEmpty()) {
        // eslint-disable-next-line no-await-in-loop
        await processQueueMessage(kernelKeeper.getNextMsg());
      }
    },

    async step() {
      // process a single message
      if (!kernelKeeper.isRunQueueEmpty()) {
        await processQueueMessage(kernelKeeper.getNextMsg());
      }
    },

    queueToExport,
  });

  return kernel;
}
