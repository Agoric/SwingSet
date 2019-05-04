/* global E */
// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

function escrowExchange(terms, ticketMaker) {
  const { moneyIssuer, stockIssuer, moneyAmount, stockAmount } = terms;

  function makeTransfer(issuer, srcPaymentP, amount, payR, refundR) {
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
        payR(escrowPaymentP);
        refundR(null);
      },
      abort(reason) {
        payR(Promise.reject(reason));
        refundR(escrowPaymentP);
      },
    });
  }

  // Alice section

  let moneyPaymentR;
  const moneyPaymentP = new Promise(r => (moneyPaymentR = r));

  let moneyRefundR;
  const moneyRefundP = new Promise(r => (moneyRefundR = r));

  let stockPaidR;
  const stockPaidP = new Promise(r => (stockPaidR = r));

  let aliceCancelR;
  const aliceCancelP = new Promise(r => (aliceCancelR = r));

  const aliceWinnings = harden({
    moneyRefundP,
    stockPaidP,
  });

  // Bob section

  let stockPaymentR;
  const stockPaymentP = new Promise(r => (stockPaymentR = r));

  let stockRefundR;
  const stockRefundP = new Promise(r => (stockRefundR = r));

  let moneyPaidR;
  const moneyPaidP = new Promise(r => (moneyPaidR = r));

  let bobCancelR;
  const bobCancelP = new Promise(r => (bobCancelR = r));

  const bobWinnings = harden({
    stockRefundP,
    moneyPaidP,
  });

  // Money section

  const moneyTransfer = makeTransfer(
    moneyIssuer,
    moneyPaymentP,
    moneyAmount,
    moneyPaidR,
    moneyRefundR,
  );

  // Stock section

  const stockTransfer = makeTransfer(
    stockIssuer,
    stockPaymentP,
    stockAmount,
    stockPaidR,
    stockRefundR,
  );

  // Set it all in motion optimistically.

  function failOnly(reasonP) {
    return Promise.resolve(reasonP).then(reason => Promise.reject(reason));
  }

  Promise.race([
    Promise.all([moneyTransfer.phase1(), stockTransfer.phase1()]),
    failOnly(aliceCancelP),
    failOnly(bobCancelP),
  ]).then(
    _ => Promise.all([moneyTransfer.phase2(), stockTransfer.phase2()]),
    reason =>
      Promise.all([moneyTransfer.abort(reason), stockTransfer.abort(reason)]),
  );

  // Seats

  const aliceSeat = harden({
    offer(aliceMoneyPaymentP) {
      moneyPaymentR(aliceMoneyPaymentP);
      return ticketMaker.make('alice leave', aliceWinnings);
    },
    cancel(reason) {
      aliceCancelR(reason);
    },
  });
  const aliceJoinTicket = ticketMaker.make('alice join', aliceSeat);

  const bobSeat = harden({
    offer(bobStockPaymentP) {
      stockPaymentR(bobStockPaymentP);
      return ticketMaker.make('bob leave', bobWinnings);
    },
    cancel(reason) {
      bobCancelR(reason);
    },
  });
  const bobJoinTicket = ticketMaker.make('bob join', bobSeat);

  return harden({ aliceJoinTicket, bobJoinTicket });
}

export default harden(escrowExchange);
