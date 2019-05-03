// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import escrowExchange from './escrow';

function makeAlice(E, host) {
  const escrowSrc = `(${escrowExchange})`;

  let initialized = false;
  let myMoneyPurseP;
  let myMoneyIssuerP;
  /* eslint-disable-next-line no-unused-vars */
  let myStockPurseP;
  let myStockIssuerP;

  function init(myMoneyPurse, myStockPurse) {
    initialized = true;
    myMoneyPurseP = Promise.resolve(myMoneyPurse);
    myMoneyIssuerP = E(myMoneyPurse).getIssuer();
    myStockPurseP = Promise.resolve(myStockPurse);
    myStockIssuerP = E(myStockPurse).getIssuer();
    // eslint-disable-next-line no-use-before-define
    return alice; // alice and init use each other
  }

  const check = (_allegedSrc, _allegedSide) => {
    // for testing purposes, alice and bob are willing to play
    // any side of any contract, so that the failure we're testing
    // is in the contractHost's checking
  };

  const alice = harden({
    init,
    payBobWell(bob) {
      if (!initialized) {
        console.log('++ ERR: payBobWell called before init()');
      }
      const paymentP = E(myMoneyIssuerP).getExclusive(10, myMoneyPurseP);
      return E(bob).buy('shoe', paymentP);
    },

    invite(tokenP, allegedSrc, allegedSide) {
      if (!initialized) {
        console.log('++ ERR: invite called before init()');
      }

      check(allegedSrc, allegedSide);

      // eslint-disable-next-line no-unused-vars
      let cancel;
      const a = harden({
        moneySrcP: E(myMoneyIssuerP).getExclusive(
          10,
          myMoneyPurseP,
          'aliceMoneySrc',
        ),
        moneyRefundP: E(myMoneyIssuerP).makeEmptyPurse('aliceMoneyRefund'),
        stockDstP: E(myStockIssuerP).makeEmptyPurse('aliceStockDst'),
        stockNeeded: 7,
        cancellationP: new Promise(r => (cancel = r)),
      });
      const doneP = E(host).play(tokenP, allegedSrc, allegedSide, a);
      return doneP.then(_ => E(a.stockDstP).getBalance());
    },
  });
  return alice;
}

function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(syscall, state, E =>
    harden({
      makeAlice(host) {
        return harden(makeAlice(E, host));
      },
    }),
  );
}
export default harden(setup);
