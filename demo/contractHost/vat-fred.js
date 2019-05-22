// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { insist } from '../../collections/insist';
import { escrowExchangeSrc } from './escrow';
import { coveredCallSrc } from './coveredCall';
import { exchangeChitAmount, makeCollect } from './chit';

function makeFred(E, host) {
  const collect = makeCollect(E);

  let initialized = false;
  let timerP;
  let chitIssuerP;

  let myMoneyPurseP;
  let moneyIssuerP;

  let myStockPurseP;
  let stockIssuerP;

  let myFinPurseP;
  let finIssuerP;

  function init(timer, myMoneyPurse, myStockPurse, myFinPurse) {
    timerP = Promise.resolve(timer);
    chitIssuerP = E(host).getChitIssuer();

    myMoneyPurseP = Promise.resolve(myMoneyPurse);
    moneyIssuerP = E(myMoneyPurseP).getIssuer();

    myStockPurseP = Promise.resolve(myStockPurse);
    stockIssuerP = E(myStockPurseP).getIssuer();

    myFinPurseP = Promise.resolve(myFinPurse);
    finIssuerP = E(myFinPurseP).getIssuer();

    initialized = true;
    // eslint-disable-next-line no-use-before-define
    return fred; // fred and init use each other
  }

  const fred = harden({
    init,
    acceptOptionOffer(allegedChitPaymentP) {
      console.log('++ fred.acceptOptionOffer starting');
      insist(initialized)`\
ERR: fred.acceptOptionOffer called before init()`;

      const allegedMetaAmountP = E(allegedChitPaymentP).getXferBalance();

      const verifiedChitP = Promise.resolve(allegedMetaAmountP).then(
        allegedMetaAmount => {
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

          const metaOptionAmountP = exchangeChitAmount(
            chitIssuerP,
            allegedMetaAmount.quantity.label.issuer, // wrong
            coveredCallSrc,
            [dough10, wonka7, timerP, 'singularity'],
            'holder',
            dough10,
            wonka7,
          );

          const fin55 = harden({
            label: {
              issuer: finIssuerP,
              description: 'fins',
            },
            quantity: 55,
          });

          const metaOptionSaleAmountP = exchangeChitAmount(
            chitIssuerP,
            allegedMetaAmount.quantity.label.issuer,
            escrowExchangeSrc,
            [fin55, metaOptionAmountP],
            0,
            fin55,
            metaOptionAmountP,
          );

          return Promise.resolve(metaOptionSaleAmountP).then(
            metaOptionSaleAmount =>
              E(chitIssuerP).getExclusive(
                metaOptionSaleAmount,
                allegedChitPaymentP,
                'verified chit',
              ),
          );
        },
      );
      const seatP = E(host).redeem(verifiedChitP);
      const moneyPaymentP = E(myMoneyPurseP).withdraw(10);
      E(seatP).offer(moneyPaymentP);
      return collect(seatP, myStockPurseP, myMoneyPurseP, 'alice escrow');
    },
  });
  return fred;
}

function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(syscall, state, E =>
    harden({
      makeFred(host) {
        return harden(makeFred(E, host));
      },
    }),
  );
}
export default harden(setup);
