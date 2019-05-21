// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { insist } from '../../collections/insist';
import { allSettled } from '../../collections/allSettled';
// eslint-disable-next-line no-unused-vars
import { escrowExchangeSrc } from './escrow';
import { coveredCallSrc } from './coveredCall';
import { exchangeChitAmount } from './chit';

function makeFred(E, host) {
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
  // eslint-disable-next-line no-unused-vars
  let moneyNeededAmount;

  let myStockPursePresence;
  let stockIssuerPresence;
  // eslint-disable-next-line no-unused-vars
  let stockNeededAmount;

  // eslint-disable-next-line no-unused-vars
  let myFinPursePresence;
  // eslint-disable-next-line no-unused-vars
  let finIssuerPresence;
  // eslint-disable-next-line no-unused-vars
  let finNeededAmount;

  function init(timerP, myMoneyPurseP, myStockPurseP, myFinPurseP) {
    timerP = Promise.resolve(timerP);
    const chitIssuerP = E(host).getChitIssuer();

    myMoneyPurseP = Promise.resolve(myMoneyPurseP);
    const moneyIssuerP = E(myMoneyPurseP).getIssuer();
    const moneyNeededP = E(E(moneyIssuerP).getAssay()).make(10);

    myStockPurseP = Promise.resolve(myStockPurseP);
    const stockIssuerP = E(myStockPurseP).getIssuer();
    const stockNeededP = E(E(stockIssuerP).getAssay()).make(7);

    myFinPurseP = Promise.resolve(myFinPurseP);
    const finIssuerP = E(myFinPurseP).getIssuerP();
    const finNeededP = E(E(finIssuerP).getAssay()).make(55);

    return Promise.all([
      timerP,
      chitIssuerP,

      myMoneyPurseP,
      moneyIssuerP,
      moneyNeededP,

      myStockPurseP,
      stockIssuerP,
      stockNeededP,

      myFinPurseP,
      finIssuerP,
      finNeededP,
    ]).then(
      ([
        timer,
        chitIssuer,

        moneyPurse,
        moneyIssuer,
        moneyNeeded,

        stockPurse,
        stockIssuer,
        stockNeeded,

        finPurse,
        finIssuer,
        finNeeded,
      ]) => {
        timerPresence = timer;
        chitIssuerPresence = chitIssuer;

        myMoneyPursePresence = moneyPurse;
        moneyIssuerPresence = moneyIssuer;
        moneyNeededAmount = moneyNeeded;

        myStockPursePresence = stockPurse;
        stockIssuerPresence = stockIssuer;
        stockNeededAmount = stockNeeded;

        myFinPursePresence = finPurse;
        finIssuerPresence = finIssuer;
        finNeededAmount = finNeeded;

        initialized = true;
        // eslint-disable-next-line no-use-before-define
        return fred; // fred and init use each other
      },
    );
  }

  const fred = harden({
    init,
    acceptOptionOffer(allegedChitPaymentP) {
      insist(initialized)`\
ERR: invite called before init()`;

      showPaymentBalance('fred chit', allegedChitPaymentP);

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
  });
  return fred;
}

function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(syscall, state, E =>
    harden({
      makeFred(host) {
        return harden(makeFred(E, host));
      },
    }),
  );
}
export default harden(setup);
