// Copyright (C) 2012 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import Nat from '@agoric/nat';
import harden from '@agoric/harden';
import evaluate from '@agoric/evaluate';

import { check } from '../../collections/insist';
import { makeNatOps, makeMetaOps } from './assays';
import { makeMint } from './issuers';

function ticketDescriptionEquiv(x, y) {
  return x === y;  // TODO fix
}

function makeHost(E) {

/*
  const contractMetaMint = makeMint('contractHost',
                                    undefined,
                                    makeMetaOps);
  const contractMetaIssuer = contractMetaMint.getIssuer();
*/

  // Maps from ticket issuers to seats
  const seats = new WeakMap();

  return harden({
    setup(contractSrc, terms) {
      contractSrc = `${contractSrc}`;
      const contract = evaluate(contractSrc, {
        Nat,
        harden,
        console,
        E,
      });

      const ticketMaker = harden({
        makeTicket(role, seat) {
          const ticketDescription = harden({
            contractSrc,
            terms,
            role,
          });
          const ticketMint = makeMint(ticketDescription,
                                      ticketDescriptionEquiv,
                                      makeNatOps);
          const ticketIssuer = ticketMint.getIssuer();
          seats.set(ticketIssuer, harden(seat));
          const ticketPurse = ticketMint.mint(1);
          return ticketPurse.withdraw(1);
        }
      });

      return contract(terms, ticketMaker);
    },

    redeem(allegedTicket) {
      const allegedIssuer = allegedTicket.label.issuer;
      check(seats.has(allegedIssuer))`\
Not one of my ticket issuers: ${allegedIssuer}`;

      // Make an empty purse and deposit ticket into it, rather than
      // just doing a getExclusive on the ticket, so that the
      // useRights are used up as well as the xferRights.
      const sinkPurse = allegedIssuer.makeEmptyPurse();
      // Commit point within deposit
      sinkPurse.deposit(1, allegedTicket);
      // After commit point. Must not fail.
      const seat = seats.get(allegedIssuer);
      seats.delete(allegedIssuer);
      return seat;
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
