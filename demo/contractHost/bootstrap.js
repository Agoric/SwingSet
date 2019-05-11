// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { check } from '../../collections/insist';

function build(E) {
  function showPaymentBalance(name, paymentP) {
    E(paymentP)
      .getXferBalance()
      .then(amount => console.log(name, ' xfer balance ', amount));
  }
  function showPurseBalances(name, purseP) {
    E(purseP)
      .getXferBalance()
      .then(amount => console.log(name, ' xfer balance ', amount));
    E(purseP)
      .getUseBalance()
      .then(amount => console.log(name, ' use balance ', amount));
  }

  // This is written in the full assay style, where bare number
  // objects are never used in lieu of full amount objects. This has
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
      const paymentP = E(alicePurseP).withdraw(bucks50);
      Promise.resolve(paymentP).then(_ => {
        showPurseBalances('alice', alicePurseP);
        showPaymentBalance('payment', paymentP);
      });
    });
  }

  // Uses raw numbers rather than amounts. Until we have support for
  // pass-by-presence, the full assay style shown in mintTestAssay is
  // too awkward.
  function mintTestNumber(mint) {
    console.log('starting mintTestNumber');
    const mMintP = E(mint).makeMint('quatloos');

    const alicePurseP = E(mMintP).mint(1000, 'alice');
    const paymentP = E(alicePurseP).withdraw(50);
    Promise.resolve(paymentP).then(_ => {
      showPurseBalances('alice', alicePurseP);
      showPaymentBalance('payment', paymentP);
    });
  }

  function trivialContractTest(host) {
    console.log('starting trivialContractTest');

    function trivContract(terms, ticketMaker) {
      return ticketMaker.make('foo', 8);
    }
    const contractSrc = `${trivContract}`;

    const fooTicketP = E(host).start(contractSrc, 'foo terms');

    showPaymentBalance('foo', fooTicketP);

    const eightP = E(host).redeem(fooTicketP);

    eightP.then(res => {
      showPaymentBalance('foo', fooTicketP);
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

  function betterContractTestBobFirst(mint, alice, bob) {
    const moneyMintP = E(mint).makeMint('clams');
    const aliceMoneyPurseP = E(moneyMintP).mint(1000, 'aliceMainMoney');
    const bobMoneyPurseP = E(moneyMintP).mint(1001, 'bobMainMoney');

    const stockMintP = E(mint).makeMint('fudco');
    const aliceStockPurseP = E(stockMintP).mint(2002, 'aliceMainStock');
    const bobStockPurseP = E(stockMintP).mint(2003, 'bobMainStock');

    const aliceP = E(alice).init(aliceMoneyPurseP, aliceStockPurseP);
    const bobP = E(bob).init(bobMoneyPurseP, bobStockPurseP);

    E(bobP)
      .tradeWell(aliceP, false)
      .then(
        res => {
          showPurseBalances('alice money', aliceMoneyPurseP);
          showPurseBalances('alice stock', aliceStockPurseP);
          showPurseBalances('bob money', bobMoneyPurseP);
          showPurseBalances('bob stock', bobStockPurseP);
          console.log('++ bobP.tradeWell done:', res);
          console.log('++ DONE');
        },
        rej => {
          console.log('++ bobP.tradeWell error:', rej);
        },
      );
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
      } else {
        check(argv.length === 0)`\
Unrecognized arg0: ${argv[0]}`;
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
