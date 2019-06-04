// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

function makeBobMaker(E, host, log) {
  return harden({
    make(handoffServiceP) {
      const bob = harden({
        findSomething(key) {
          const boardP = E(handoffServiceP).grab(key);
          return E(handoffServiceP)
            .vouch(boardP)
            .then(E(boardP).lookup(key));
        },
      });
      return bob;
    },
  });
}

function setup(syscall, state, helpers) {
  function log(...args) {
    helpers.log(...args);
    console.log(...args);
  }
  return helpers.makeLiveSlots(syscall, state, E =>
    harden({
      makeBobMaker(host) {
        return harden(makeBobMaker(E, host, log));
      },
    }),
  );
}
export default harden(setup);
