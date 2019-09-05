import { test } from 'tape-promise/tape';
import { buildMultiMap, buildTimerStateMap, buildTimerEndowments } from '../src/devices/timer';

test('multiMap multi store', t => {
  const mm = buildMultiMap();
  mm.add(3, 'threeA');
  mm.add(3, 'threeB');
  const threes = mm.removeValuesUpTo(4);
  t.equal(2, threes.length);
  t.notOk(mm.removeValuesUpTo(10));
};

test('multiMap store multiple keys', t => {
  const mm = buildMultiMap();
  mm.add(3, 'threeA');
  mm.add(13, 'threeB');
  const threes = mm.removeValuesUpTo(4);
  t.equal(1, threes.length);
  t.notOk(mm.removeValuesUpTo(10));
  const thirteens = mm.removeValuesUpTo(13);
  t.equal(1, thirteens.length);
}

test('multiMap remove key', t => {
  const mm = buildMultiMap();
  mm.add(3, 'threeA');
  mm.add(13, 'threeB');
  const threes = mm.remove(3, 'threeA');
  t.equal(1, threes.length);
  t.notOk(mm.removeValuesUpTo(10));
  const thirteens = mm.removeValuesUpTo(13);
  t.equal(1, thirteens.length);
  t.equal({3:'threeB'}, thirteens);
}