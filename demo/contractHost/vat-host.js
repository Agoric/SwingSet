// Copyright (C) 2012 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import Nat from '@agoric/nat';
import harden from '@agoric/harden';
import evaluate from '@agoric/evaluate';

import { check } from '../../collections/insist';
import { makeMetaTicketOpsMaker } from './assays';
import { makeMint } from './issuers';
import makePromise from '../../src/kernel/makePromise';

function makeHost(E) {
  // Maps from ticket issuers to seats
  const seats = new WeakMap();

  const ticketLabelToOps = new WeakMap();
  function getTicketLabelToOps(ticketLabel) {
    return ticketLabelToOps.get(ticketLabel);
  }
  const makeMetaTicketOps = makeMetaTicketOpsMaker(getTicketLabelToOps);
  const metaTicketMint = makeMint('contractHost', makeMetaTicketOps);
  const metaTicketIssuer = metaTicketMint.getIssuer();

  // The contract host is designed to have a long-lived credible
  // identity.
  return harden({
    getMetaTicketIssuer() {
      return metaTicketIssuer;
    },

    // The `contractSrc` is code for a contract function parameterized
    // by `terms` and `ticketMaker`. `start` evaluates this code,
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

      const ticketMaker = harden({
        // Used by the contract to make tickets for credibly
        // participating in the contract. The returned ticket can be
        // redemmed for this seat. The ticketMaker contributes the
        // description `{ contractSrc, terms, seatDesc }`. If this
        // contract host redeems a ticket, then the contractSrc and
        // terms are accurate. The seatDesc is according to that
        // contractSrc code.
        make(seatDesc, seat) {
          const ticketDescription = harden({
            contractSrc,
            terms,
            seatDesc,
          });
          const ticketMint = makeMint(ticketDescription);
          const ticketIssuer = ticketMint.getIssuer();
          seats.set(ticketIssuer, harden(seat));
          const ticketPurse = ticketMint.mint(1);
          return ticketPurse.withdraw(1);
        },
      });

      return contract(terms, ticketMaker);
    },

    // If this is a ticket made by a ticketMaker of this contract
    // host, redeem it for the associated seat. Else error. Redeeming
    // consumes the ticket; both the xferRights and the useRights.
    redeem(allegedTicketP) {
      return E(allegedTicketP)
        .getIssuer()
        .then(allegedIssuer => {
          check(seats.has(allegedIssuer))`\
Not one of my ticket issuers: ${allegedIssuer}`;

          // Make an empty purse and deposit ticket into it, rather than
          // just doing a getExclusive on the ticket, so that the
          // useRights are used up as well as the xferRights.
          const sinkPurse = allegedIssuer.makeEmptyPurse();
          return sinkPurse.deposit(1, allegedTicketP).then(_ => {
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
