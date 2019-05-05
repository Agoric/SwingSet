// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { check } from '../../collections/insist';
import { allSettled } from '../../collections/allSettled';

function makeAlice(E, host) {
  let initialized = false;
  let myMoneyPurseP;
  //  let myMoneyIssuerP;
  /* eslint-disable-next-line no-unused-vars */
  let myStockPurseP;
  //  let myStockIssuerP;

  function init(myMoneyPurse, myStockPurse) {
    myMoneyPurseP = Promise.resolve(myMoneyPurse);
    //    myMoneyIssuerP = E(myMoneyPurse).getIssuer();
    myStockPurseP = Promise.resolve(myStockPurse);
    //    myStockIssuerP = E(myStockPurse).getIssuer();
    initialized = true;
    // eslint-disable-next-line no-use-before-define
    return alice; // alice and init use each other
  }

  const alice = harden({
    init,
    payBobWell(bob) {
      check(initialized)`\
ERR: payBobWell called before init()`;

      const paymentP = E(myMoneyPurseP).withdraw(10);
      return E(bob).buy('shoe', paymentP);
    },

    invite(ticketP) {
      check(initialized)`\
ERR: invite called before init()`;

      // TODO: get an exclusive on the ticket using the full assay
      // style, so Alice knows that the ticket means what she expects.

      const seatP = E(host).redeem(ticketP);
      const moneyPaymentP = E(myMoneyPurseP).withdraw(10);
      E(seatP).offer(moneyPaymentP);
      const doneP = allSettled([
        E(seatP)
          .getWinnings()
          .then(winnings => E(myStockPurseP).deposit(7, winnings)),
        E(seatP)
          .getRefund()
          .then(refund => refund && E(myMoneyPurseP).deposit(10, refund)),
      ]);
      return doneP.then(_ => []);
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
