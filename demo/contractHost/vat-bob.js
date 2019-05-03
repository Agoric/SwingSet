// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import escrowExchange from './escrow';

function makeBob(E, host) {
  const escrowSrc = `(${escrowExchange})`;

  let initialized = false;
  let myMoneyPurseP;
  let myMoneyIssuerP;
  let myStockPurseP;
  let myStockIssuerP;

  function init(myMoneyPurse, myStockPurse) {
    initialized = true;
    myMoneyPurseP = Promise.resolve(myMoneyPurse);
    myMoneyIssuerP = E(myMoneyPurse).getIssuer();
    myStockPurseP = Promise.resolve(myStockPurse);
    myStockIssuerP = E(myStockPurse).getIssuer();
    /* eslint-disable-next-line no-use-before-define */
    return bob; // bob and init use each other
  }

  const check = (_allegedSrc, _allegedSide) => {
    // for testing purposes, alice and bob are willing to play
    // any side of any contract, so that the failure we're testing
    // is in the contractHost's checking
  };

  const bob = harden({
    init,
    /**
     * This is not an imperative to Bob to buy something but rather
     * the opposite. It is a request by a client to buy something from
     * Bob, and therefore a request that Bob sell something. OO naming
     * is a bit confusing here.
     */
    buy(desc, paymentP) {
      if (!initialized) {
        console.log('++ ERR: buy called before init()');
      }
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

    tradeWell(alice, bobLies = false) {
      console.log('++ bob.tradeWell starting');
      if (!initialized) {
        console.log('++ ERR: tradeWell called before init()');
      }
      const tokensP = E(host).setup(escrowSrc);
      const aliceTokenP = tokensP.then(tokens => tokens[0]);
      const bobTokenP = tokensP.then(tokens => tokens[1]);
      let escrowSrcWeTellAlice = escrowSrc;
      if (bobLies) {
        escrowSrcWeTellAlice += 'NOT';
      }
      const doneP = Promise.all([
        E(alice).invite(aliceTokenP, escrowSrcWeTellAlice, 0),
        E(bob).invite(bobTokenP, escrowSrc, 1),
      ]);
      doneP.then(
        _res => console.log('++ bob.tradeWell done'),
        rej => console.log('++ bob.tradeWell reject', rej),
      );
      return doneP;
    },

    /**
     * As with 'buy', the naming is awkward. A client is inviting
     * this object, asking it to join in a contract instance. It is not
     * requesting that this object invite anything.
     */
    invite(tokenP, allegedSrc, allegedSide) {
      if (!initialized) {
        console.log('++ ERR: invite called before init()');
      }
      console.log('++ bob.invite start');
      check(allegedSrc, allegedSide);
      console.log('++ bob.invite passed check');
      /* eslint-disable-next-line no-unused-vars */
      let cancel;
      const b = harden({
        stockSrcP: E(myStockIssuerP).takePayment(
          7,
          myStockPurseP,
          'bobStockSrc',
        ),
        stockRefundP: E(myStockIssuerP).makeEmptyPurse('bobStockRefund'),
        moneyDstP: E(myMoneyIssuerP).makeEmptyPurse('bobMoneyDst'),
        moneyNeeded: 10,
        cancellationP: new Promise(r => (cancel = r)),
      });

      const doneP = E(host).play(tokenP, allegedSrc, allegedSide, b);
      return doneP.then(
        _ => {
          console.log('++ bob.invite doneP');
          return E(b.moneyDstP).getXferBalance();
        },
        rej => {
          console.log('++ bob.invite doneP reject', rej);
        },
      );
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
