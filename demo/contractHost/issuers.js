// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2019 Agoric, under Apache License 2.0

import Nat from '@agoric/nat';
import harden from '@agoric/harden';

import { makePrivateName } from '../../collections/PrivateName';
import { check } from '../../collections/insist';
import { makeNatOps } from './assays';

function makeMint(
  description,
  descriptionEquiv = Object.is,
  makeAssayOps = makeNatOps,
) {
  check(description)`\
Description must be truthy: ${description}`;

  // Map from purse or payment to balance. The balance is how much
  // can be transfered.
  const balances = makePrivateName();

  // Map from purse to assets, where assets include ownership rights
  // except for the right to transfer. Creating a payment moves some
  // balance into the payment, but no assets. Depositing a payment
  // into another purse also transfers the assets.
  const assets = makePrivateName();

  // Map from payment to the home purse the payment came from. When the
  // payment is deposited elsewhere, assets are transfered from the
  // home purse to the destination purse.
  const homePurses = makePrivateName();

  const issuer = harden({
    getAssayOps() {
      return ops;
    },

    makeEmptyPurse(name = 'a purse') {
      // eslint-disable-next-line no-use-before-define
      return mint.mint(ops.empty(), name); // mint and issuer call each other
    },

    // srcP designates a purse or payment. Reveal a fresh payment.
    // TODO: Bikeshed on name. 'reserve'? 'escrow'? 'encumber'? 'exclude'?
    getExclusive(amount, srcP, _name = 'a payment') {
      amount = ops.coerce(amount);
      _name = `${_name}`;
      return Promise.resolve(srcP).then(src => {
        const srcOldBal = balances.get(src);
        const srcNewBal = ops.without(srcOldBal, amount);

        // ///////////////// commit point //////////////////
        // All queries above passed with no side effects.
        // During side effects below, any early exits should be made into
        // fatal turn aborts.

        const payment = harden({
          getIssuer() {
            return issuer;
          },
          getBalance() {
            return balances.get(payment);
          },
        });
        balances.set(src, srcNewBal);
        balances.init(payment, amount);
        const homePurse = assets.has(src) ? src : homePurses.get(src);
        homePurses.init(payment, homePurse);
        return payment;
      });
    },
  });

  const label = harden({ issuer, description });

  function labelEquiv(left, right) {
    if (Object.is(left, right)) {
      return true;
    }
    const { issuer: leftIssuer, description: leftDescription } = left;
    const { issuer: rightIssuer, description: rightDescription } = right;
    return (
      leftIssuer === rightIssuer &&
      descriptionEquiv(leftDescription, rightDescription)
    );
  }
  const ops = makeAssayOps(label, labelEquiv);

  const mint = harden({
    getIssuer() {
      return issuer;
    },
    mint(initialBalance, _name = 'a purse') {
      initialBalance = ops.coerce(initialBalance);
      _name = `${_name}`;

      const purse = harden({
        getIssuer() {
          return issuer;
        },
        getBalance() {
          return balances.get(purse);
        },
        getAssets() {
          return assets.get(purse);
        },
        deposit(amount, srcPaymentP) {
          amount = ops.coerce(amount);
          return Promise.resolve(srcPaymentP).then(srcPayment => {
            const purseOldBal = balances.get(purse);
            const srcOldBal = balances.get(srcPayment);
            // Also checks that the union is representable
            const purseNewBal = ops.with(purseOldBal, amount);
            const srcNewBal = ops.without(srcOldBal, amount);

            const homePurse = homePurses.get(srcPayment);
            const purseOldAssets = assets.get(purse);
            const homeOldAssets = assets.get(homePurse);
            // Also checks that the union is representable
            const purseNewAssets = ops.with(purseOldAssets, amount);
            const homeNewAssets = ops.without(homeOldAssets, amount);

            // ///////////////// commit point //////////////////
            // All queries above passed with no side effects.
            // During side effects below, any early exits should be made into
            // fatal turn aborts.

            balances.set(srcPayment, srcNewBal);
            balances.set(purse, purseNewBal);
            assets.set(homePurse, homeNewAssets);
            assets.set(purse, purseNewAssets);
          });
        },
      });
      balances.init(purse, initialBalance);
      assets.init(purse, initialBalance);
      return purse;
    },
  });
  return mint;
}
harden(makeMint);

export { makeMint };
