// Copyright (C) 2012 Google Inc.
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

function build(_E) {
  function makeMint() {
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
      makeEmptyPurse(name = 'a purse') {
        // eslint-disable-next-line no-use-before-define
        return mint(0, name); // mint and issuer call each other
      },

      // src is purse or payment. Result is a fresh payment.
      getExclusivePayment(src, amount, _name = 'a payment') {
        amount = Nat(amount);
        _name = `${_name}`;
        const srcOldBal = Nat(balances.get(src));
        const srcNewBal = Nat(srcOldBal - amount);

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
      },

      includes(providedAmount, neededAmount) {
        return Nat(providedAmount) >= Nat(neededAmount);
      },
    });

    function mint(initialBalance, _name = 'a purse') {
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
          amount = Nat(amount);
          return Promise.resolve(srcPaymentP).then(srcPayment => {
            const myOldBal = Nat(balances.get(purse));
            const srcOldBal = Nat(balances.get(srcPayment));
            Nat(myOldBal + amount);
            const srcNewBal = Nat(srcOldBal - amount);

            const homePurse = homePurses.get(srcPayment);
            const myOldAssets = Nat(assets.get(purse));
            const homeOldAssets = Nat(assets.get(homePurse));
            Nat(myOldAssets + amount);
            const homeNewAssets = Nat(homeOldAssets - amount);

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
            balances.set(purse, balances.get(purse) + amount);

            assets.set(homePurse, homeNewAssets);
            assets.set(purse, assets.get(purse) + amount);
          });
        },
      });
      balances.set(purse, initialBalance);
      assets.set(purse, initialBalance);
      return purse;
    }
    return harden({ mint });
  }

  return harden({ makeMint });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(syscall, state, build, helpers.vatID);
}
