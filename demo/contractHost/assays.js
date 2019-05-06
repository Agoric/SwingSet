// Copyright (C) 2019 Agoric, under Apache License 2.0

import Nat from '@agoric/nat';
import harden from '@agoric/harden';

import { check } from '../../collections/insist';
import {
  sameStructure,
  mustBeComparable,
} from '../../collections/sameStructure';

// Return an assayOps, which makes assays, validates assays, and
// provides set operations over assays. An assay is a pass-by-copy
// description of some set of erights.
//
// The default assayOps makes the default kind of assay.  The default
// kind of assay is a labeled natural number describing a quantity of
// fungible erights. The label describes what kinds of rights these
// are. This is a form of labeled unit, as in unit typing.
function makeNatOps(label) {
  mustBeComparable(label);

  // memoize well formedness check.
  const brand = new WeakSet();

  const ops = harden({
    getLabel() {
      return label;
    },

    // Given the raw data that this kind of assay would label, return
    // an assay so labeling that data.
    make(allegedData) {
      const assay = harden({ label, data: Nat(allegedData) });
      brand.add(assay);
      return assay;
    },

    // Is this an assay object made by this assayOps? If so, return
    // it. Otherwise error.
    vouch(assay) {
      check(brand.has(assay))`\
Unrecognized assay: ${assay}`;
      return assay;
    },

    // Is this like an assay object made by this assayOps, such as one
    // received by pass-by-copy from an otherwise-identical remote
    // assay? On success, return an assay object made by this
    // assayOps. Otherwise error.
    //
    // Until we have good support for pass-by-construction, the full
    // assay style is too awkward to use remotely. See
    // mintTestAssay. So coerce also accepts a bare number which it
    // will coerce to a labeled number via ops.make.
    coerce(assayLike) {
      if (typeof assayLike === 'number') {
        // Will throw on inappropriate number
        return ops.make(assayLike);
      }
      if (brand.has(assayLike)) {
        return assayLike;
      }
      const { label: allegedLabel, data } = assayLike;
      check(sameStructure(label, allegedLabel))`\
Unrecognized label: ${allegedLabel}`;
      // Will throw on inappropriate data
      return ops.make(data);
    },

    // Return the raw data that this assay labels.
    data(assay) {
      return ops.vouch(assay).data;
    },

    // Represents the empty set of erights, i.e., no erights
    empty() {
      return ops.make(0);
    },

    isEmpty(assay) {
      return ops.data(assay) === 0;
    },

    // Set inclusion of erights.
    // Does the set of erights described by `leftAssay` include all
    // the erights described by `rightAssay`?
    includes(leftAssay, rightAssay) {
      return ops.data(leftAssay) >= ops.data(rightAssay);
    },

    // Set union of erights.
    // Describe all the erights described by `leftAssay` and those
    // described by `rightAssay`.
    with(leftAssay, rightAssay) {
      return ops.make(ops.data(leftAssay) + ops.data(rightAssay));
    },

    // Covering set subtraction of erights.
    // If leftAssay does not include rightAssay, error.
    // Describe the erights described by `leftAssay` and not described
    // by `rightAssay`.
    without(leftAssay, rightAssay) {
      return ops.make(ops.data(leftAssay) - ops.data(rightAssay));
    },
  });
  return ops;
}
harden(makeNatOps);

function makeMetaTicketOpsMaker(baseLabelToOps) {
  function makeMetaOps(metaLabel) {
    mustBeComparable(metaLabel);

    // memoize well formedness check.
    const metaBrand = new WeakSet();

    const metaOps = harden({
      getLabel() {
        return metaLabel;
      },

      // Given the raw data that this kind of assay would label, return
      // an assay so labeling that data.
      make(allegedBaseAssay) {
        const baseOps = baseLabelToOps.get(allegedBaseAssay.label);
        const baseAssay = baseOps.make(allegedBaseAssay.data);
        const metaAssay = harden({ metaLabel, data: baseAssay });
        metaBrand.add(metaAssay);
        return metaAssay;
      },

      // Is this an assay object made by this assayOps? If so, return
      // it. Otherwise error.
      vouch(metaAssay) {
        check(metaBrand.has(metaAssay))`\
Unrecognized metaAssay: ${metaAssay}`;
        return metaAssay;
      },

      // Is this like an assay object made by this assayOps, such as one
      // received by pass-by-copy from an otherwise-identical remote
      // assay? On success, return an assay object made by this
      // assayOps. Otherwise error.
      //
      // Until we have good support for pass-by-construction, the full
      // assay style is too awkward to use remotely. See
      // mintTestAssay. So coerce also accepts a bare number which it
      // will coerce to a labeled number via metaOps.make.
      coerce(metaAssayLike) {
        if (metaBrand.has(metaAssayLike)) {
          return metaAssayLike;
        }
        const {
          label: allegedMetaLabel,
          data: allegedBaseAssay,
        } = metaAssayLike;
        check(sameStructure(metaLabel, allegedMetaLabel))`\
Unrecognized label: ${allegedMetaLabel}`;
        // Will throw on inappropriate data
        return metaOps.make(allegedBaseAssay);
      },

      // Return the raw data that this assay labels.
      data(metaAssay) {
        return metaOps.vouch(metaAssay).data;
      },

      // Represents the empty set of erights, i.e., no erights
      empty() {
        return metaOps.make(0);
      },

      isEmpty(assay) {
        return metaOps.data(assay) === 0;
      },

      // Set inclusion of erights.
      // Does the set of erights described by `leftAssay` include all
      // the erights described by `rightAssay`?
      includes(leftMetaAssay, rightMetaAssay) {
        const leftBaseAssay = leftMetaAssay.data;
        const leftBaseLabel = leftBaseAssay.label;
        const rightBaseAssay = rightMetaAssay.data;
        const rightBaseLabel = rightBaseAssay.label;

        if (!sameStructure(leftBaseLabel, rightBaseLabel)) {
          return false;
        }
        const baseOps = baseLabelToOps.get(leftBaseLabel);

        return baseOps.includes(leftBaseAssay, rightBaseAssay);
      },

      // Set union of erights.
      // Describe all the erights described by `leftAssay` and those
      // described by `rightAssay`.
      with(leftMetaAssay, rightMetaAssay) {
        const leftBaseAssay = leftMetaAssay.data;
        const leftBaseLabel = leftBaseAssay.label;
        const rightBaseAssay = rightMetaAssay.data;
        const rightBaseLabel = rightBaseAssay.label;

        check(sameStructure(leftBaseLabel, rightBaseLabel))`\
Cannot yet combine different base rights: ${leftBaseLabel}, ${rightBaseLabel}`;
        const baseOps = baseLabelToOps.get(leftBaseLabel);

        return baseOps.with(leftBaseAssay, rightBaseAssay);
      },

      // Covering set subtraction of erights.
      // If leftAssay does not include rightAssay, error.
      // Describe the erights described by `leftAssay` and not described
      // by `rightAssay`.
      without(leftMetaAssay, rightMetaAssay) {
        const leftBaseAssay = leftMetaAssay.data;
        const leftBaseLabel = leftBaseAssay.label;
        const rightBaseAssay = rightMetaAssay.data;
        const rightBaseLabel = rightBaseAssay.label;

        check(sameStructure(leftBaseLabel, rightBaseLabel))`\
Cannot yet subtract different base rights: ${leftBaseLabel}, ${rightBaseLabel}`;
        const baseOps = baseLabelToOps.get(leftBaseLabel);

        return baseOps.without(leftBaseAssay, rightBaseAssay);
      },
    });
    return metaOps;
  }
  return harden(makeMetaOps);
}
harden(makeMetaTicketOpsMaker);

export { makeNatOps, makeMetaTicketOpsMaker };
