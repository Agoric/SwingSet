/* global E */
// Copyright (C) 2019 Agoric, under Apache License 2.0
// @flow

import harden from '@agoric/harden';

/* ::
import type { Amount, Payment } from './issuers.flow';
import type { InviteMaker, Timer } from './issuers.flow';

import { E } from './issuers.flow';

import type { EscrowSeat } from './escrow';

export interface CoveredCallSeat<Money, Stock> {
  offer(Payment<Stock>): Promise<Payment<mixed>>;
  getWinnings(): Promise<Payment<Money>>;
  getRefund(): Promise<Payment<Stock> | null>;
};

*/

function coveredCall /* :: <Money, Stock> */(
  terms /* : [any, Amount<Money>, Amount<Stock>, Promise<Timer>, number] */,
  inviteMaker /* : InviteMaker */,
) {
  const [
    escrowExchangeInstallationP,
    moneyNeeded,
    stockNeeded,
    timerP,
    deadline,
  ] = terms;

  const pairP = E(escrowExchangeInstallationP).spawn(
    harden([moneyNeeded, stockNeeded]),
  );

  // ISSUE: type of redeem() is by inspection of contract source; we use any.
  // $FlowFixMe  E.resolve ... missing in statics of function type
  const aliceEscrowSeatP /* : Promise<EscrowSeat<Money, Stock>> */ = E.resolve(
    pairP,
  ).then(pair => inviteMaker.redeem(pair[0]));
  // $FlowFixMe  E.resolve ... missing in statics of function type
  const bobEscrowSeatP /* : Promise<EscrowSeat<Stock, Money>> */ = E.resolve(
    pairP,
  ).then(pair => inviteMaker.redeem(pair[1]));

  // Seats

  E(timerP)
    .delayUntil(deadline)
    .then(_ => E(bobEscrowSeatP).cancel('expired'));

  function ep /* :: <T> */(x /* : T */) /* : Promise<T> */ {
    return Promise.resolve(x);
  }

  const bobSeat /* : CoveredCallSeat<Money, Stock> */ = harden({
    offer(stockPayment /* : Payment<Stock> */) {
      const sIssuer = stockNeeded.label.issuer;
      return E(ep(sIssuer))
        .getExclusive(stockNeeded, ep(stockPayment), 'prePay')
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

// $FlowFixMe flow thinks "function [1] should not be coerced"
const coveredCallSrc = `(${coveredCall})`;

export { coveredCall, coveredCallSrc };
