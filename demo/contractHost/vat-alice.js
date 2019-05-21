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

  let initialized = false;
  let timerP;
  let chitIssuerP;

  let myMoneyPurseP;
  let moneyIssuerP;

  let myStockPurseP;
  let stockIssuerP;

  /* eslint-disable-next-line no-unused-vars */
  let myOptFinPurseP;
  /* eslint-disable-next-line no-unused-vars */
  let optFinIssuerP;

  /* eslint-disable-next-line no-unused-vars */
  let optFredP;

  function init(
    timer,
    myMoneyPurse,
    myStockPurse,
    myOptFinPurse = undefined,
    optFred = undefined,
  ) {
    timerP = Promise.resolve(timer);
    chitIssuerP = E(host).getChitIssuer();

    myMoneyPurseP = Promise.resolve(myMoneyPurse);
    moneyIssuerP = E(myMoneyPurseP).getIssuer();

    myStockPurseP = Promise.resolve(myStockPurse);
    stockIssuerP = E(myStockPurseP).getIssuer();

    if (myOptFinPurseP) {
      myOptFinPurseP = Promise.resolve(myOptFinPurse);
      optFinIssuerP = E(myOptFinPurseP).getIssuer();
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

      const paymentP = E(myMoneyPurseP).withdraw(10);
      return E(bob).buy('shoe', paymentP);
    },

    invite(allegedChitPaymentP) {
      insist(initialized)`\
ERR: invite called before init()`;

      showPaymentBalance('alice chit', allegedChitPaymentP);

      const allegedMetaAmountP = E(allegedChitPaymentP).getXferBalance();

      const verifiedChitP = Promise.resolve(allegedMetaAmountP).then(
        allegedMetaAmount => {
          const clams10 = harden({
            label: {
              issuer: moneyIssuerP,
              description: 'clams',
            },
            quantity: 10,
          });
          const fudco7 = harden({
            label: {
              issuer: stockIssuerP,
              description: 'fudco',
            },
            quantity: 7,
          });

          const metaOneAmountP = exchangeChitAmount(
            allegedMetaAmount,
            chitIssuerP,
            escrowExchangeSrc,
            [clams10, fudco7],
            0,
            clams10,
            fudco7,
          );

          return Promise.resolve(metaOneAmountP).then(metaOneAmount =>
            E(chitIssuerP).getExclusive(
              metaOneAmount,
              allegedChitPaymentP,
              'verified chit',
            ),
          );
        },
      );

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

      const verifiedChitP = Promise.resolve(allegedMetaAmountP).then(
        allegedMetaAmount => {
          const smackers10 = harden({
            label: {
              issuer: moneyIssuerP,
              description: 'smackers',
            },
            quantity: 10,
          });
          const yoyodyne7 = harden({
            label: {
              issuer: stockIssuerP,
              description: 'yoyodyne',
            },
            quantity: 7,
          });

          const metaOneAmountP = exchangeChitAmount(
            allegedMetaAmount,
            chitIssuerP,
            coveredCallSrc,
            [smackers10, yoyodyne7, timerP, 'singularity'],
            'holder',
            smackers10,
            yoyodyne7,
          );

          return Promise.resolve(metaOneAmountP).then(metaOneAmount =>
            E(chitIssuerP).getExclusive(
              metaOneAmount,
              allegedChitPaymentP,
              'verified chit',
            ),
          );
        },
      );

      showPaymentBalance('verified chit', verifiedChitP);

      const seatP = E(host).redeem(verifiedChitP);
      const moneyPaymentP = E(myMoneyPurseP).withdraw(10);
      E(seatP).offer(moneyPaymentP);
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

    acceptOptionForFred(_allegedChitPaymentP) {
      insist(initialized)`\
ERR: invite called before init()`;
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
