// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { check } from '../../collections/insist';
import { allSettled } from '../../collections/allSettled';
import { escrowExchange } from './escrow';

function makeAlice(E, host) {
  function showPaymentBalance(name, paymentP) {
    E(paymentP)
      .getXferBalance()
      .then(amount => console.log(name, ' xfer balance ', amount));
  }

  const escrowSrc = `(${escrowExchange})`;

  let initialized = false;
  let myMoneyPurseP;
  let myStockPurseP;

  function init(myMoneyPurse, myStockPurse) {
    myMoneyPurseP = Promise.resolve(myMoneyPurse);
    myStockPurseP = Promise.resolve(myStockPurse);
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

      showPaymentBalance('alice tix', ticketP);

      const tIssuerP = E(ticketP).getIssuer();
      const moneyIssuerP = E(myMoneyPurseP).getIssuer();
      const stockIssuerP = E(myStockPurseP).getIssuer();

      function verifyTix([tIssuer, mIssuer, sIssuer]) {
        const mLabel = harden({ issuer: mIssuer, description: 'clams' });
        const clams10 = harden({ label: mLabel, data: 10 });
        const sLabel = harden({ issuer: sIssuer, description: 'fudco' });
        const fudco7 = harden({ label: sLabel, data: 7 });

        const tDesc = harden({
          contractSrc: escrowSrc,
          terms: [clams10, fudco7],
          seatDesc: [clams10, fudco7],
        });
        const tLabel = harden({ issuer: tIssuer, description: tDesc });
        const tix1 = harden({ label: tLabel, data: 1 });

        // In order for alice to get a meaningful exclusive on the
        // ticket, she must know that the deal offered is the one she
        // expects. If she already has a prior relationship with
        // tIssuer, then she could just describe the exclusive amount
        // as the number 1 below, rather than tix1. However, in this
        // case, she has not heard of this issuer prior to receiving
        // the ticket.
        //
        // So she instead provides a full description of the amount,
        // where this description contains *almost* everything she
        // needs to verify that this is the deal she wants. We assume
        // that Alice does have a prior to this contract host. Once
        // this host redeems the ticket, then we know that it was
        // issued by this contract host and that the description is
        // accurate.
        //
        // TODO: Test all variations of the expectations above and see
        // that they fail.
        return E(tIssuer).getExclusive(tix1, ticketP, 'verified tix');
      }
      const verifiedTixP = Promise.all([
        tIssuerP,
        moneyIssuerP,
        stockIssuerP,
      ]).then(verifyTix);

      showPaymentBalance('verified tix', verifiedTixP);

      // TODO: get an exclusive on the ticket using the full assay
      // style, so Alice knows that the ticket means what she expects.

      const seatP = E(host).redeem(verifiedTixP);
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
