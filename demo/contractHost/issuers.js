// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { makePrivateName } from '../../collections/PrivateName';
import { check } from '../../collections/insist';
import { makeNatOps } from './assays';

function makeMint(description, makeAssayOps = makeNatOps) {
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

  // srcP designates a purse or payment. Reveal a fresh payment.  One
  // internal function used for both cases, since they are so similar.
  function takePayment(amount, isPurse, srcP, _name) {
    // eslint-disable-next-line no-use-before-define
    amount = ops.coerce(amount);
    _name = `${_name}`;
    return Promise.resolve(srcP).then(src => {
      if (isPurse) {
        check(useRights.has(src))`\
Purse expected: ${src}`;
      } else {
        check(homePurses.has(src))`\
Payment expected: ${src}`;
      }
      const srcOldXferAmount = xferRights.get(src);
      // eslint-disable-next-line no-use-before-define
      const srcNewXferAmount = ops.without(srcOldXferAmount, amount);

      // ///////////////// commit point //////////////////
      // All queries above passed with no side effects.
      // During side effects below, any early exits should be made into
      // fatal turn aborts.

      const payment = harden({
        getIssuer() {
          // eslint-disable-next-line no-use-before-define
          return issuer;
        },
        getXferBalance() {
          return xferRights.get(payment);
        },
      });
      xferRights.set(src, srcNewXferAmount);
      xferRights.init(payment, amount);
      const homePurse = isPurse ? src : homePurses.get(src);
      homePurses.init(payment, homePurse);
      return payment;
    });
  }

  const issuer = harden({
    getLabel() {
      // eslint-disable-next-line no-use-before-define
      return ops.getLabel();
    },

    getAssayOps() {
      // eslint-disable-next-line no-use-before-define
      return ops;
    },

    makeEmptyPurse(name = 'a purse') {
      // eslint-disable-next-line no-use-before-define
      return mint.mint(ops.empty(), name); // mint and issuer call each other
    },

    getExclusive(amount, srcPaymentP, name = 'a payment') {
      return takePayment(amount, false, srcPaymentP, name);
    },
  });

  const label = harden({ issuer, description });

  const ops = makeAssayOps(label);

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
            const purseOldXferAmount = xferRights.get(purse);
            const srcOldXferAmount = xferRights.get(srcPayment);
            // Also checks that the union is representable
            const purseNewXferAmount = ops.with(purseOldXferAmount, amount);
            const srcNewXferAmount = ops.without(srcOldXferAmount, amount);

            const homePurse = homePurses.get(srcPayment);
            const purseOldUseAmount = useRights.get(purse);
            const homeOldUseAmount = useRights.get(homePurse);
            // Also checks that the union is representable
            const purseNewUseAmount = ops.with(purseOldUseAmount, amount);
            const homeNewUseAmount = ops.without(homeOldUseAmount, amount);

            // ///////////////// commit point //////////////////
            // All queries above passed with no side effects.
            // During side effects below, any early exits should be made into
            // fatal turn aborts.

            xferRights.set(srcPayment, srcNewXferAmount);
            xferRights.set(purse, purseNewXferAmount);
            useRights.set(homePurse, homeNewUseAmount);
            useRights.set(purse, purseNewUseAmount);

            return amount;
          });
        },
        withdraw(amount, name = 'a withdrawal payment') {
          return takePayment(amount, true, purse, name);
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

// Creates a local issuer that locally represents a remotely issued
// currency. Returns a promise for a peg object that asynchonously
// converts between the two. The local currency is synchronously
// transferable locally.
function makePeg(E, remoteIssuerP, makeAssayOps = makeNatOps) {
  const remoteLabelP = E(remoteIssuerP).getLabel();
  return Promise.resolve(remoteLabelP).then(remoteLabel => {
    // Retaining remote currency deposits it in here.
    // Redeeming local currency withdraws remote from here.
    const backingPurseP = E(remoteIssuerP).makeEmptyPurse();

    const { description } = remoteLabel;
    const localMint = makeMint(description, makeAssayOps);
    const localIssuer = localMint.getIssuer();
    const localLabel = localIssuer.getLabel();
    const localSink = localIssuer.makeEmptyPurse();

    function localAmountOf(remoteAmount) {
      return harden({
        label: localLabel,
        data: remoteAmount.data,
      });
    }

    function remoteAmountOf(localAmount) {
      return harden({
        label: remoteLabel,
        data: localAmount.data,
      });
    }

    return harden({
      getLocalIssuer() {
        return localIssuer;
      },

      getRemoteIssuer() {
        return remoteIssuerP;
      },

      retain(remoteAmount, remotePaymentP, name) {
        return E(backingPurseP)
          .deposit(remoteAmount, remotePaymentP)
          .then(amount => localMint.mint(localAmountOf(amount), name));
      },

      redeem(localAmount, localPayment, name) {
        return localSink
          .deposit(localAmount, localPayment)
          .then(amount =>
            E(backingPurseP).withdraw(remoteAmountOf(amount), name),
          );
      },
    });
  });
}

export { makeMint, makePeg };
