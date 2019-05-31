// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { allComparable } from '../../collections/sameStructure';
import { makeCollect } from './contractHost';

function makeFred(E, host, log) {
  const collect = makeCollect(E, log);

  return harden({
    init(
      escrowExchangeInstallationP,
      coveredCallInstallationP,
      timerP,
      myMoneyPurseP,
      myStockPurseP,
      myFinPurseP,
      isTerse = false,
    ) {
      const inviteIssuerP = E(host).getInviteIssuer();
      const inviteIssuerLabel = harden({
        issuer: inviteIssuerP,
        description: 'contract host',
      });
      const inviteAssayP = E(inviteIssuerP).getAssay();

      const moneyIssuerP = E(myMoneyPurseP).getIssuer();
      const moneyAssayP = E(moneyIssuerP).getAssay();

      const stockIssuerP = E(myStockPurseP).getIssuer();
      const stockAssayP = E(stockIssuerP).getAssay();

      const finIssuerP = E(myFinPurseP).getIssuer();
      const finAssayP = E(finIssuerP).getAssay();

      const fred = harden({
        acceptOptionOffer(allegedSaleInvitePaymentP) {
          log('++ fred.acceptOptionOffer starting');

          const allegedSaleAmountP = E(
            allegedSaleInvitePaymentP,
          ).getXferBalance();
          return E.resolve(allegedSaleAmountP).then(allegedSaleInviteAmount => {
            const allegedSaleSeatIdentity =
              allegedSaleInviteAmount.quantity.seatIdentity;
            const allegedOptionsInviteAmount =
              allegedSaleInviteAmount.quantity.terms[1];
            const allegedOptionsSeatIdentity =
              allegedOptionsInviteAmount.quantity.seatIdentity;

            let saleInviteAmountP;
            if (isTerse) {
              saleInviteAmountP = fred.xTerse(
                allegedSaleSeatIdentity,
                allegedOptionsSeatIdentity,
              );
            } else {
              saleInviteAmountP = fred.xVerbose(
                allegedSaleSeatIdentity,
                allegedOptionsSeatIdentity,
              );
            }
            return E.resolve(allComparable(harden(saleInviteAmountP))).then(
              saleInviteAmount => {
                const verifiedSaleInvitePaymentP = E(
                  inviteIssuerP,
                ).getExclusive(
                  saleInviteAmount,
                  allegedSaleInvitePaymentP,
                  'verified sale invite',
                );
                const saleSeatP = E(host).redeem(verifiedSaleInvitePaymentP);
                const finPaymentP = E(myFinPurseP).withdraw(55);
                E(saleSeatP).offer(finPaymentP);
                const optionInvitePurseP = E(inviteIssuerP).makeEmptyPurse();
                const gotOptionP = collect(
                  saleSeatP,
                  optionInvitePurseP,
                  myFinPurseP,
                  'fred buys escrowed option',
                );
                return E.resolve(gotOptionP).then(_ => {
                  // Fred bought the option. Now fred tries to exercise
                  // the option.
                  const optionInvitePaymentP = E(
                    optionInvitePurseP,
                  ).withdrawAll();
                  const optionSeatP = E(host).redeem(optionInvitePaymentP);
                  const doughPaymentP = E(myMoneyPurseP).withdraw(10);
                  E(optionSeatP).offer(doughPaymentP);
                  return collect(
                    optionSeatP,
                    myStockPurseP,
                    myMoneyPurseP,
                    'fred exercises option, buying stock',
                  );
                });
              },
            );
          });
        },
        xVerbose(allegedSaleSeatIdentity, allegedOptionsSeatIdentity) {
          const dough10 = harden({
            label: {
              issuer: moneyIssuerP,
              description: 'dough',
            },
            quantity: 10,
          });
          const wonka7 = harden({
            label: {
              issuer: stockIssuerP,
              description: 'wonka',
            },
            quantity: 7,
          });
          const fin55 = harden({
            label: {
              issuer: finIssuerP,
              description: 'fins',
            },
            quantity: 55,
          });

          const optionsInviteAmount = harden({
            label: inviteIssuerLabel,
            quantity: {
              installation: coveredCallInstallationP,
              terms: [dough10, wonka7, timerP, 'singularity'],
              seatIdentity: allegedOptionsSeatIdentity,
              seatDesc: 'holder',
            },
          });

          return harden({
            label: inviteIssuerLabel,
            quantity: {
              installation: escrowExchangeInstallationP,
              terms: [fin55, optionsInviteAmount],
              seatIdentity: allegedSaleSeatIdentity,
              seatDesc: 'left',
            },
          });
        },
        xTerse(allegedSaleSeatIdentity, allegedOptionsSeatIdentity) {
          const moneyNeededP = E(moneyAssayP).make(10);
          const stockNeededP = E(stockAssayP).make(7);

          const finNeededP = E(finAssayP).make(55);
          return allComparable(
            harden({
              installation: coveredCallInstallationP,
              terms: [moneyNeededP, stockNeededP, timerP, 'singularity'],
              seatIdentity: allegedOptionsSeatIdentity,
              seatDesc: 'holder',
            }),
          ).then(optionsInviteQuant => {
            const optionsInviteAmountP = E(inviteAssayP).make(
              optionsInviteQuant,
            );

            return allComparable(
              harden({
                installation: escrowExchangeInstallationP,
                terms: [finNeededP, optionsInviteAmountP],
                seatIdentity: allegedSaleSeatIdentity,
                seatDesc: 'left',
              }),
            ).then(saleInviteQuant => E(inviteAssayP).make(saleInviteQuant));
          });
        },
      });
      return fred;
    },
  });
}

function setup(syscall, state, helpers) {
  function log(...args) {
    helpers.log(...args);
    console.log(...args);
  }
  return helpers.makeLiveSlots(syscall, state, E =>
    harden({
      makeFred(host) {
        return harden(makeFred(E, host, log));
      },
    }),
  );
}
export default harden(setup);
