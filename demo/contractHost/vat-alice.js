// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { check } from '../../collections/insist';

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

      const seatP = E(host).redeem(ticketP);
      const moneyPaymentP = E(myMoneyPurseP).withdraw(10);
      const leaveTicketP = E(seatP).offer(moneyPaymentP);
      const winningsP = E(host).redeem(leaveTicketP);
      return Promise.resolve(winningsP).then(winnings => {
        const { moneyRefundP, stockPaidP } = winnings;
        return Promise.all([
          E(moneyRefundP).getXferBalance(),
          E(stockPaidP).getXferBalance(),
        ]);
      });
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
