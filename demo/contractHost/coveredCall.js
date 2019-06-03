/* global E */
// Copyright (C) 2019 Agoric, under Apache License 2.0
// @flow

import harden from '@agoric/harden';

import { escrowExchange } from './escrow';

/* ::
import type { G, Amount, Assay, Label } from './issuers.flow';
import type { InviteMaker, Timer } from './issuers.flow';

import { E } from './issuers.flow';

*/

function coveredCall /* :: <Money, Stock> */(
  terms /* : [Amount<Money>, Amount<Stock>, Promise<Timer>, number] */,
  inviteMaker /* : InviteMaker */,
) {
  const [moneyNeeded, stockNeeded, timerP, deadline] = terms;

  const [aliceInvite, bobInvite] = escrowExchange(
    [moneyNeeded, stockNeeded],
    inviteMaker,
  );

  const aliceEscrowSeatP = inviteMaker.redeem(aliceInvite);
  const bobEscrowSeatP = inviteMaker.redeem(bobInvite);

  // Seats

  // eslint-disable-next-line prettier/prettier
  E/* :: <Timer> */(timerP)
    .delayUntil(deadline)
    .then(_ => E(bobEscrowSeatP).cancel('expired'));

  const bobSeat = harden({
    offer(stockPayment) {
      const sIssuer = stockNeeded.label.issuer;
      return E(sIssuer)
        .getExclusive(stockNeeded, stockPayment, 'prePay')
        .then(prePayment => {
          E(bobEscrowSeatP).offer(prePayment);
          return inviteMaker.make('holder', aliceEscrowSeatP);
        });
    },
    getWinnings() {
      return E(bobEscrowSeatP).getWinnings();
    },
    getRefund() {
      return E(bobEscrowSeatP).getRefund();
    },
  });

  return inviteMaker.make('writer', bobSeat);
}

const coveredCallSrc = `\
(function() {
  ${escrowExchange}
  return (${coveredCall});
}())`;

export { coveredCall, coveredCallSrc };
