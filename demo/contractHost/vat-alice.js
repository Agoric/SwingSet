// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { insist } from '../../collections/insist';
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
  let moneyIssuerP;
  let myStockPurseP;
  let stockIssuerP;
  let chitIssuerP;

  function init(myMoneyPurse, myStockPurse) {
    myMoneyPurseP = Promise.resolve(myMoneyPurse);
    moneyIssuerP = E(myMoneyPurseP).getIssuer();
    myStockPurseP = Promise.resolve(myStockPurse);
    stockIssuerP = E(myStockPurseP).getIssuer();
    chitIssuerP = E(host).getChitIssuer();

    initialized = true;
    // eslint-disable-next-line no-use-before-define
    return alice; // alice and init use each other
  }

  const alice = harden({
    init,
    payBobWell(bob) {
      insist(initialized)`\
ERR: payBobWell called before init()`;

      const paymentP = E(myMoneyPurseP).withdraw(10);
      return E(bob).buy('shoe', paymentP);
    },

    invite(allegedChitPaymentP) {
      insist(initialized)`\
ERR: invite called before init()`;

      showPaymentBalance('alice chit', allegedChitPaymentP);

      const allegedMetaAmountP = E(allegedChitPaymentP).getXferBalance();

      function verifyChit([
        allegedMetaAmount,
        moneyIssuerPresence,
        stockIssuerPresence,
        chitIssuerPresence,
      ]) {
        const clamsLabel = harden({
          issuer: moneyIssuerPresence,
          description: 'clams',
        });
        const clams10 = harden({ label: clamsLabel, quantity: 10 });
        const fudcoLabel = harden({
          issuer: stockIssuerPresence,
          description: 'fudco',
        });
        const fudco7 = harden({ label: fudcoLabel, quantity: 7 });

        const baseDesc = harden({
          contractSrc: escrowSrc,
          terms: [clams10, fudco7],
          seatDesc: [0, clams10, fudco7],
        });
        const baseAmount = allegedMetaAmount.quantity;
        insist(baseAmount !== null)`\
Payment empty ${allegedMetaAmount}`;
        const baseIssuerPresence = baseAmount.label.issuer;
        const baseLabel = harden({
          issuer: baseIssuerPresence,
          description: baseDesc,
        });
        const baseOneAmount = harden({ label: baseLabel, quantity: 1 });
        const metaLabel = harden({
          issuer: chitIssuerPresence,
          description: 'contract host',
        });
        const metaOneAmount = harden({
          label: metaLabel,
          quantity: baseOneAmount,
        });

        return E(chitIssuerP).getExclusive(
          metaOneAmount,
          allegedChitPaymentP,
          'verified chit',
        );
      }
      const verifiedChitP = Promise.all([
        allegedMetaAmountP,
        moneyIssuerP,
        stockIssuerP,
        chitIssuerP,
      ]).then(verifyChit);

      showPaymentBalance('verified chit', verifiedChitP);

      const seatP = E(host).redeem(verifiedChitP);
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
