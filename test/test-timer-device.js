import { test } from 'tape-promise/tape';
import {
  buildTimerMap,
  curryPollFn,
  curryRepeaterBuilder,
} from '../src/devices/timer-src';

test('multiMap multi store', t => {
  const mm = buildTimerMap();
  mm.add(3, 'threeA');
  mm.add(3, 'threeB');
  const threes = mm.removeEventsThrough(4);
  t.equal(threes.size, 1);
  t.deepEqual(threes.get(3), [{ cb: 'threeA' }, { cb: 'threeB' }]);
  t.equal(mm.removeEventsThrough(10).size, 0);
  t.end();
});

test('multiMap store multiple keys', t => {
  const mm = buildTimerMap();
  mm.add(3, 'threeA');
  mm.add(13, 'threeB');
  t.equal(mm.removeEventsThrough(4).size, 1);
  t.equal(mm.removeEventsThrough(10).size, 0);
  const thirteens = mm.removeEventsThrough(13);
  t.equal(thirteens.size, 1, thirteens);
  t.end();
});

test('multiMap remove key', t => {
  const mm = buildTimerMap();
  mm.add(3, 'threeA');
  mm.add(13, 'threeB');
  t.equals(mm.remove('not There'), null);
  t.equals(mm.remove('threeA'), 'threeA');
  mm.remove(3, 'threeA');
  t.equal(mm.removeEventsThrough(10).size, 0);
  const thirteens = mm.removeEventsThrough(13);
  t.equal(thirteens.size, 1);
  t.deepEqual(thirteens.get(13), [{ cb: 'threeB' }]);
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

test('Timer schedule single event', t => {
  const deviceState = buildTimerMap();
  const poll = curryPollFn(fakeSO, deviceState);
  t.notOk(poll(1));
  const cb = makeCallback();
  deviceState.add(2, cb);
  t.ok(poll(4));
  t.equals(cb.getCalls(), 1);
  t.equals(cb.getArgs()[0], null);
  t.end();
});

test('Timer schedule repeated event first', t => {
  let lastPolled = 0;
  const deviceState = buildTimerMap();
  const poll = curryPollFn(fakeSO, deviceState);
  t.notOk(poll(1));
  lastPolled = 1;
  const cb = makeCallback();
  const repeaterBuilder = curryRepeaterBuilder(deviceState, () => lastPolled);
  const rptr = repeaterBuilder(5, 3);
  rptr.schedule(cb);
  t.notOk(poll(4));
  lastPolled = 4;
  t.ok(poll(5));
  t.equals(cb.getCalls(), 1);
  t.equals(cb.getArgs()[0], rptr);
  t.end();
});

test('multiMap remove repeater key', t => {
  const deviceState = buildTimerMap();
  const lastPolled = 0;
  const cb = makeCallback();
  const repeaterBuilder = curryRepeaterBuilder(deviceState, () => lastPolled);
  const rptr = repeaterBuilder(5, 3);
  rptr.schedule(cb);
  t.equals(deviceState.remove(cb), cb);
  t.end();
});

test('Timer schedule repeated event, repeatedly', t => {
  const deviceState = buildTimerMap();
  let lastPolled = 0;
  const poll = curryPollFn(fakeSO, deviceState);
  t.notOk(poll(1));
  lastPolled = 1;
  const cb = makeCallback();
  const repeaterBuilder = curryRepeaterBuilder(deviceState, () => lastPolled);
  const rptr = repeaterBuilder(5, 3);
  rptr.schedule(cb);
  t.ok(poll(5));
  lastPolled = 5;
  t.equals(cb.getCalls(), 1);
  rptr.schedule(cb);
  t.notOk(poll(7));
  lastPolled = 7;
  t.ok(poll(8));
  lastPolled = 8;
  t.equals(cb.getCalls(), 2);
  t.deepEquals(cb.getArgs(), [rptr, rptr]);
  t.end();
});

test('Timer schedule multiple events', t => {
  const deviceState = buildTimerMap();
  let lastPolled = 0;
  const poll = curryPollFn(fakeSO, deviceState);
  t.notOk(poll(1));
  lastPolled = 1;
  const repeaterBuilder = curryRepeaterBuilder(deviceState, () => lastPolled);
  // will schedule at 2, 5, 8, etc.
  const rptr = repeaterBuilder(1, 3);
  const rptrCb = makeCallback();
  const cb1 = makeCallback();
  const cb2 = makeCallback();
  rptr.schedule(rptrCb);
  poll(4);
  rptr.schedule(rptrCb);
  deviceState.add(5, cb1);
  deviceState.add(6, cb2);
  poll(7);
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
  const deviceState = buildTimerMap();
  let lastPolled = 0;
  const poll = curryPollFn(fakeSO, deviceState);
  t.notOk(poll(1));
  lastPolled = 1;
  const repeaterBuilder = curryRepeaterBuilder(deviceState, () => lastPolled);
  // will schedule at 2, 5, 8, etc.
  const rptr = repeaterBuilder(1, 3);
  const rptrCb = makeCallback();
  const cb1 = makeThrowingCallback();
  rptr.schedule(rptrCb);
  t.ok(poll(4));
  lastPolled = 4;
  rptr.schedule(rptrCb);
  deviceState.add(5, cb1);
  t.ok(poll(7));
  lastPolled = 7;
  t.equals(rptrCb.getCalls(), 2);
  t.deepEquals(rptrCb.getArgs(), [rptr, rptr]);
  t.true(cb1.didThrow());
  t.end();
});

test.only('Timer resets on throw', t => {
  const deviceState = buildTimerMap();
  let lastPolled = 0;
  const poll = curryPollFn(fakeSO, deviceState);
  t.notOk(poll(1));
  lastPolled = 1;
  const repeaterBuilder = curryRepeaterBuilder(deviceState, () => lastPolled);
  // will schedule at 2, 5, 8, etc.
  const rptr = repeaterBuilder(1, 3);
  const thrCb = makeThrowingCallback();
  const cb1 = makeCallback();
  rptr.schedule(thrCb);
  t.notOk(poll(4));
  lastPolled = 4;
  rptr.schedule(cb1);
  t.notOk(poll(6));
  lastPolled = 6;
  t.equals(cb1.getCalls(), 0);
  t.deepEquals(cb1.getArgs(), []);
  t.true(thrCb.didThrow());
  t.end();
});
