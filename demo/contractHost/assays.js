// Copyright (C) 2019 Agoric, under Apache License 2.0

import Nat from '@agoric/nat';
import harden from '@agoric/harden';

import { check } from '../../collections/insist';
import {
  sameStructure,
  mustBeComparable,
} from '../../collections/sameStructure';

// Return an assay, which makes amounts, validates amounts, and
// provides set operations over amounts. An amount is a pass-by-copy
// description of some set of erights.
//
// The default assay makes the default kind of amount.  The default
// kind of amount is a labeled natural number describing a quantity of
// fungible erights. The label describes what kinds of rights these
// are. This is a form of labeled unit, as in unit typing.
function makeNatAssay(label) {
  mustBeComparable(label);

  // memoize well formedness check.
  const brand = new WeakSet();

  const assay = harden({
    getLabel() {
      return label;
    },

    // Given the raw data that this kind of amount would label, return
    // an amount so labeling that data.
    make(allegedData) {
      const amount = harden({ label, data: Nat(allegedData) });
      brand.add(amount);
      return amount;
    },

    // Is this an amount object made by this assay? If so, return
    // it. Otherwise error.
    vouch(amount) {
      check(brand.has(amount))`\
Unrecognized amount: ${amount}`;
      return amount;
    },

    // Is this like an amount object made by this assay, such as one
    // received by pass-by-copy from an otherwise-identical remote
    // amount? On success, return an amount object made by this
    // assay. Otherwise error.
    //
    // Until we have good support for pass-by-construction, the full
    // assay style is too awkward to use remotely. See
    // mintTestAssay. So coerce also accepts a bare number which it
    // will coerce to a labeled number via assay.make.
    coerce(amountLike) {
      if (typeof amountLike === 'number') {
        // Will throw on inappropriate number
        return assay.make(amountLike);
      }
      if (brand.has(amountLike)) {
        return amountLike;
      }
      const { label: allegedLabel, data } = amountLike;
      check(sameStructure(label, allegedLabel))`\
Unrecognized label: ${allegedLabel}`;
      // Will throw on inappropriate data
      return assay.make(data);
    },

    // Return the raw data that this amount labels.
    data(amount) {
      return assay.vouch(amount).data;
    },

    // Represents the empty set of erights, i.e., no erights
    empty() {
      return assay.make(0);
    },

    isEmpty(amount) {
      return assay.data(amount) === 0;
    },

    // Set inclusion of erights.
    // Does the set of erights described by `leftAmount` include all
    // the erights described by `rightAmount`?
    includes(leftAmount, rightAmount) {
      return assay.data(leftAmount) >= assay.data(rightAmount);
    },

    // Set union of erights.
    // Describe all the erights described by `leftAmount` and those
    // described by `rightAmount`.
    with(leftAmount, rightAmount) {
      return assay.make(assay.data(leftAmount) + assay.data(rightAmount));
    },

    // Covering set subtraction of erights.
    // If leftAmount does not include rightAmount, error.
    // Describe the erights described by `leftAmount` and not described
    // by `rightAmount`.
    without(leftAmount, rightAmount) {
      return assay.make(assay.data(leftAmount) - assay.data(rightAmount));
    },
  });
  return assay;
}
harden(makeNatAssay);

function makeMetaSingleAssayMaker(baseLabelToAssay) {
  function makeMetaSingleAssay(metaLabel) {
    mustBeComparable(metaLabel);

    // memoize well formedness check.
    const metaBrand = new WeakSet();

    const metaAssay = harden({
      getLabel() {
        return metaLabel;
      },

      // Given the raw data that this kind of amount would label, return
      // an amount so labeling that data.
      make(allegedBaseAmount) {
        const baseAssay = baseLabelToAssay.get(allegedBaseAmount.label);
        const baseAmount = baseAssay.make(allegedBaseAmount.data);
        const metaAmount = harden({ metaLabel, data: baseAmount });
        metaBrand.add(metaAmount);
        return metaAmount;
      },

      // Is this an amount object made by this assay? If so, return
      // it. Otherwise error.
      vouch(metaAmount) {
        check(metaBrand.has(metaAmount))`\
Unrecognized metaAmount: ${metaAmount}`;
        return metaAmount;
      },

      // Is this like an amount object made by this assay, such as one
      // received by pass-by-copy from an otherwise-identical remote
      // amount? On success, return an amount object made by this
      // assay. Otherwise error.
      //
      // Until we have good support for pass-by-construction, the full
      // assay style is too awkward to use remotely. See
      // mintTestAssay. So coerce also accepts a bare number which it
      // will coerce to a labeled number via metaAssay.make.
      coerce(metaAmountLike) {
        if (metaBrand.has(metaAmountLike)) {
          return metaAmountLike;
        }
        const {
          label: allegedMetaLabel,
          data: allegedBaseAmount,
        } = metaAmountLike;
        check(sameStructure(metaLabel, allegedMetaLabel))`\
Unrecognized label: ${allegedMetaLabel}`;
        // Will throw on inappropriate data
        return metaAssay.make(allegedBaseAmount);
      },

      // Return the raw data that this amount labels.
      data(metaAmount) {
        return metaAssay.vouch(metaAmount).data;
      },

      // Represents the empty set of erights, i.e., no erights
      empty() {
        return metaAssay.make(0);
      },

      isEmpty(amount) {
        return metaAssay.data(amount) === 0;
      },

      // Set inclusion of erights.
      // Does the set of erights described by `leftAmount` include all
      // the erights described by `rightAmount`?
      includes(leftMetaAmount, rightMetaAmount) {
        const leftBaseAmount = leftMetaAmount.data;
        const leftBaseLabel = leftBaseAmount.label;
        const rightBaseAmount = rightMetaAmount.data;
        const rightBaseLabel = rightBaseAmount.label;

        if (!sameStructure(leftBaseLabel, rightBaseLabel)) {
          return false;
        }
        const baseAssay = baseLabelToAssay.get(leftBaseLabel);

        return baseAssay.includes(leftBaseAmount, rightBaseAmount);
      },

      // Set union of erights.
      // Describe all the erights described by `leftAmount` and those
      // described by `rightAmount`.
      with(leftMetaAmount, rightMetaAmount) {
        const leftBaseAmount = leftMetaAmount.data;
        const leftBaseLabel = leftBaseAmount.label;
        const rightBaseAmount = rightMetaAmount.data;
        const rightBaseLabel = rightBaseAmount.label;

        check(sameStructure(leftBaseLabel, rightBaseLabel))`\
Cannot yet combine different base rights: ${leftBaseLabel}, ${rightBaseLabel}`;
        const baseAssay = baseLabelToAssay.get(leftBaseLabel);

        return baseAssay.with(leftBaseAmount, rightBaseAmount);
      },

      // Covering set subtraction of erights.
      // If leftAmount does not include rightAmount, error.
      // Describe the erights described by `leftAmount` and not described
      // by `rightAmount`.
      without(leftMetaAmount, rightMetaAmount) {
        const leftBaseAmount = leftMetaAmount.data;
        const leftBaseLabel = leftBaseAmount.label;
        const rightBaseAmount = rightMetaAmount.data;
        const rightBaseLabel = rightBaseAmount.label;

        check(sameStructure(leftBaseLabel, rightBaseLabel))`\
Cannot yet subtract different base rights: ${leftBaseLabel}, ${rightBaseLabel}`;
        const baseAssay = baseLabelToAssay.get(leftBaseLabel);

        return baseAssay.without(leftBaseAmount, rightBaseAmount);
      },
    });
    return metaAssay;
  }
  return harden(makeMetaSingleAssay);
}
harden(makeMetaSingleAssayMaker);

export { makeNatAssay, makeMetaSingleAssayMaker };
