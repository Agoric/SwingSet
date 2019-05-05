/* global E */
// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { makePromise } from '../../src/kernel/makePromise';

// For clarity, the code below internally speaks of a scenario is
// which Alice is trading some of her money for some of Bob's
// stock. However, for generality, the API does not expose names like
// "alice", "bob", "money", or "stock". Rather, Alice and Bob are
// players 0 and 1. Money are the rights transfered from player 0 to
// 1, and Stock are the rights transfered from 1 to 0.

function escrowExchange(terms, ticketMaker) {
  const [moneyNeeded, stockNeeded] = terms;

  function makeTransfer(amount, srcPaymentP) {
    const { issuer } = amount.label;
    const escrowP = E(issuer).getExclusive(amount, srcPaymentP, 'escrow');
    const winnings = makePromise();
    const refund = makePromise();
    return harden({
      phase1() {
        return escrowP;
      },
      phase2() {
        winnings.res(escrowP);
        refund.res(null);
      },
      abort(reason) {
        winnings.reject(reason);
        refund.res(escrowP);
      },
      getWinnings() {
        return winnings.p;
      },
      getRefund() {
        return refund.p;
      },
    });
  }

  // Promise wiring

  const moneyPayment = makePromise();
  const moneyTransfer = makeTransfer(moneyNeeded, moneyPayment.p);

  const stockPayment = makePromise();
  const stockTransfer = makeTransfer(stockNeeded, stockPayment.p);

  // TODO Use cancellation tokens instead.
  const aliceCancel = makePromise();
  const bobCancel = makePromise();

  // Set it all in motion optimistically.

  const decisionP = Promise.race([
    Promise.all([moneyTransfer.phase1(), stockTransfer.phase1()]),
    aliceCancel.p,
    bobCancel.p]);
  // TODO: Use Promise.allSettled on these later phases to detect
  // quiescence, for better testing.
  decisionP.then(
    _ => { moneyTransfer.phase2(); stockTransfer.phase2(); },
    reason => { moneyTransfer.abort(reason); stockTransfer.abort(reason); }
  );

  // Seats

  const aliceSeat = harden({
    offer: moneyPayment.res,
    cancel: aliceCancel.reject,
    getWinnings: stockTransfer.getWinnings,
    getRefund: moneyTransfer.getRefund,      
  });

  const bobSeat = harden({
    offer: stockPayment.res,
    cancel: bobCancel.reject,
    getWinnings: moneyTransfer.getWinnings,
    getRefund: stockTransfer.getRefund,      
  });

  return harden([
    ticketMaker.make([moneyNeeded, stockNeeded], aliceSeat),
    ticketMaker.make([stockNeeded, moneyNeeded], bobSeat)
  ]);
}

export { escrowExchange };
