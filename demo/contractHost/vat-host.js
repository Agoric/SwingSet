// Copyright (C) 2012 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0


import harden from '@agoric/harden';
import evaluate from '@agoric/evaluate';

import makePromise from '../../src/kernel/makePromise';


function safeRequire(name) {
  switch (name) {
    case '@agoric/harden': {
      return harden;
    }
  }
  throw new ReferenceError(`${name} not found in safeRequire`);
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
            throw new Error(`unexpected contract: ${contractSrc}`);
          }
          if (i !== allegedI) {
            throw new Error(`unexpected side: ${i}`);
          }
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

export default function setup(syscall, state, helpers) {
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
