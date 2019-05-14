// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { insist } from '../../collections/insist';
import { allSettled } from '../../collections/allSettled';
import { escrowExchange } from './escrow';

function makeBob(E, host) {
  const escrowSrc = `(${escrowExchange})`;

  let initialized = false;
  let myMoneyPurseP;
  let moneyIssuerP;
  let myStockPurseP;
  let stockIssuerP;

  function init(myMoneyPurse, myStockPurse) {
    myMoneyPurseP = Promise.resolve(myMoneyPurse);
    myStockPurseP = Promise.resolve(myStockPurse);
    moneyIssuerP = E(myMoneyPurseP).getIssuer();
    stockIssuerP = E(myStockPurseP).getIssuer();
    initialized = true;
    /* eslint-disable-next-line no-use-before-define */
    return bob; // bob and init use each other
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

      return E(myMoneyPurseP)
        .deposit(10, paymentP)
        .then(_ => good);
    },

    tradeWell(alice) {
      console.log('++ bob.tradeWell starting');
      insist(initialized)`\
ERR: tradeWell called before init()`;

      const moneyNeededP = E(E(moneyIssuerP).getAssay()).make(10);
      const stockNeededP = E(E(stockIssuerP).getAssay()).make(7);

      return Promise.all([moneyNeededP, stockNeededP]).then(terms => {
        const chitsP = E(host).start(escrowSrc, terms);
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
      const stockPaymentP = E(myStockPurseP).withdraw(7);
      E(seatP).offer(stockPaymentP);
      const doneP = allSettled([
        E(seatP)
          .getWinnings()
          .then(winnings => E(myMoneyPurseP).deposit(10, winnings))
          .then(_ => 10),
        E(seatP)
          .getRefund()
          .then(refund => refund && E(myStockPurseP).deposit(7, refund))
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
