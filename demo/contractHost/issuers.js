// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { makePrivateName } from '../../collections/PrivateName';
import { insist } from '../../collections/insist';
import { makeNatAssay, makeMetaSingleAssayMaker } from './assays';
import { mustBeSameStructure } from '../../collections/sameStructure';

function makeMint(description, makeAssay = makeNatAssay) {
  insist(description)`\
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

  // src is a purse or payment. Return a fresh payment.  One internal
  // function used for both cases, since they are so similar.
  function takePayment(amount, isPurse, src, _name) {
    // eslint-disable-next-line no-use-before-define
    amount = assay.coerce(amount);
    _name = `${_name}`;
    if (isPurse) {
      insist(useRights.has(src))`\
Purse expected: ${src}`;
    } else {
      insist(homePurses.has(src))`\
Payment expected: ${src}`;
    }
    const srcOldXferAmount = xferRights.get(src);
    // eslint-disable-next-line no-use-before-define
    const srcNewXferAmount = assay.without(srcOldXferAmount, amount);
    
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
  }

  const issuer = harden({
    getLabel() {
      // eslint-disable-next-line no-use-before-define
      return assay.getLabel();
    },

    getAssay() {
      // eslint-disable-next-line no-use-before-define
      return assay;
    },

    makeEmptyPurse(name = 'a purse') {
      // eslint-disable-next-line no-use-before-define
      return mint.mint(assay.empty(), name); // mint and issuer call each other
    },

    getExclusive(amount, srcPaymentP, name = 'a payment') {
      return Promise.resolve(srcPaymentP).then(
        srcPayment => takePayment(amount, false, srcPayment, name));
    },
  });

  const label = harden({ issuer, description });

  const assay = makeAssay(label);

  const mint = harden({
    getIssuer() {
      return issuer;
    },
    mint(initialBalance, _name = 'a purse') {
      initialBalance = assay.coerce(initialBalance);
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
          amount = assay.coerce(amount);
          return Promise.resolve(srcPaymentP).then(srcPayment => {
            const purseOldXferAmount = xferRights.get(purse);
            const srcOldXferAmount = xferRights.get(srcPayment);
            // Also checks that the union is representable
            const purseNewXferAmount = assay.with(purseOldXferAmount, amount);
            const srcNewXferAmount = assay.without(srcOldXferAmount, amount);

            const homePurse = homePurses.get(srcPayment);
            const purseOldUseAmount = useRights.get(purse);
            const homeOldUseAmount = useRights.get(homePurse);
            // Also checks that the union is representable
            const purseNewUseAmount = assay.with(purseOldUseAmount, amount);
            const homeNewUseAmount = assay.without(homeOldUseAmount, amount);

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

// Makes a meta issuer issuing rights represented by registered base
// issuers. The base issuers do not themselves issue any rights. The
// base issuers exist to provide a label to their base assay.
//
// An empty meta purse or meta payment is not specific to a base
// issuer. Its balance is the empty meta amount which has a null meta
// quantity. Non-empty ones have a meta amount whose quantity is a
// base amount of some base assay, which cannot be combined with
// amounts of other base assays. (This is the "single" restriction of
// makeMetaSingleAssayMaker.)
//
// Base issuers should be registered as soon as they are
// made, so that there is no observable state change from not being
// registered to being registered.
function makeMetaIssuerController(description) {
  const baseIssuerToAssay = new WeakMap();
  function baseLabelToAssayFn(baseLabel) {
    const baseAssay = baseIssuerToAssay.get(baseLabel.issuer);
    insist(baseAssay !== undefined)`\
Issuer not found ${baseLabel}.issuer === ${baseLabel.issuer}`;
    mustBeSameStructure(baseAssay.getLabel(), baseLabel, `Labels don't match`);
    return baseAssay;
  }
  const makeMetaAssay = makeMetaSingleAssayMaker(baseLabelToAssayFn);
  const metaMint = makeMint(description, makeMetaAssay);
  const metaIssuer = metaMint.getIssuer();

  const controller = harden({
    getMetaMint() {
      return metaMint;
    },
    getMetaIssuer() {
      return metaIssuer;
    },
    register(baseIssuer) {
      baseIssuerToAssay.set(baseIssuer, baseIssuer.getAssay());
    },
  });
  return controller;
}
harden(makeMetaIssuerController);

// Creates a local issuer that locally represents a remotely issued
// currency. Returns a promise for a peg object that asynchonously
// converts between the two. The local currency is synchronously
// transferable locally.
function makePeg(E, remoteIssuerP, makeAssay = makeNatAssay) {
  const remoteLabelP = E(remoteIssuerP).getLabel();

  // The remoteLabel is a local copy of the remote pass-by-copy
  // label. It has a presence of the remote issuer and a copy of the
  // description.
  return Promise.resolve(remoteLabelP).then(remoteLabel => {
    // Retaining remote currency deposits it in here.
    // Redeeming local currency withdraws remote from here.
    const backingPurseP = E(remoteIssuerP).makeEmptyPurse();

    const { description } = remoteLabel;
    const localMint = makeMint(description, makeAssay);
    const localIssuer = localMint.getIssuer();
    const localLabel = localIssuer.getLabel();
    const localSink = localIssuer.makeEmptyPurse();

    function localAmountOf(remoteAmount) {
      return harden({
        label: localLabel,
        quantity: remoteAmount.quantity,
      });
    }

    function remoteAmountOf(localAmount) {
      return harden({
        label: remoteLabel,
        quantity: localAmount.quantity,
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
harden(makePeg);

export { makeMint, makeMetaIssuerController, makePeg };
