// Copyright (C) 2019 Agoric, under Apache License 2.0

import Nat from '@agoric/nat';
import harden from '@agoric/harden';
import evaluate from '@agoric/evaluate';

import { insist } from '../../collections/insist';
import { mustBeComparable } from '../../collections/sameStructure';
import { makeMint, makeMetaIssuerController } from './issuers';
import makePromise from '../../src/kernel/makePromise';

function makeContractHost(E) {
  // Maps from base issuers to seats
  const seats = new WeakMap();

  const controller = makeMetaIssuerController('contract host');
  const metaIssuer = controller.getMetaIssuer();
  const metaAssay = metaIssuer.getAssay();

  function metaAmountOf(baseIssuer, baseQuantity) {
    const baseAssay = baseIssuer.getAssay();
    const baseAmount = baseAssay.make(baseQuantity);
    return metaAssay.make(baseAmount);
  }

  function redeem(allegedChitPayment) {
    const allegedMetaAmount = allegedChitPayment.getXferBalance();
    const metaAmount = metaAssay.vouch(allegedMetaAmount);
    insist(!metaAssay.isEmpty(metaAmount))`\
No chits left`;
    const baseAmount = metaAssay.quantity(metaAmount);
    const baseIssuer = baseAmount.label.issuer;
    insist(seats.has(baseIssuer))`\
Not a registered chit base issuer ${baseIssuer}`;
    const metaOneAmount = metaAmountOf(baseIssuer, 1);
    const metaSinkPurse = metaIssuer.makeEmptyPurse();
    metaSinkPurse.deposit(metaOneAmount, allegedChitPayment);
    // Would throw if failed. If we reach here, we got the chit!
    return seats.get(baseIssuer);
  }

  // The contract host is designed to have a long-lived credible
  // identity.
  const contractHost = harden({
    getChitIssuer() {
      return controller.getMetaIssuer();
    },

    // The `contractSrc` is code for a contract function parameterized
    // by `terms` and `chitMaker`. `start` evaluates this code,
    // calls that function to start the contract, and returns whatever
    // the contract returns.
    start(contractSrc, terms) {
      contractSrc = `${contractSrc}`;
      const contract = evaluate(contractSrc, {
        Nat,
        harden,
        console,
        E,
        makePromise,
      });

      const chitMaker = harden({
        // Used by the contract to make chits for credibly
        // participating in the contract. The returned chit can be
        // redeemed for this seat. The chitMaker contributes the
        // description `{ contractSrc, terms, seatDesc }`. If this
        // contract host redeems a chit, then the contractSrc and
        // terms are accurate. The seatDesc is according to that
        // contractSrc code.
        make(seatDesc, seat, name = 'a chit payment') {
          const baseDescription = harden({
            contractSrc,
            terms,
            seatDesc,
          });
          // We purposely avoid reifying baseMint because there should
          // never be any base purses or base payments. A chit only
          // resides in a meta purse or meta payment.
          const baseIssuer = makeMint(baseDescription).getIssuer();
          controller.register(baseIssuer);
          seats.set(baseIssuer, seat);
          const metaOneAmount = metaAmountOf(baseIssuer, 1);
          // This should be the only use of the meta mint, to make a
          // meta purse whose quantity is one unit of a base amount
          // for a unique base label. This meta purse makes the
          // returned meta payment, and then the empty meta purse is
          // dropped.
          const metaPurse = controller.getMetaMint().mint(metaOneAmount, name);
          return metaPurse.withdraw(metaOneAmount, name);
        },
        redeem,
      });
      return contract(terms, chitMaker);
    },

    // If this is a chit payment made by a chitMaker of this contract
    // host, redeem it for the associated seat. Else error. Redeeming
    // consumes the chit payment and also transfers the use rights.
    redeem(allegedChitPaymentP) {
      return Promise.resolve(allegedChitPaymentP).then(allegedChitPayment => {
        return redeem(allegedChitPayment);
      });
    },
  });
  return contractHost;
}
harden(makeContractHost);

function exchangeChitAmount(
  allegedChitAmount,
  chitIssuerPresence,
  contractSrc,
  terms,
  seatIndex,
  giveAmount,
  takeAmount,
) {
  mustBeComparable(allegedChitAmount);

  const baseIssuerPresence =
    allegedChitAmount.quantity && allegedChitAmount.quantity.label.issuer;

  return harden({
    label: {
      issuer: chitIssuerPresence,
      description: 'contract host',
    },
    quantity: {
      label: {
        issuer: baseIssuerPresence,
        description: {
          contractSrc,
          terms,
          seatDesc: [seatIndex, giveAmount, takeAmount],
        },
      },
      quantity: 1,
    },
  });
}
harden(exchangeChitAmount);

export { makeContractHost, exchangeChitAmount };
