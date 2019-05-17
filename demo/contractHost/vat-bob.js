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
  let myMoneyPursePresence;
  let moneyIssuerPresence;
  let myStockPursePresence;
  let stockIssuerPresence;
  // eslint-disable-next-line no-unused-vars
  let chitIssuerPresence;
  let timerPresence;

  function init(myMoneyPurseP, myStockPurseP, timerP) {
    myMoneyPurseP = Promise.resolve(myMoneyPurseP);
    const moneyIssuerP = E(myMoneyPurseP).getIssuer();
    myStockPurseP = Promise.resolve(myStockPurseP);
    const stockIssuerP = E(myStockPurseP).getIssuer();
    const chitIssuerP = E(host).getChitIssuer();
    timerP = Promise.resolve(timerP);

    return Promise.all([
      myMoneyPurseP,
      moneyIssuerP,
      myStockPurseP,
      stockIssuerP,
      chitIssuerP,
      timerP,
    ]).then(
      ([
        moneyPurse,
        moneyIssuer,
        stockPurse,
        stockIssuer,
        chitIssuer,
        timer,
      ]) => {
        myMoneyPursePresence = moneyPurse;
        moneyIssuerPresence = moneyIssuer;
        myStockPursePresence = stockPurse;
        stockIssuerPresence = stockIssuer;
        chitIssuerPresence = chitIssuer;
        timerPresence = timer;

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

      const moneyNeededP = E(E(moneyIssuerPresence).getAssay()).make(10);
      const stockNeededP = E(E(stockIssuerPresence).getAssay()).make(7);

      return Promise.all([moneyNeededP, stockNeededP]).then(terms => {
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
      });
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

      const moneyNeededP = E(E(moneyIssuerPresence).getAssay()).make(10);
      const stockNeededP = E(E(stockIssuerPresence).getAssay()).make(7);

      return Promise.all([
        moneyNeededP,
        stockNeededP,
        timerPresence,
        'singularity',
      ]).then(terms => {
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
      });
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
