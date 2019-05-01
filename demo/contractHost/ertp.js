// Copyright (C) 2018 Agoric
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import Nat from '@agoric/nat';
import harden from '@agoric/harden';

// TODO get from common.js
const {
  isFrozen,
  getOwnPropertyDescriptors: getProps
} = Object;

// Like `map.get(key)` but throws an error if not present, rather than
// returning undefined.
// TODO: Put where it can be reused. Or just use makePrivateName
// instead.
export function lookup(map, key) {
  if (map.has(key)) {
    return map.get(key);
  }
  throw new TypeError(`key not found`);
}

// Return an assay factory, which makes assays, validates assays, and
// provides operations over assays. An assay is a pass-by-copy
// description of some set of erights.
//
// The default assay factory makes the default kind of assay.  The
// default kind of assay is a labeled natural number describing a
// quantity of fungible erights. The label is used only for an
// identity check. The label is normally a presence of the issuer
// describing what kinds of rights these are. This is a form of
// labeled unit, as in unit typing.
export function makeNatOps(label) {
  // memoize well formedness check.
  const brand = new WeakSet();

  const ops = harden({
    
    // Given the raw data that this kind of assay would label, return
    // an assay so labeling that data.
    make(allegedData) {
      const assay = harden({label, data: Nat(allegedData)});
      brand.add(assay);
      return assay;
    },
    
    // Is this an assay object made by this factory? If so, return
    // it. Otherwise error.
    vouch(assay) {
      if (brand.has(assay)) {
        return assay;
      }
      throw new TypeError(`unrecognized assay`);
    },

    // Is this like an assay object made by this factory, such as one
    // received by pass-by-copy from an otherwise-identical remote
    // assay? On success, return an assay object made by this
    // factory. Otherwise error.
    //
    // Until we have good support for pass-by-construction, the full
    // assay style is too awkward to use remotely. See
    // mintTestAssay. So coerce also accepts a bare number which it
    // will coerce to a labeled number via ops.make.
    coerce(assayLike) {
      if (typeof assayLike === 'number') {
        // Will throw on inappropriate number
        return ops.make(assayLike);
      }
      if (brand.has(assayLike)) {
        return assayLike;
      }
      const { label: allegedLabel, data } = assayLike;
      if (!Object.is(allegedLabel, label)) {
        throw new TypeError(`unrecognized label`);
      }
      // Will throw on inappropriate data
      return ops.make(data);
    },

    // Return the raw data that this assay labels.
    data(assay) {
      return ops.vouch(assay).data;
    },

    // Represents the empty set of erights, i.e., no erights
    empty() { return ops.make(0); },

    // Set inclusion of erights.
    // Does the set of erights described by `leftAssay` include all
    // the erights described by `rightAssay`?
    includes(leftAssay, rightAssay) {
      return ops.data(leftAssay) >= ops.data(rightAssay);
    },

    // Set union of erights.
    // Describe all the erights described by `leftAssay` and those
    // described by `rightAssay`.
    with(leftAssay, rightAssay) {
      return ops.make(ops.data(leftAssay) + ops.data(rightAssay));
    },

    // Set subtraction of erights.
    // Describe the erights described by `leftAssay` and not described
    // by `rightAssay`.
    without(leftAssay, rightAssay) {
      return ops.make(ops.data(leftAssay) - ops.data(rightAssay));
    },
  });
  return ops;
}

export function makeMint(makeAssayOps = makeNatOps,
                         _issuerName = 'an issuer') {
  // Map from purse or payment to balance. The balance is how much
  // can be transfered.
  const balances = new WeakMap();

  // Map from purse to assets, where assets include ownership rights
  // except for the right to transfer. Creating a payment moves some
  // balance into the payment, but no assets. Depositing a payment
  // into another purse also transfers the assets.
  const assets = new WeakMap();

  // Map from payment to the home purse the payment came from. When the
  // payment is deposited elsewhere, assets are transfered from the
  // home purse to the destination purse.
  const homePurses = new WeakMap();

  const issuer = harden({
    getAssayOps() { return ops; },
    
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
        const srcOldBal = lookup(balances, src);
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
        balances.set(payment, amount);
        const homePurse = assets.has(src) ? src : homePurses.get(src);
        homePurses.set(payment, homePurse);
        return payment;
      });
    }
  });

  // Label with this issuer
  const ops = makeAssayOps(issuer);

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
            const myOldBal = lookup(balances, purse);
            const srcOldBal = lookup(balances, srcPayment);
            // Just check that the union is representable
            ops.with(myOldBal, amount);
            const srcNewBal = ops.without(srcOldBal, amount);
            
            const homePurse = lookup(homePurses, srcPayment);
            const myOldAssets = assets.get(purse);
            const homeOldAssets = assets.get(homePurse);
            // Just check that the union is representable
            ops.with(myOldAssets, amount);
            const homeNewAssets = ops.without(homeOldAssets, amount);
          
            // ///////////////// commit point //////////////////
            // All queries above passed with no side effects.
            // During side effects below, any early exits should be made into
            // fatal turn aborts.

            balances.set(srcPayment, srcNewBal);
            // In case purse and src are the same, add to purse's updated
            // balance rather than myOldBal above. The current balance must be
            // >= 0 and <= myOldBal, so no additional Nat test is needed.
            // This is good because we're after the commit point, where no
            // non-fatal errors are allowed.
            balances.set(purse, ops.with(balances.get(purse), amount));

            assets.set(homePurse, homeNewAssets);
            assets.set(purse, ops.with(assets.get(purse), amount));
          });
        },
      });
      balances.set(purse, initialBalance);
      assets.set(purse, initialBalance);
      return purse;
    }
  });
  return mint;
}
