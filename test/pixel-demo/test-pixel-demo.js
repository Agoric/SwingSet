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

const contractMintGolden = [
  '=> setup called',
  'starting mintTestAssay',
  'starting mintTestNumber',
  'alice xfer balance {"label":{"issuer":{},"description":"quatloos"},"quantity":950}',
  'alice use balance {"label":{"issuer":{},"description":"quatloos"},"quantity":1000}',
  'payment xfer balance {"label":{"issuer":{},"description":"quatloos"},"quantity":50}',
  'alice xfer balance {"label":{"issuer":{},"description":"bucks"},"quantity":950}',
  'alice use balance {"label":{"issuer":{},"description":"bucks"},"quantity":1000}',
  'payment xfer balance {"label":{"issuer":{},"description":"bucks"},"quantity":50}',
];

test.only('run Pixel Demo --mint with SES', async t => {
  const dump = await main(false, 'demo/pixel-demo', ['mint']);
  t.deepEquals(dump.log, contractMintGolden);
  t.end();
});
