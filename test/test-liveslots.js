// eslint-disable-next-line no-redeclare
/* global setImmediate */
import { test } from 'tape-promise/tape';
import harden from '@agoric/harden';
// eslint-disable-next-line no-unused-vars
import evaluateExpr from '@agoric/evaluate'; // to get Promise.makeHandled
import buildKernel from '../src/kernel/index';
import { makeLiveSlots } from '../src/kernel/liveSlots';

test('calls', async t => {
  const kernel = buildKernel({ setImmediate });
  const log = [];
  let syscall;

  function setupBootstrap(syscallBootstrap, _state, _helpers) {
    syscall = syscallBootstrap;
    function deliver(facetID, method, argsString, slots, result) {
      log.push(['deliver', facetID, method, argsString, slots, result]);
    }
    return { deliver };
  }
  kernel.addGenesisVat('bootstrap', setupBootstrap);

  function setup(syscallVat, state, helpers) {
    function build(_E, _D) {
      return harden({
        one() {
          log.push('one');
        },
        two(p) {
          log.push(`two ${Promise.resolve(p) === p}`);
          p.then(res => log.push(['res', res]), rej => log.push(['rej', rej]));
        },
      });
    }
    return makeLiveSlots(syscallVat, state, build, helpers.vatID);
  }
  kernel.addGenesisVat('vat', setup);

  await kernel.start('bootstrap', `[]`);
  // cycle past the bootstrap() call
  await kernel.step();
  log.shift();
  t.deepEqual(kernel.dump().runQueue, []);

  const root = kernel.addImport('bootstrap', kernel.addExport('vat', 'o+0'));

  // root!one() // sendOnly
  syscall.send(root, 'one', JSON.stringify({ args: [] }), [], undefined);

  await kernel.step();
  t.deepEqual(log.shift(), 'one');
  t.deepEqual(kernel.dump().runQueue, []);
  // console.log(kernel.dump().runQueue);

  // pr = makePromise()
  // root!two(pr.promise)
  // pr.resolve('result')
  syscall.send(
    root,
    'two',
    JSON.stringify({ args: [{ '@qclass': 'slot', index: 0 }] }),
    ['p+1'],
    undefined,
  );
  await kernel.step();
  t.deepEqual(log.shift(), 'two true');

  syscall.fulfillToData('p+1', JSON.stringify('result'), []);
  await kernel.step();
  t.deepEqual(log.shift(), ['res', 'result']);

  // pr = makePromise()
  // root!two(pr.promise)
  // pr.reject('rejection')

  syscall.send(
    root,
    'two',
    JSON.stringify({ args: [{ '@qclass': 'slot', index: 0 }] }),
    ['p+2'],
    undefined,
  );
  await kernel.step();
  t.deepEqual(log.shift(), 'two true');

  syscall.reject('p+2', JSON.stringify('rejection'), []);
  await kernel.step();
  t.deepEqual(log.shift(), ['rej', 'rejection']);

  // TODO: more calls, more slot types

  t.end();
});
