#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const process = require('process');
const { createHash } = require('crypto');
const tendermint = require('tendermint-node');
const djson = require('deterministic-json');
const vstruct = require('varstruct');
const getPort = require('get-port');
const createServer = require('abci');
const { createServer: createDiscoveryServer } = require('peer-channel');
const jpfs = require('jpfs');

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


  const TxStruct = vstruct([
    { name: 'data', type: vstruct.VarString(vstruct.UInt32BE) },
    { name: 'nonce', type: vstruct.UInt32BE },
  ]);

  function decodeTx(txBuffer) {
    let decoded = TxStruct.decode(txBuffer);
    let tx = djson.parse(decoded.data);
    return tx;
  };

  const validators = {};
  let height = 0;

  let abciServer = createServer({
    async info(request) {
      console.log('info', request);
      return {};
    },
    async deliverTx(request) {
      const decodedRequest = decodeTx(request.tx);
      console.log('deliverTx', decodedRequest);
      // error: return { code: 1, log: 'why' }
      deliverInbound('abc', JSON.stringify(decodedRequest));
      await controller.run();
      return {};
    },
    async checkTx(request) {
      const decodedRequest = decodeTx(request.tx);
      console.log('checkTx', decodedRequest);
      // error: return { code: 1, log: 'why' }

      // return 'info' property, shows up in tendermint log in "Added good
      // transaction module=mempool tx=.. res=infomsg.."

      // https://tendermint.com/docs/spec/abci/abci.html#methods-and-types

      // deterministic properties: code, data, gas_wanted/gas_used (int64), tags, codespace (string)
      // * codespace is a namespace for the code
      // * tags: list of (key,value) associated with tx, or block
      // * gas_wanted: to be enforced, set MaxGas in genesis file
      //   ResponseCheckTx.GasWanted, ConsensusParams.BlockSize.MaxGas
      //   GasWanted <= MaxGas for every tx
      //   (sum of GasWanted in block) <= MaxGas for block proposal
      return { };
    },
    async beginBlock(request) {
      console.log('beginBlock', /*request*/);
      return {};
    },
    async endBlock() {
      console.log('endBlock');
      let validatorUpdates = []

      for (let pubKey in validators) {
        validatorUpdates.push({
          pubKey: { type: 'ed25519', data: Buffer.from(pubKey, 'base64') },
          power: { low: validators[pubKey], high: 0 }
        })
      }
      return { validatorUpdates };
    },
    async commit() {
      console.log(`commit[${height}]`);
      const data = createHash('sha256').update(djson.stringify(controller.getState())).digest('hex');
      height++;
      //console.log(`commit[${height}] = ${data}`);
      return { data: Buffer.from(data, 'hex') }
    },

    async initChain(initChainRequest) {
      console.log('initChain', initChainRequest);
      initChainRequest.validators.forEach(validator => {
        validators[
          validator.pubKey.data.toString('base64')
        ] = validator.power.toNumber();
      })
      return {};
    },

    async query(request) {
      console.log('query', request);
      const queryResponse = controller.getState();
      let value = Buffer.from(djson.stringify(queryResponse)).toString('base64')
      //console.log(`-- value ${value}`);
      return {
        value,
        height
      };
    },
  });

  const ports = {
    rpc: await getPort(),
    p2p: await getPort(),
    abci: await getPort(),
  };
  abciServer.listen(ports.abci);

  let opts = {
    rpc: { laddr: 'tcp://0.0.0.0:' + ports.rpc },
    p2p: { laddr: 'tcp://0.0.0.0:' + ports.p2p },
    proxyApp: 'tcp://127.0.0.1:' + ports.abci,
  }

  const home = 'tmint-home';
  await tendermint.init(home)
  console.log(`calling tendermint.node`, home, opts);
  let tendermintProcess = tendermint.node(home, opts)
  console.log(` called`);
  const logTendermint = false;
  if (logTendermint) {
    tendermintProcess.stdout.pipe(process.stdout)
    tendermintProcess.stderr.pipe(process.stderr)
  }
  tendermintProcess.then(e => {
    //console.log('terndermint error', e);
    throw new Error('Tendermint exited unexpectedly')
  })
  console.log(`calling tendermintProcess.synced()`);
  await tendermintProcess.synced()
  console.log(` synced`);

  // pull genesis data from tendermint directory, compute GCI
  const genesisPath = path.join(home, 'config', 'genesis.json');
  const genesis = fs.readFileSync(genesisPath, 'utf8');
  const GCI = createHash('sha256')
      .update(genesis)
      .digest('hex');
  console.log(`GCI: ${GCI}`);
  fs.writeFileSync(path.join(home, 'config', 'gci.txt'), `${GCI}\n`);

  // discovery
  const discoveryServer = createDiscoveryServer(socket => {
    socket.send(`${ports.rpc}`);
    socket.end();
    socket.on('error', e => {});
  });
  discoveryServer.listen(`fullnode:${GCI}`);
  const genesisServer = jpfs.serve(genesis);

}

main();

