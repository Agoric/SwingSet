import { test } from 'tape-promise/tape';

import {
  insistPixelList,
  includesPixel,
  insistIncludesPixel,
  includesPixelList,
  withPixelList,
  withoutPixelList,
} from '../../demo/pixelFarm/types/pixelList';

test('pixelList insistPixelList', t => {
  const startPixel = { x: 0, y: 0 };
  const secondPixel = { x: 0, y: 1 };
  const thirdPixel = { x: 0, y: 2 };
  const pixelList = [startPixel, secondPixel, thirdPixel];
  t.doesNotThrow(() => insistPixelList(pixelList, 5));
  t.throws(() => insistPixelList(startPixel, 5));
  t.throws(() => insistPixelList({}, 5));
  t.throws(() => insistPixelList([thirdPixel], 1));
  t.end();
});

test('pixelList includesPixel', t => {
  const startPixel = { x: 0, y: 0 };
  const secondPixel = { x: 0, y: 1 };
  const thirdPixel = { x: 0, y: 2 };
  const fourthPixel = { x: 9, y: 1 };
  const pixelList = [startPixel, secondPixel, thirdPixel];
  t.true(includesPixel(pixelList, startPixel));
  t.true(includesPixel(pixelList, secondPixel));
  t.true(includesPixel(pixelList, thirdPixel));
  t.false(includesPixel(pixelList, fourthPixel));
  t.end();
});

test('pixelList insistIncludesPixel', t => {
  const startPixel = { x: 0, y: 0 };
  const secondPixel = { x: 0, y: 1 };
  const thirdPixel = { x: 0, y: 2 };
  const fourthPixel = { x: 9, y: 1 };
  const pixelList = [startPixel, secondPixel, thirdPixel];
  t.doesNotThrow(() => insistIncludesPixel(pixelList, startPixel));
  t.doesNotThrow(() => insistIncludesPixel(pixelList, secondPixel));
  t.doesNotThrow(() => insistIncludesPixel(pixelList, thirdPixel));
  t.throws(() => insistIncludesPixel(pixelList, fourthPixel));
  t.end();
});

test('pixelList includesPixelList', t => {
  const startPixel = { x: 0, y: 0 };
  const secondPixel = { x: 0, y: 1 };
  const thirdPixel = { x: 0, y: 2 };
  const fourthPixel = { x: 9, y: 1 };
  t.true(includesPixelList([], []));
  t.true(includesPixelList([startPixel], []));
  t.true(includesPixelList([startPixel], [startPixel]));
  t.true(includesPixelList([startPixel, secondPixel], [startPixel]));
  t.false(includesPixelList([], [startPixel]));
  t.false(includesPixelList([startPixel], [secondPixel]));
  t.false(
    includesPixelList([startPixel, thirdPixel], [secondPixel, fourthPixel]),
  );
  t.false(
    includesPixelList(
      [startPixel, secondPixel, thirdPixel],
      [thirdPixel, fourthPixel],
    ),
  );
  t.end();
});

test('pixelList withPixelList', t => {
  const startPixel = { x: 0, y: 0 };
  const secondPixel = { x: 0, y: 1 };
  t.deepEqual(withPixelList([], []), []);
  t.deepEqual(withPixelList([startPixel], []), [startPixel]);
  t.deepEqual(withPixelList([], [startPixel]), [startPixel]);
  t.deepEqual(withPixelList([startPixel], [startPixel]), [startPixel]);
  t.deepEqual(withPixelList([startPixel], [secondPixel]), [
    startPixel,
    secondPixel,
  ]);
  t.deepEqual(withPixelList([startPixel, secondPixel], [secondPixel]), [
    startPixel,
    secondPixel,
  ]);
  t.end();
});

test('pixelList withoutPixelList', t => {
  const startPixel = { x: 0, y: 0 };
  const secondPixel = { x: 0, y: 1 };
  t.deepEqual(withoutPixelList([], []), []);
  t.deepEqual(withoutPixelList([startPixel], []), [startPixel]);
  t.throws(() => withoutPixelList([], [startPixel]));
  t.deepEqual(withoutPixelList([startPixel], [startPixel]), []);
  t.deepEqual(withoutPixelList([startPixel, secondPixel], [secondPixel]), [
    startPixel,
  ]);
  t.end();
});
