// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

function build(E) {
  // This is written in the full assay style, where bare number
  // objects are never used in lieu of full assay objects. This has
  // the virtue of unit typing, where 3 dollars cannot be confused
  // with 3 seconds.
  function mintTestAssay(mint) {
    console.log('starting mintTestAssay');
    const mMintP = E(mint).makeMint('bucks');
    const mIssuerP = E(mMintP).getIssuer();
    Promise.resolve(mIssuerP).then(issuer => {
      // By using an unforgeable issuer presence and a pass-by-copy
      // description together as a unit label, we check that both
      // agree. The veracity of the description is, however, only as
      // good as the issuer doing the check.
      const label = harden({ issuer, description: 'bucks' });
      const bucks1000 = harden({ label, data: 1000 });
      const bucks50 = harden({ label, data: 50 });

      const alicePurseP = E(mMintP).mint(bucks1000, 'alice');
      const paymentP = E(mIssuerP).takePayment(bucks50, alicePurseP);
      Promise.resolve(paymentP).then(_ => {
        const aBal = E(alicePurseP).getXferBalance();
        const dBal = E(paymentP).getXferBalance();
        Promise.all([aBal, dBal]).then(bals => {
          console.log('++ balances:', bals);
          console.log('++ DONE');
        });
      });
    });
  }

  // Uses raw numbers rather than assays. Until we have support for
  // pass-by-presence, the full assay style shown in mintTestAssay is
  // too awkward.
  function mintTestNumber(mint) {
    console.log('starting mintTestNumber');
    const mMintP = E(mint).makeMint('quatloos');
    const mIssuerP = E(mMintP).getIssuer();

    const alicePurseP = E(mMintP).mint(1000, 'alice');
    const paymentP = E(mIssuerP).takePayment(50, alicePurseP);
    Promise.resolve(paymentP).then(_ => {
      const aBal = E(alicePurseP).getXferBalance();
      const dBal = E(paymentP).getXferBalance();
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
    const moneyMintP = E(mint).makeMint('moola');
    const aliceMoneyPurseP = E(moneyMintP).mint(1000);
    const bobMoneyPurseP = E(moneyMintP).mint(1001);

    const stockMintP = E(mint).makeMint('Tyrell');
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
    const moneyMintP = E(mint).makeMint('clams');
    const aliceMoneyPurseP = E(moneyMintP).mint(1000, 'aliceMainMoney');
    const bobMoneyPurseP = E(moneyMintP).mint(1001, 'bobMainMoney');

    const stockMintP = E(mint).makeMint('fudco');
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
            if (rej.message.startsWith('Unexpected contract')) {
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
harden(build);

function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(syscall, state, build, helpers.vatID);
}
export default harden(setup);
