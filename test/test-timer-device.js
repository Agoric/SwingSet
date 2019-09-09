import { test } from 'tape-promise/tape';
import harden from '@agoric/harden';
import { makeMarshal } from '@agoric/marshal';
import { buildTimerEndowments } from '../src/devices/timer';
import { buildTimerMap, setup } from '../src/devices/timer-src';
import { makeLiveSlots } from '../src/kernel/liveSlots';
import { makeDeviceSlots } from '../src/kernel/deviceSlots';

test('multiMap multi store', t => {
  const mm = buildTimerMap();
  mm.add(3, 'threeA');
  mm.add(3, 'threeB');
  const threes = mm.removeValuesUpTo(4);
  t.equal(threes.size, 1);
  t.deepEqual(threes.get(3), ['threeA', 'threeB']);
  t.equal(mm.removeValuesUpTo(10).size, 0);
  t.end();
});

test('multiMap store multiple keys', t => {
  const mm = buildTimerMap();
  mm.add(3, 'threeA');
  mm.add(13, 'threeB');
  t.equal(mm.removeValuesUpTo(4).size, 1);
  t.equal(mm.removeValuesUpTo(10).size, 0);
  const thirteens = mm.removeValuesUpTo(13);
  t.equal(thirteens.size, 1, thirteens);
  t.end();
});

test('multiMap remove key', t => {
  const mm = buildTimerMap();
  mm.add(3, 'threeA');
  mm.add(13, 'threeB');
  t.equals(mm.remove(5, 'threeA'), null, 'remove missing value');
  t.equals(mm.remove(3, 'not There'), null, 'remove wrong value');
  const threes = mm.remove(3, 'threeA');
  t.equal(threes.size, 1, threes);
  t.equal(mm.removeValuesUpTo(10).size, 0);
  const thirteens = mm.removeValuesUpTo(13);
  t.equal(thirteens.size, 1);
  t.deepEqual(thirteens.get(13), ['threeB']);
  t.end();
});

function fakeSO(o) {
  return {
    wake(arg = null) {
      o.wake(arg);
    },
  };
}

function makeCallback() {
  let calls = 0;
  const args = [];
  return {
    getCalls() {
      return calls;
    },
    getArgs() {
      return args;
    },
    wake(arg) {
      args.push(arg);
      calls += 1;
    },
  };
}

const deviceState = new Map();
const fakeDeviceKeeper = {
  getDeviceState() {
    return deviceState.get('dev');
  },
  setDeviceState(value) {
    deviceState.set('dev', value);
  },
};

function buildTimerRootDevice() {
  const fakeState = harden({
    set(args) {
      fakeDeviceKeeper.setDeviceState(args);
    },
    get() {
      return fakeDeviceKeeper.getDeviceState();
    },
  });
  const helpers = harden({
    makeLiveSlots,
    makeDeviceSlots,
    name: 'fake device',
  });

  const { endowments, poll } = buildTimerEndowments();
  const device = setup(fakeSO, fakeState, helpers, endowments);

  return { poll, state: fakeState, endowments, device };
}

test('Timer schedule single event', t => {
  const { poll, endowments } = buildTimerRootDevice();
  poll(fakeSO, 1);
  const cb = makeCallback();
  endowments.setTimer(3, cb);
  poll(fakeSO, 4);
  t.equals(cb.getCalls(), 1);
  t.equals(cb.getArgs()[0], null);
  t.end();
});

test.only('Timer schedule repeated event first', t => {
  const { poll, device } = buildTimerRootDevice();
  poll(fakeSO, 1);
  const cb = makeCallback();
  const argsString = JSON.stringify({ args: [2, 4] });
  const rptr = device.invoke('d+0', 'createRepeater', argsString, harden([]));
  rptr.schedule(cb);
  poll(fakeSO, 4);
  t.equals(cb.getCalls(), 1);
  t.equals(cb.getArgs()[0], rptr);
  t.end();
});

test('Timer schedule repeated event, repeatedly', t => {
  const state = buildTimerRootDevice();
  const { poll, endowments } = buildTimerEndowments(state);
  poll(fakeSO, 1);
  const cb = makeCallback();
  const rptr = endowments.createRepeater(2, 4);
  rptr.schedule(cb);
  poll(fakeSO, 4);
  rptr.schedule(cb);
  poll(fakeSO, 7);
  t.equals(cb.getCalls(), 2);
  t.deepEquals(cb.getArgs(), [rptr, rptr]);
  t.end();
});

test('Timer schedule multiple events', t => {
  const state = buildTimerRootDevice();
  const { poll, endowments } = buildTimerEndowments(state);
  poll(fakeSO, 1);
  const rptrCb = makeCallback();
  const cb1 = makeCallback();
  const cb2 = makeCallback();
  const rptr = endowments.createRepeater(2, 4);
  rptr.schedule(rptrCb);
  poll(fakeSO, 4);
  rptr.schedule(rptrCb);
  endowments.setTimer(5, cb1);
  endowments.setTimer(6, cb2);
  poll(fakeSO, 7);
  t.equals(rptrCb.getCalls(), 2);
  t.deepEquals(rptrCb.getArgs(), [rptr, rptr]);
  t.equals(cb1.getCalls(), 1);
  t.equals(cb1.getArgs()[0], null);
  t.equals(cb2.getCalls(), 1);
  t.equals(cb2.getArgs()[0], null);
  t.end();
});

function makeThrowingCallback() {
  let threw = false;
  return {
    didThrow() {
      return threw;
    },
    wake(_) {
      threw = true;
      throw new Error("That didn't work.");
    },
  };
}

test('Timer invoke other events when one throws', t => {
  const state = buildTimerRootDevice();
  const { poll, endowments } = buildTimerEndowments(state);
  poll(fakeSO, 1);
  const rptrCb = makeCallback();
  const cb1 = makeThrowingCallback();
  const rptr = endowments.createRepeater(2, 4);
  rptr.schedule(rptrCb);
  poll(fakeSO, 4);
  rptr.schedule(rptrCb);
  endowments.setTimer(5, cb1);
  poll(fakeSO, 7);
  t.equals(rptrCb.getCalls(), 2);
  t.deepEquals(rptrCb.getArgs(), [rptr, rptr]);
  t.true(cb1.didThrow());
  t.end();
});

test('Timer schedule rollback time', t => {
  const state = buildTimerRootDevice();
  const { poll } = buildTimerEndowments(state);
  poll(fakeSO, 4);
  t.throws(() => poll(fakeSO, 1), /monotonic/);
  t.end();
});
