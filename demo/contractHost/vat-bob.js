// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { insist } from '../../collections/insist';
import { allSettled } from '../../collections/allSettled';
import { escrowExchangeSrc } from './escrow';
import { coveredCallSrc } from './coveredCall';

function makeBob(E, host) {
  // TODO is there a better pattern for initializing to a bunch of
  // presences rather than promises?
  let initialized = false;
  let timerPresence;
  // eslint-disable-next-line no-unused-vars
  let chitIssuerPresence;

  let myMoneyPursePresence;
  // eslint-disable-next-line no-unused-vars
  let moneyIssuerPresence;
  let moneyNeededAmount;

  let myStockPursePresence;
  // eslint-disable-next-line no-unused-vars
  let stockIssuerPresence;
  let stockNeededAmount;

  function init(timerP, myMoneyPurseP, myStockPurseP) {
    timerP = Promise.resolve(timerP);
    const chitIssuerP = E(host).getChitIssuer();

    myMoneyPurseP = Promise.resolve(myMoneyPurseP);
    const moneyIssuerP = E(myMoneyPurseP).getIssuer();
    const moneyNeededP = E(E(moneyIssuerP).getAssay()).make(10);

    myStockPurseP = Promise.resolve(myStockPurseP);
    const stockIssuerP = E(myStockPurseP).getIssuer();
    const stockNeededP = E(E(stockIssuerP).getAssay()).make(7);

    return Promise.all([
      timerP,
      chitIssuerP,

      myMoneyPurseP,
      moneyIssuerP,
      moneyNeededP,

      myStockPurseP,
      stockIssuerP,
      stockNeededP,
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
      ]) => {
        timerPresence = timer;
        chitIssuerPresence = chitIssuer;

        myMoneyPursePresence = moneyPurse;
        moneyIssuerPresence = moneyIssuer;
        moneyNeededAmount = moneyNeeded;

        myStockPursePresence = stockPurse;
        stockIssuerPresence = stockIssuer;
        stockNeededAmount = stockNeeded;

        initialized = true;
        /* eslint-disable-next-line no-use-before-define */
        return bob; // bob and init use each other
      },
    );
  }

  const bob = harden({
    init,

    /**
     * This is not an imperative to Bob to buy something but rather
     * the opposite. It is a request by a client to buy something from
     * Bob, and therefore a request that Bob sell something. OO naming
     * is a bit confusing here.
     */
    buy(desc, paymentP) {
      insist(initialized)`\
ERR: buy called before init()`;

      /* eslint-disable-next-line no-unused-vars */
      let amount;
      let good;
      desc = `${desc}`;
      switch (desc) {
        case 'shoe': {
          amount = 10;
          good = 'If it fits, ware it.';
          break;
        }
        default: {
          throw new Error(`unknown desc: ${desc}`);
        }
      }

      return E(myMoneyPursePresence)
        .deposit(10, paymentP)
        .then(_ => good);
    },

    tradeWell(alice) {
      console.log('++ bob.tradeWell starting');
      insist(initialized)`\
ERR: tradeWell called before init()`;

      const terms = harden([moneyNeededAmount, stockNeededAmount]);
      const chitsP = E(host).start(escrowExchangeSrc, terms);
      const aliceChitP = chitsP.then(chits => chits[0]);
      const bobChitP = chitsP.then(chits => chits[1]);
      const doneP = Promise.all([
        E(alice).invite(aliceChitP),
        E(bob).invite(bobChitP),
      ]);
      doneP.then(
        _res => console.log('++ bob.tradeWell done'),
        rej => console.log('++ bob.tradeWell reject: ', rej),
      );
      return doneP;
    },

    /**
     * As with 'buy', the naming is awkward. A client is inviting
     * this object, asking it to join in a contract instance. It is not
     * requesting that this object invite anything.
     */
    invite(chitP) {
      insist(initialized)`\
ERR: invite called before init()`;

      const seatP = E(host).redeem(chitP);
      const stockPaymentP = E(myStockPursePresence).withdraw(7);
      E(seatP).offer(stockPaymentP);
      const doneP = allSettled([
        E(seatP)
          .getWinnings()
          .then(winnings => E(myMoneyPursePresence).deposit(10, winnings))
          .then(_ => 10),
        E(seatP)
          .getRefund()
          .then(refund => refund && E(myStockPursePresence).deposit(7, refund))
          .then(_ => 7),
      ]);
      return doneP;
    },

    offerAliceOption(alice) {
      console.log('++ bob.offerAliceOption starting');
      insist(initialized)`\
ERR: offerAliceOption called before init()`;

      const terms = harden([
        moneyNeededAmount,
        stockNeededAmount,
        timerPresence,
        'singularity',
      ]);
      const bobChitP = E(host).start(coveredCallSrc, terms);
      const bobSeatP = E(host).redeem(bobChitP);
      const stockPaymentP = E(myStockPursePresence).withdraw(7);
      const aliceChitP = E(bobSeatP).offer(stockPaymentP);
      const doneP = Promise.all([
        E(alice).acceptOption(aliceChitP),
        E(bob).concludeOption(bobSeatP),
      ]);
      doneP.then(
        _res => console.log('++ bob.offerAliceOption done'),
        rej => console.log('++ bob.offerAliceOption reject: ', rej),
      );
      return doneP;
    },

    concludeOption(bobSeatP) {
      insist(initialized)`\
ERR: concludeOption called before init()`;

      const doneP = allSettled([
        E(bobSeatP)
          .getWinnings()
          .then(winnings => E(myMoneyPursePresence).deposit(10, winnings))
          .then(_ => 10),
        E(bobSeatP)
          .getRefund()
          .then(refund => refund && E(myStockPursePresence).deposit(7, refund))
          .then(_ => 7),
      ]);
      return doneP;
    },
  });
  return bob;
}

function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(syscall, state, E =>
    harden({
      makeBob(host) {
        return harden(makeBob(E, host));
      },
    }),
  );
}
export default harden(setup);
