// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { insist } from '../../collections/insist';
import { escrowExchangeSrc } from './escrow';
import { coveredCallSrc } from './coveredCall';
import { exchangeChitAmount, makeCollect } from './chit';

function makeAlice(E, host) {
  const collect = makeCollect(E);

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
      return collect(seatP, myStockPurseP, myMoneyPurseP);
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
      return collect(seatP, myStockPurseP, myMoneyPurseP);
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
