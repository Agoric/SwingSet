/* global E */
// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { escrowExchange } from './escrow';

function coveredCall(terms, chitMaker) {
  const [moneyNeeded, stockNeeded, timer, deadline] = terms;

  const [aliceChit, bobChit] = escrowExchange([moneyNeeded, stockNeeded]);

  const aliceEscrowSeat = chitMaker.redeem(aliceChit);
  const bobEscrowSeat = chitMaker.redeem(bobChit);

  // Seats

  timer.whenPast(deadline, _ => bobEscrowSeat.cancel('expired'));

  const bobSeat = harden({
    offer(stockPayment) {
      const sIssuer = stockNeeded.label.issuer;
      E(sIssuer)
        .getExclusive(stockNeeded, stockPayment, 'prePay')
        .then(prePayment => {
          bobEscrowSeat.offer(prePayment);
          return chitMaker.make([moneyNeeded, stockNeeded], aliceEscrowSeat);
        });
    },
    getWinnings: bobEscrowSeat.getWinnings,
    getRefund: bobEscrowSeat.getRefund,
  });

  return chitMaker.make([stockNeeded, moneyNeeded], bobSeat);
}

export { coveredCall };
