// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2019 Agoric, under Apache License 2.0

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

  // Map from purse or payment to the transfer rights it currently
  // holds. Transfer rights can move via payments, or they can cause a
  // transfer of both the transfer and use rights by depositing it
  // into a purse.
  const xferRights = makePrivateName();

  // Map from purse to useRights, where useRights do not include the
  // right to transfer. Creating a payment moves some xferRights into the
  // payment, but no useRights. Depositing a payment into another
  // purse transfers both the xferRights and the useRights.
  const useRights = makePrivateName();

  // Map from payment to the home purse the payment came from. When the
  // payment is deposited elsewhere, useRights are transfered from the
  // home purse to the destination purse.
  const homePurses = makePrivateName();

  const issuer = harden({
    getAssayOps() {
      // eslint-disable-next-line no-use-before-define
      return ops;
    },

    makeEmptyPurse(name = 'a purse') {
      // eslint-disable-next-line no-use-before-define
      return mint.mint(ops.empty(), name); // mint and issuer call each other
    },

    // srcP designates a purse or payment. Reveal a fresh payment.
    takePayment(amount, srcP, _name = 'a payment') {
      // eslint-disable-next-line no-use-before-define
      amount = ops.coerce(amount);
      _name = `${_name}`;
      return Promise.resolve(srcP).then(src => {
        const srcOldBal = xferRights.get(src);
        // eslint-disable-next-line no-use-before-define
        const srcNewBal = ops.without(srcOldBal, amount);

        // ///////////////// commit point //////////////////
        // All queries above passed with no side effects.
        // During side effects below, any early exits should be made into
        // fatal turn aborts.

        const payment = harden({
          getIssuer() {
            return issuer;
          },
          getXferBalance() {
            return xferRights.get(payment);
          },
        });
        xferRights.set(src, srcNewBal);
        xferRights.init(payment, amount);
        const homePurse = useRights.has(src) ? src : homePurses.get(src);
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
        getXferBalance() {
          return xferRights.get(purse);
        },
        getUseBalance() {
          return useRights.get(purse);
        },
        deposit(amount, srcPaymentP) {
          amount = ops.coerce(amount);
          return Promise.resolve(srcPaymentP).then(srcPayment => {
            const purseOldBal = xferRights.get(purse);
            const srcOldBal = xferRights.get(srcPayment);
            // Also checks that the union is representable
            const purseNewBal = ops.with(purseOldBal, amount);
            const srcNewBal = ops.without(srcOldBal, amount);

            const homePurse = homePurses.get(srcPayment);
            const purseOldUseRights = useRights.get(purse);
            const homeOldUseRights = useRights.get(homePurse);
            // Also checks that the union is representable
            const purseNewUseRights = ops.with(purseOldUseRights, amount);
            const homeNewUseRights = ops.without(homeOldUseRights, amount);

            // ///////////////// commit point //////////////////
            // All queries above passed with no side effects.
            // During side effects below, any early exits should be made into
            // fatal turn aborts.

            xferRights.set(srcPayment, srcNewBal);
            xferRights.set(purse, purseNewBal);
            useRights.set(homePurse, homeNewUseRights);
            useRights.set(purse, purseNewUseRights);
          });
        },
      });
      xferRights.init(purse, initialBalance);
      useRights.init(purse, initialBalance);
      return purse;
    },
  });
  return mint;
}
harden(makeMint);

export { makeMint };
