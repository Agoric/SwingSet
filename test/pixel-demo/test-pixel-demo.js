import { test } from 'tape-promise/tape';
import { loadBasedir, buildVatController } from '../../src/index';

async function main(withSES, basedir, argv) {
  const config = await loadBasedir(basedir);
  const ldSrcPath = require.resolve('../../src/devices/loopbox-src');
  config.devices = [['loopbox', ldSrcPath, {}]];

  const controller = await buildVatController(config, withSES, argv);
  await controller.run();
  return controller.dump();
}

const successfulWithdraw = [
  '=> setup called',
  'starting mintTestPixelListAssay',
  'alice xfer balance {"label":{"issuer":{},"description":"pixelList"},"pixelList":[{"x":0,"y":1},{"x":1,"y":0},{"x":1,"y":1}]}',
  'alice use balance {"label":{"issuer":{},"description":"pixelList"},"pixelList":[{"x":0,"y":0},{"x":0,"y":1},{"x":1,"y":0},{"x":1,"y":1}]}',
  'payment xfer balance {"label":{"issuer":{},"description":"pixelList"},"pixelList":[{"x":0,"y":0}]}',
];

test('run Pixel Demo mint and withdraw with SES', async t => {
  const dump = await main(true, 'demo/pixel-demo', ['mint']);
  t.deepEquals(dump.log, successfulWithdraw);
  t.end();
});

test('run Pixel Demo mint and withdraw without SES', async t => {
  const dump = await main(false, 'demo/pixel-demo', ['mint']);
  t.deepEquals(dump.log, successfulWithdraw);
  t.end();
});

const contractAliceFirstGolden = [
  '=> setup called',
  '++ alice.payBobWell starting',
  '++ ifItFitsP done:If it fits, ware it.',
  '++ DONE',
];

test('run Pixel Demo --alice-first with SES', async t => {
  const dump = await main(true, 'demo/pixel-demo', ['alice-first']);
  t.deepEquals(dump.log, contractAliceFirstGolden);
  t.end();
});

test.only('run Pixel Demo --alice-first without SES', async t => {
  const dump = await main(false, 'demo/pixel-demo', ['alice-first']);
  t.deepEquals(dump.log, contractAliceFirstGolden);
  t.end();
});
