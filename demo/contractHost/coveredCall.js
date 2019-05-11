/* global E */
// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { escrowExchange } from './escrow';

function coveredCall(terms, ticketMaker) {
  const [moneyNeeded, stockNeeded, timer, deadline] = terms;

  const [aliceTix, bobTix] = escrowExchange([moneyNeeded, stockNeeded]);

  const aliceEscrowSeat = ticketMaker.redeem(aliceTix);
  const bobEscrowSeat = ticketMaker.redeem(bobTix);

  // Seats

  timer.whenPast(deadline, _ => bobEscrowSeat.cancel('expired'));

  const bobSeat = harden({
    offer(stockPayment) {
      const sIssuer = stockNeeded.label.issuer;
      E(sIssuer)
        .getExclusive(stockNeeded, stockPayment, 'prePay')
        .then(prePayment => {
          bobEscrowSeat.offer(prePayment);
          return ticketMaker.make([moneyNeeded, stockNeeded], aliceEscrowSeat);
        });
    },
    getWinnings: bobEscrowSeat.getWinnings,
    getRefund: bobEscrowSeat.getRefund,
  });

  return ticketMaker.make([stockNeeded, moneyNeeded], bobSeat);
}

export { coveredCall };
