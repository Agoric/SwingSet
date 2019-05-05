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
      // TODO Bug if we change the "_ => 7" below to "_ => undefined",
      // or equivalently if we just omit these unnecessary last .then
      // clauses, then somehow we end up trying to marshal an array
      // with holes, rather than an array with undefined
      // elements. This remains true whether we use Promise.all or
      // allSettled
      const doneP = allSettled([
        E(seatP)
          .getWinnings()
          .then(winnings => E(myStockPurseP).deposit(7, winnings))
          .then(_ => 7),
        E(seatP)
          .getRefund()
          .then(refund => refund && E(myMoneyPurseP).deposit(10, refund))
          .then(_ => 10),
      ]);
      return doneP;
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
