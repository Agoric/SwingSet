#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const process = require('process');
require = require('esm')(module);

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

main();

