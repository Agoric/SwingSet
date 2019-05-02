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

import { makePrivateName } from '../../collections/PrivateName';
import { makeNatOps } from './assayFactories';

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
            const purseOldBal = lookup(balances, purse);
            const srcOldBal = lookup(balances, srcPayment);
            // Also checks that the union is representable
            const purseNewBal = ops.with(purseOldBal, amount);
            const srcNewBal = ops.without(srcOldBal, amount);
            
            const homePurse = lookup(homePurses, srcPayment);
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
      balances.set(purse, initialBalance);
      assets.set(purse, initialBalance);
      return purse;
    }
  });
  return mint;
}
