/* global E */
// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

function escrowExchange(terms, ticketMaker) {
  const { moneyNeeded, stockNeeded } = terms;

  function makeTransfer(srcPaymentP, amount, wonR, refundR) {
    const { issuer } = amount.label;
    const escrowPaymentP = E(issuer).getExclusive(
      srcPaymentP,
      amount,
      'escrow',
    );
    return harden({
      phase1() {
        return escrowPaymentP;
      },
      phase2() {
        wonR(escrowPaymentP);
        refundR(null);
      },
      abort(reason) {
        wonR(Promise.reject(reason));
        refundR(escrowPaymentP);
      },
    });
  }

  let aR;
  const aP = new Promise(r => (aR = r));
  let bR;
  const bP = new Promise(r => (bR = r));

  Promise.all([aP, bP]).then((a, b) => {
    // Money section

    const moneyTransfer = makeTransfer(
      a.moneyPaymentP,
      moneyNeeded,
      b.moneyWonR,
      a.moneyRefundR,
    );

    // Stock section

    const stockTransfer = makeTransfer(
      b.stockPaymentP,
      stockNeeded,
      a.stockWonR,
      b.stockRefundR,
    );

    // Set it all in motion optimistically.

    function failOnly(reasonP) {
      return Promise.resolve(reasonP).then(reason => Promise.reject(reason));
    }

    // TODO: Use Promise.allSettled on the later phases to detect
    // quiescence for better testing.
    Promise.race([
      Promise.all([moneyTransfer.phase1(), stockTransfer.phase1()]),
      failOnly(a.cancelP),
      failOnly(b.cancelP),
    ]).then(
      _ => {
        moneyTransfer.phase2();
        stockTransfer.phase2();
      },
      reason => {
        moneyTransfer.abort(reason);
        stockTransfer.abort(reason);
      },
    );
  });

  // Seats

  const aliceSeat = harden({
    offer(moneyPaymentP, cancelP) {
      let stockWonR;
      let moneyRefundR;
      const result = harden({
        stockWonP: new Promise(r => (stockWonR = r)),
        moneyRefundP: new Promise(r => (moneyRefundR = r)),
      });

      aR(
        harden({
          moneyPaymentP,
          cancelP,
          stockWonR,
          moneyRefundR,
        }),
      );

      return result;
    },
  });
  const aliceJoinTicket = ticketMaker.make('alice join', aliceSeat);

  const bobSeat = harden({
    offer(stockPaymentP, cancelP) {
      let moneyWonR;
      let stockRefundR;
      const result = harden({
        moneyWonP: new Promise(r => (moneyWonR = r)),
        stockRefundP: new Promise(r => (stockRefundR = r)),
      });

      bR(
        harden({
          stockPaymentP,
          cancelP,
          moneyWonR,
          stockRefundR,
        }),
      );

      return result;
    },
  });
  const bobJoinTicket = ticketMaker.make('bob join', bobSeat);

  return harden({ aliceJoinTicket, bobJoinTicket });
}

export { escrowExchange };
