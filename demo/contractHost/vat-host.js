// Copyright (C) 2012 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';
import evaluate from '@agoric/evaluate';

import makePromise from '../../src/kernel/makePromise';
import { check } from '../../collections/insist';

function safeRequire(name) {
  switch (name) {
    case '@agoric/harden': {
      return harden;
    }
    default: {
      throw new ReferenceError(`${name} not found in safeRequire`);
    }
  }
}
harden(safeRequire);

function makeHost(E) {
  const m = new WeakMap();

  return harden({
    setup(contractSrc) {
      contractSrc = `${contractSrc}`;
      const tokens = [];
      const argPs = [];
      const { p: resultP, res: resolve } = makePromise();
      const contract = evaluate(contractSrc, {
        console,
        require: safeRequire,
        E,
      });

      const addParam = (i, token) => {
        tokens[i] = token;
        const p = makePromise();
        const resolveArg = p.res;
        argPs[i] = p.p;
        m.set(token, (allegedSrc, allegedI, arg) => {
          if (contractSrc !== allegedSrc) {
            const lines = allegedSrc.split('\n');
            // eslint-disable-next-line no-unused-expressions
            check(false)`\
Unexpected contract:
> ${lines[0]}
> ... ${lines.length - 2} lines ...
> ${lines[lines.length - 1]}`;
          }
          // eslint-disable-next-line no-unused-expressions
          check(i === allegedI)`\
Unexpected side: ${allegedI}`;
          m.delete(token);
          resolveArg(arg);
          return resultP;
        });
      };
      for (let i = 0; i < contract.length; i += 1) {
        addParam(i, harden({}));
      }
      resolve(
        Promise.all(argPs).then(args => {
          return contract(...args);
        }),
      );
      return harden(tokens);
    },
    play(tokenP, allegedSrc, allegedI, arg) {
      return Promise.resolve(tokenP).then(token => {
        return m.get(token)(allegedSrc, allegedI, arg);
      });
    },
  });
}

function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    E =>
      harden({
        makeHost() {
          return harden(makeHost(E));
        },
      }),
    helpers.vatID,
  );
}
export default harden(setup);
