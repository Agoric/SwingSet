import { test } from 'tape-promise/tape';
import { loadBasedir, buildVatController } from '../src/index';

async function main(withSES, basedir, argv) {
  const config = await loadBasedir(basedir);
  const ldSrcPath = require.resolve('../src/devices/loopbox-src');
  config.devices = [['loopbox', ldSrcPath, {}]];

  const controller = await buildVatController(config, withSES, argv);
  await controller.run();
  return controller.dump();
}

const encouragementBotGolden = [
  '=> setup called',
  '=> user.talkToBot is called with encouragementBot',
  '=> encouragementBot.encourageMe got the name: user',
  "=> the promise given by the call to user.talkToBot resolved to 'Thanks for the setup. I sure hope I get some encouragement...'",
  '=> user receives the encouragement: user, you are awesome, keep it up!',
];

test('run encouragementBot Demo with SES', async t => {
  const dump = await main(true, 'demo/encouragementBot', []);
  t.deepEquals(dump.log, encouragementBotGolden);
  t.end();
});

test('run encouragementBot Demo without SES', async t => {
  const dump = await main(false, 'demo/encouragementBot', []);
  t.deepEquals(dump.log, encouragementBotGolden);
  t.end();
});

const encouragementBotCommsGolden = [
  '=> setup called',
  'addEgress called with sender user, index 0, valslot [object Object]',
  'addIngress called with machineName bot, index 0',
  '=> user.talkToBot is called with bot',
  "=> the promise given by the call to user.talkToBot resolved to 'Thanks for the setup. I sure hope I get some encouragement...'",
  '=> encouragementBot.encourageMe got the name: user',
  '=> user receives the encouragement: user, you are awesome, keep it up!',
];

test('run encouragementBotComms Demo with SES', async t => {
  const dump = await main(true, 'demo/encouragementBotComms', []);
  t.deepEquals(dump.log, encouragementBotCommsGolden);
  t.end();
});

test('run encouragementBotComms Demo without SES', async t => {
  const dump = await main(false, 'demo/encouragementBotComms');
  t.deepEquals(dump.log, encouragementBotCommsGolden);
  t.end();
});

test('run encouragementBotCommsBang Demo with SES', async t => {
  const dump = await main(true, 'demo/encouragementBotCommsBang', []);
  t.deepEquals(dump.log, encouragementBotCommsGolden);
  t.end();
});
