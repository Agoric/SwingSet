#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const process = require('process');
require = require('esm')(module);
const lotion = require('lotion');

const { loadBasedir, buildVatController } = require('../src/index.js');
const { buildInbound } = require('../src/devices');

async function main() {
  let argv = process.argv.splice(2);
  let withSES = true;
  if (argv[0] === '--no-ses') {
    withSES = false;
    argv.shift();
  }

  const config = {};
  const inboundDevice = buildInbound()
  const controller = await buildVatController(config, withSES);
  await controller.addVat('inbound', require.resolve('../demo/cosmos/vat-inbound.js'),
                         { devices:
                           { inbound:
                             {
                               attenuatorSource: inboundDevice.attenuatorSource,
                               bridge: inboundDevice.bridge,
                             },
                           },
                         });
  await controller.addVat('mint', require.resolve('../demo/cosmos/vat-mint.js'));
  await controller.addVat('_bootstrap', require.resolve('../demo/cosmos/bootstrap.js'));
  await controller.callBootstrap('_bootstrap', []);
  await controller.run();

  const { deliverInbound } = inboundDevice;

  if (0) {
    console.log('delivering inbound sequence');
    deliverInbound('abc', JSON.stringify({ index: 0, methodName: 'getIssuer', args: [], resultIndex: 1}));
    deliverInbound('abc', JSON.stringify({ index: 1, methodName: 'makeEmptyPurse', args: ['purse2'], resultIndex: 2}));
    deliverInbound('abc', JSON.stringify({ index: 2, methodName: 'deposit', args: [20, {'@qclass': 'index', index: 0}], resultIndex: 3}));
    deliverInbound('abc', JSON.stringify({ index: 2, methodName: 'getBalance', args: [], resultIndex: 4}));
    // this purse1.getBalance() is delivered before the deposit() finishes, so
    // it gets the wrong result
    //deliverInbound('abc', JSON.stringify({ index: 0, methodName: 'getBalance', args: [], resultIndex: 5}));
    await controller.run();
    console.log('all done');
  }

  const initialState = { counters: { one: 0, two: 0},
                         controllerState: controller.getState(),
                       };

  const app = lotion({
    initialState,
    //logTendermint: true,
  });

  app.use(async (state, tx, chainInfo) => {
    console.log('app.use', tx, chainInfo.time, state.counters);
    deliverInbound('abc', tx);
    state.counters.one = state.counters.one + 1;
    await controller.run();
    console.log(' app.use did run()');
    state.controllerState = controller.getState();
    state.counters.two = state.counters.two + 1;
    
    // mutate state
    // chainInfo: { time, validators }
  });

  app.useBlock((state, chainInfo) => {
    console.log('app.useBlock', chainInfo.time);
  });

  console.log('app.start()');
  const appInfo = await app.start();
  // { GCI, genesisPath: ~/.lotion/XX/config/genesis.json, ports: { abci, p2p, rpc } }
  console.log(`GCI: ${appInfo.GCI}`);

}

main();

