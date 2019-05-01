// Copyright (C) 2011 Google Inc.
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

/**
 * @fileoverview Test simple contract code
 * @requires define
 */

import harden from '@agoric/harden';
import { makeNatOps } from './ertp';

function build(E) {
  
  function mintTestAssay(mint) {
    console.log('starting mintTestAssay');
    const mP = E(mint).makeMint();
    const mIssuerP = E(mP).getIssuer();
    Promise.resolve(mIssuerP).then(mIssuerPresence => {
      const ops = makeNatOps(mIssuerPresence);
      const alicePurseP = E(mP).mint(ops.make(1000), 'alice');
      const paymentP = E(mIssuerP).getExclusive(ops.make(50), alicePurseP);
      Promise.resolve(paymentP).then(_ => {
        const aBal = E(alicePurseP).getBalance();
        const dBal = E(paymentP).getBalance();
        Promise.all([aBal, dBal]).then(bals => {
          console.log('++ balances:', bals);
          console.log('++ DONE');
        });
      });
    });
  }

  // Uses raw numbers rather than assays. Until we have support for
  // pass-by-presence, the full assay style shown in mintTestAssay is
  // awkward.
  function mintTestNumber(mint) {
    console.log('starting mintTestNumber');
    const mP = E(mint).makeMint();
    const mIssuerP = E(mP).getIssuer();
    const alicePurseP = E(mP).mint(1000, 'alice');
    const paymentP = E(mIssuerP).getExclusive(50, alicePurseP);
    Promise.resolve(paymentP).then(_ => {
      const aBal = E(alicePurseP).getBalance();
      const dBal = E(paymentP).getBalance();
      Promise.all([aBal, dBal]).then(bals => {
        console.log('++ balances:', bals);
        console.log('++ DONE');
      });
    });
  }


  function trivialContractTest(host) {
    console.log('starting trivialContractTest');

    function trivContract(_whiteP, _blackP) {
      return 8;
    }
    const contractSrc = `${trivContract}`;

    const tokensP = E(host).setup(contractSrc);

    const whiteTokenP = tokensP.then(tokens => tokens[0]);
    E(host).play(whiteTokenP, contractSrc, 0, {});

    const blackTokenP = tokensP.then(tokens => tokens[1]);
    const eightP = E(host).play(blackTokenP, contractSrc, 1, {});
    eightP.then(res => {
      console.log('++ eightP resolved to', res, '(should be 8)');
      if (res !== 8) {
        throw new Error(`eightP resolved to ${res}, not 8`);
      }
      console.log('++ DONE');
    });
    return eightP;
  }

  function betterContractTestAliceFirst(mint, alice, bob) {
    const moneyMintP = E(mint).makeMint();
    const aliceMoneyPurseP = E(moneyMintP).mint(1000);
    const bobMoneyPurseP = E(moneyMintP).mint(1001);

    const stockMintP = E(mint).makeMint();
    const aliceStockPurseP = E(stockMintP).mint(2002);
    const bobStockPurseP = E(stockMintP).mint(2003);

    const aliceP = E(alice).init(aliceMoneyPurseP, aliceStockPurseP);
    /* eslint-disable-next-line no-unused-vars */
    const bobP = E(bob).init(bobMoneyPurseP, bobStockPurseP);
    const ifItFitsP = E(aliceP).payBobWell(bob);
    ifItFitsP.then(
      res => {
        console.log('++ ifItFitsP done:', res);
        console.log('++ DONE');
      },
      rej => console.log('++ ifItFitsP failed', rej),
    );
    return ifItFitsP;
  }

  function betterContractTestBobFirst(mint, alice, bob, bobLies = false) {
    const moneyMintP = E(mint).makeMint();
    const aliceMoneyPurseP = E(moneyMintP).mint(1000, 'aliceMainMoney');
    const bobMoneyPurseP = E(moneyMintP).mint(1001, 'bobMainMoney');

    const stockMintP = E(mint).makeMint();
    const aliceStockPurseP = E(stockMintP).mint(2002, 'aliceMainStock');
    const bobStockPurseP = E(stockMintP).mint(2003, 'bobMainStock');

    const aliceP = E(alice).init(aliceMoneyPurseP, aliceStockPurseP);
    const bobP = E(bob).init(bobMoneyPurseP, bobStockPurseP);

    if (bobLies) {
      E(bobP)
        .tradeWell(aliceP, true)
        .then(
          res => {
            console.log('++ bobP.tradeWell done:', res);
          },
          rej => {
            if (rej.message.startsWith('unexpected contract')) {
              console.log('++ DONE');
            } else {
              console.log('++ bobP.tradeWell error:', rej);
            }
          },
        );
    } else {
      E(bobP)
        .tradeWell(aliceP, false)
        .then(
          res => {
            console.log('++ bobP.tradeWell done:', res);
            console.log('++ DONE');
          },
          rej => {
            console.log('++ bobP.tradeWell error:', rej);
          },
        );
    }
    //  return E(aliceP).tradeWell(bobP);
  }

  const obj0 = {
    async bootstrap(argv, vats) {
      if (argv[0] === 'mint') {
        mintTestAssay(vats.mint);
        return mintTestNumber(vats.mint);
      }
      const host = await E(vats.host).makeHost();
      if (argv[0] === 'trivial') {
        return trivialContractTest(host);
      }
      const alice = await E(vats.alice).makeAlice(host);
      const bob = await E(vats.bob).makeBob(host);
      if (argv[0] === 'alice-first') {
        betterContractTestAliceFirst(vats.mint, alice, bob);
      } else if (argv[0] === 'bob-first') {
        betterContractTestBobFirst(vats.mint, alice, bob);
      } else if (argv[0] === 'bob-first-lies') {
        betterContractTestBobFirst(vats.mint, alice, bob, true);
      }
      return undefined;
    },
  };
  return harden(obj0);
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(syscall, state, build, helpers.vatID);
}
