/* global E */
// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

function escrowExchange(a, b) {
  // eventual equality
  function join(xP, yP) {
    return Promise.all([xP, yP]).then(([x, y]) => {
      if (Object.is(x, y)) {
        return x;
      }
      throw new Error('not the same');
    });
  }

  // a from Alice, b from Bob
  function makeTransfer(srcPaymentP, refundPurseP, dstPurseP, amount) {
    const issuerP = join(E(srcPaymentP).getIssuer(), E(dstPurseP).getIssuer());
    const escrowPaymentP = E(issuerP).takePayment(
      amount,
      srcPaymentP,
      'escrow',
    );
    return harden({
      phase1() {
        return escrowPaymentP;
      },
      phase2() {
        return E(dstPurseP).deposit(amount, escrowPaymentP);
      },
      abort() {
        return E(refundPurseP).deposit(amount, escrowPaymentP);
      },
    });
  }

  function failOnly(cancellationP) {
    return Promise.resolve(cancellationP).then(cancellation => {
      throw cancellation;
    });
  }

  const aT = makeTransfer(
    a.moneySrcP,
    a.moneyRefundP,
    b.moneyDstP,
    b.moneyNeeded,
  );
  const bT = makeTransfer(
    b.stockSrcP,
    b.stockRefundP,
    a.stockDstP,
    a.stockNeeded,
  );
  return Promise.race([
    Promise.all([aT.phase1(), bT.phase1()]),
    failOnly(a.cancellationP),
    failOnly(b.cancellationP),
  ]).then(
    _x => Promise.all([aT.phase2(), bT.phase2()]),
    _ex => Promise.all([aT.abort(), bT.abort()]),
  );
}

export default harden(escrowExchange);
