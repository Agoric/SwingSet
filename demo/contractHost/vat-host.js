// Copyright (C) 2012 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import Nat from '@agoric/nat';
import harden from '@agoric/harden';
import evaluate from '@agoric/evaluate';

import { check } from '../../collections/insist';
import { makeMetaSingleAssayMaker } from './assays';
import { makeMint } from './issuers';
import makePromise from '../../src/kernel/makePromise';

function makeHost(E) {
  // Maps from chit issuers to seats
  const seats = new WeakMap();

  const chitLabelToAssay = new WeakMap();
  function getChitLabelToAssay(chitLabel) {
    return chitLabelToAssay.get(chitLabel);
  }
  const makeMetaChitAssay = makeMetaSingleAssayMaker(getChitLabelToAssay);
  const metaChitMint = makeMint('contractHost', makeMetaChitAssay);
  const metaChitIssuer = metaChitMint.getIssuer();

  // The contract host is designed to have a long-lived credible
  // identity.
  return harden({
    getMetaChitIssuer() {
      return metaChitIssuer;
    },

    // The `contractSrc` is code for a contract function parameterized
    // by `terms` and `chitMaker`. `start` evaluates this code,
    // calls that function to start the contract, and returns whatever
    // the contract returns.
    start(contractSrc, terms) {
      contractSrc = `${contractSrc}`;
      const contract = evaluate(contractSrc, {
        Nat,
        harden,
        console,
        E,
        makePromise,
      });

      const chitMaker = harden({
        // Used by the contract to make chits for credibly
        // participating in the contract. The returned chit can be
        // redeemed for this seat. The chitMaker contributes the
        // description `{ contractSrc, terms, seatDesc }`. If this
        // contract host redeems a chit, then the contractSrc and
        // terms are accurate. The seatDesc is according to that
        // contractSrc code.
        make(seatDesc, seat) {
          const chitDescription = harden({
            contractSrc,
            terms,
            seatDesc,
          });
          const chitMint = makeMint(chitDescription);
          const chitIssuer = chitMint.getIssuer();
          seats.set(chitIssuer, harden(seat));
          const chitPurse = chitMint.mint(1);
          return chitPurse.withdraw(1);
        },
      });

      return contract(terms, chitMaker);
    },

    // If this is a chit made by a chitMaker of this contract
    // host, redeem it for the associated seat. Else error. Redeeming
    // consumes the chit; both the xferRights and the useRights.
    redeem(allegedChitP) {
      return E(allegedChitP)
        .getIssuer()
        .then(allegedIssuer => {
          check(seats.has(allegedIssuer))`\
Not one of my chit issuers: ${allegedIssuer}`;

          // Make an empty purse and deposit chit into it, rather than
          // just doing a getExclusive on the chit, so that the
          // useRights are used up as well as the xferRights.
          const sinkPurse = allegedIssuer.makeEmptyPurse();
          return sinkPurse.deposit(1, allegedChitP).then(_ => {
            const seat = seats.get(allegedIssuer);
            seats.delete(allegedIssuer);
            return seat;
          });
        });
    },
  });
}

function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    E =>
      harden({
        makeHost() {
          return harden(makeHost(E));
        },
      }),
    helpers.vatID,
  );
}
export default harden(setup);
