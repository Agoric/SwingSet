// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { insist } from '../../collections/insist';
import { allSettled } from '../../collections/allSettled';
import { escrowExchangeSrc } from './escrow';
import { coveredCallSrc } from './coveredCall';
import { exchangeChitAmount } from './chit';

function makeAlice(E, host) {
  function showPaymentBalance(name, paymentP) {
    E(paymentP)
      .getXferBalance()
      .then(amount => console.log(name, ' xfer balance ', amount));
  }

  // TODO is there a better pattern for initializing to a bunch of
  // presences rather than promises?
  let initialized = false;
  let timerPresence;
  let chitIssuerPresence;

  let myMoneyPursePresence;
  let moneyIssuerPresence;
  /* eslint-disable-next-line no-unused-vars */
  let moneyNeededAmount;

  let myStockPursePresence;
  let stockIssuerPresence;
  /* eslint-disable-next-line no-unused-vars */
  let stockNeededAmount;

  /* eslint-disable-next-line no-unused-vars */
  let myOptFinPursePresence;
  /* eslint-disable-next-line no-unused-vars */
  let optFinIssuerPresence;
  /* eslint-disable-next-line no-unused-vars */
  let optFinNeededAmount;

  /* eslint-disable-next-line no-unused-vars */
  let optFredP;

  function init(
    timerP,
    myMoneyPurseP,
    myStockPurseP,
    myOptFinPurseP = undefined,
    optFred = undefined,
  ) {
    timerP = Promise.resolve(timerP);
    chitIssuerP = E(host).getChitIssuer();

    myMoneyPurseP = Promise.resolve(myMoneyPurseP);
    moneyIssuerP = E(myMoneyPurseP).getIssuer();
    moneyNeededP = E(E(moneyIssuerP).getAssay()).make(10);

    myStockPurseP = Promise.resolve(myStockPurseP);
    stockIssuerP = E(myStockPurseP).getIssuer();
    stockNeededP = E(E(stockIssuerP).getAssay()).make(7);

    if (myOptFinPurseP) {
      myOptFinPurseP = Promise.resolve(myOptFinPurseP);
      optFinIssuerP = E(myOptFinPurseP).getIssuerP();
      optFinNeededP = E(E(optFinIssuerP).getAssay()).make(55);
    }
    optFredP = optFred;

    initialized = true;
    // eslint-disable-next-line no-use-before-define
    return alice; // alice and init use each other
  }

  const alice = harden({
    init,
    payBobWell(bob) {
      insist(initialized)`\
ERR: payBobWell called before init()`;

      const paymentP = E(myMoneyPursePresence).withdraw(10);
      return E(bob).buy('shoe', paymentP);
    },

    invite(allegedChitPaymentP) {
      insist(initialized)`\
ERR: invite called before init()`;

      showPaymentBalance('alice chit', allegedChitPaymentP);

      const allegedMetaAmountP = E(allegedChitPaymentP).getXferBalance();

      function verifyChit(allegedMetaAmount) {
        const clams10 = harden({
          label: {
            issuer: moneyIssuerPresence,
            description: 'clams',
          },
          quantity: 10,
        });
        const fudco7 = harden({
          label: {
            issuer: stockIssuerPresence,
            description: 'fudco',
          },
          quantity: 7,
        });

        const metaOneAmount = exchangeChitAmount(
          allegedMetaAmount,
          chitIssuerPresence,
          escrowExchangeSrc,
          [clams10, fudco7],
          0,
          clams10,
          fudco7,
        );

        return E(chitIssuerPresence).getExclusive(
          metaOneAmount,
          allegedChitPaymentP,
          'verified chit',
        );
      }
      const verifiedChitP = Promise.resolve(allegedMetaAmountP).then(
        verifyChit,
      );

      showPaymentBalance('verified chit', verifiedChitP);

      const seatP = E(host).redeem(verifiedChitP);
      const moneyPaymentP = E(myMoneyPursePresence).withdraw(10);
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
          .then(winnings => E(myStockPursePresence).deposit(7, winnings))
          .then(_ => 7),
        E(seatP)
          .getRefund()
          .then(refund => refund && E(myMoneyPursePresence).deposit(10, refund))
          .then(_ => 10),
      ]);
      return doneP;
    },

    acceptOption(allegedChitPaymentP) {
      if (optFredP) {
        return alice.acceptOptionForFred(allegedChitPaymentP);
      }
      return alice.acceptOptionDirectly(allegedChitPaymentP);
    },

    acceptOptionDirectly(allegedChitPaymentP) {
      insist(initialized)`\
ERR: invite called before init()`;

      showPaymentBalance('alice chit', allegedChitPaymentP);

      const allegedMetaAmountP = E(allegedChitPaymentP).getXferBalance();

      function verifyOptionsChit(allegedMetaAmount) {
        const smackers10 = harden({
          label: {
            issuer: moneyIssuerPresence,
            description: 'smackers',
          },
          quantity: 10,
        });
        const yoyodyne7 = harden({
          label: {
            issuer: stockIssuerPresence,
            description: 'yoyodyne',
          },
          quantity: 7,
        });

        const metaOneAmount = exchangeChitAmount(
          allegedMetaAmount,
          chitIssuerPresence,
          coveredCallSrc,
          [smackers10, yoyodyne7, timerPresence, 'singularity'],
          'holder',
          smackers10,
          yoyodyne7,
        );

        return E(chitIssuerPresence).getExclusive(
          metaOneAmount,
          allegedChitPaymentP,
          'verified chit',
        );
      }
      const verifiedChitP = Promise.resolve(allegedMetaAmountP).then(
        verifyOptionsChit,
      );

      showPaymentBalance('verified chit', verifiedChitP);

      const seatP = E(host).redeem(verifiedChitP);
      const moneyPaymentP = E(myMoneyPursePresence).withdraw(10);
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
          .then(winnings => E(myStockPursePresence).deposit(7, winnings))
          .then(_ => 7),
        E(seatP)
          .getRefund()
          .then(refund => refund && E(myMoneyPursePresence).deposit(10, refund))
          .then(_ => 10),
      ]);
      return doneP;
    },

    acceptOptionForFred(allegedChitPaymentP) {
      insist(initialized)`\
ERR: invite called before init()`;

      showPaymentBalance('alice chit', allegedChitPaymentP);

      const allegedMetaAmountP = E(allegedChitPaymentP).getXferBalance();

      function verifyOptionsChit(allegedMetaAmount) {
        const dough10 = harden({
          label: {
            issuer: moneyIssuerPresence,
            description: 'dough',
          },
          quantity: 10,
        });
        const wonka7 = harden({
          label: {
            issuer: stockIssuerPresence,
            description: 'wonka',
          },
          quantity: 7,
        });
        /* eslint-disable-next-line no-unused-vars */
        const fin55 = harden({
          label: {
            issuer: optFinIssuerPresence,
            description: 'fin',
          },
          quantity: 7,
        });

        const metaOneAmount = exchangeChitAmount(
          allegedMetaAmount,
          chitIssuerPresence,
          coveredCallSrc,
          [dough10, wonka7, timerPresence, 'singularity'],
          'holder',
          dough10,
          wonka7,
        );

        /* eslint-disable-next-line no-unused-vars */
        const metaXAmount = exchangeChitAmount(
          metaOneAmount, // XXX
          chitIssuerPresence,
          escrowExchangeSrc,
          [dough10, wonka7, timerPresence, 'singularity'],
          'holder',
          dough10,
          wonka7,
        );

        /* eslint-disable-next-line no-unused-vars */
        const optionsChit = E(chitIssuerPresence).getExclusive(
          metaOneAmount,
          allegedChitPaymentP,
          'verified chit AB',
        );

        return E(chitIssuerPresence).getExclusive(
          metaOneAmount,
          allegedChitPaymentP,
          'verified chit AF',
        );
      }
      const verifiedChitP = Promise.resolve(allegedMetaAmountP).then(
        verifyOptionsChit,
      );

      showPaymentBalance('verified chit', verifiedChitP);

      const seatP = E(host).redeem(verifiedChitP);
      const moneyPaymentP = E(myMoneyPursePresence).withdraw(10);
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
          .then(winnings => E(myStockPursePresence).deposit(7, winnings))
          .then(_ => 7),
        E(seatP)
          .getRefund()
          .then(refund => refund && E(myMoneyPursePresence).deposit(10, refund))
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
