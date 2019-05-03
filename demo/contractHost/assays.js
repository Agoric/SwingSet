// Copyright (C) 2019 Agoric, under Apache License 2.0


import Nat from '@agoric/nat';
import harden from '@agoric/harden';

import { FlexMap } from '../../collections/EMap';
import { check } from '../../collections/insist';


// Return an assayOps, which makes assays, validates assays, and
// provides set operations over assays. An assay is a pass-by-copy
// description of some set of erights.
//
// The default assayOps makes the default kind of assay.  The default
// kind of assay is a labeled natural number describing a quantity of
// fungible erights. The label describes what kinds of rights these
// are. This is a form of labeled unit, as in unit typing.
//
// labelEquiv is a comparison function defining an equivalence class
// among labels. An allegedAssay object coerces only if its label
// matches.
function makeNatOps(label, labelEquiv = Object.is) {
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
      check(labelEquiv(label, allegedLabel))`\
Unrecognized label: ${allegedLabel}`;
      // Will throw on inappropriate data
      return ops.make(data);
    },

    // Return the raw data that this assay labels.
    data(assay) {
      return ops.vouch(assay).data;
    },

    // Represents the empty set of erights, i.e., no erights
    empty() { return ops.make(0); },

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


function makeMetaOps(label, labelEquiv = Object.is) {
  // memoize well formedness check.
  const brand = new WeakSet();

  const ops = harden({

    getLabel() {
      return label;
    },

    // Given the raw data that this kind of assay would label, return
    // an assay so labeling that data.  For meta assays, the data is a
    // FixedMap from alleged assayOps to non-empty alleged assays that
    // it has vouched for. Thus, a meta assay can describe an
    // arbitrary heterogenous set of erights.
    //
    // The allegedData argument can be any iterable that iterates as
    // pairs of an alleged assayOps and an alleged
    // assay. opt.make will assemble it into a FixedMap, which is a
    // single values mapping, in which all the assays for the same
    // assayOps are combined, and only retained if non-empty.
    //
    // A meta assay is well behaved if the alleged assayOps in this
    // map are well behaved. Note that, if the alleged assayOps are
    // well behaved, then the alleged assays must be well behaved as
    // well, since the assayOps vouched for the assays. The meta
    // assay has no way to enforce or check that the base assayOps
    // are indeed well behaved. IOW, the meta assay relies of all its
    // base alleged assayOps to obey the AssayOps spec.
    make(allegedData) {
      const accum = new FlexMap();
      for (const [k, v] of allegedData) {
        v = k.vouch(v);
        if (!v.isEmpty()) {
          if (accum.has(k)) {
            // We assume that the union of two non-empty sets cannot
            // be empty.
            accum.set(k, k.with(accum.get(k), v));
          } else {
            accum.set(k, v);
          }
        }
      }

      const assay = harden({ label, data: accum.takeSnapshot() });
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
    coerce(assayLike) {
      if (brand.has(assayLike)) {
        return assayLike;
      }
      const { label: allegedLabel, data } = assayLike;
      check(labelEquiv(label, allegedLabel))`\
Unrecognized label: ${allegedLabel}`;
      // Will throw on inappropriate data
      return ops.make(data);
    },

    // Return the raw data that this assay labels.
    data(assay) {
      return ops.vouch(assay).data;
    },

    // Represents the empty set of erights, i.e., no erights
    empty() { return ops.make([]); },

    isEmpty(assay) { return ops.data(assay).size === 0; },

    // Set inclusion of erights.
    // Does the set of erights described by `leftAssay` include all
    // the erights described by `rightAssay`?
    includes(leftAssay, rightAssay) {
      const leftMap = ops.data(leftAssay);
      const rightMap = ops.data(rightAssay);
      for (const [k, v] of rightMap) {
        if (!leftMap.has(k)) {
          return false;
        }
        if (!k.includes(leftMap.get(k), v)) {
          return false;
        }
      }
      return true;
    },

    // Set union of erights.
    // Describe all the erights described by `leftAssay` and those
    // described by `rightAssay`.
    with(leftAssay, rightAssay) {
      return ops.make([...ops.data(leftAssay), ...ops.data(rightAssay)]);
    },

    // Covering set subtraction of erights.
    // If leftAssay does not include rightAssay, error.
    // Describe the erights described by `leftAssay` and not described
    // by `rightAssay`.
    without(leftAssay, rightAssay) {
      const accum = ops.data(leftAssay).diverge();
      const rightMap = ops.data(rightAssay);
      for (const [k, v] of rightMap) {
        check(accum.has(k))`\
leftAssay missing rightAssay's ${k}`;
        accum.set(k, k.without(accum.get(k), v));
      }
      return ops.make(accum);
    },
  });
  return ops;
}
harden(makeMetaOps);


export { makeNatOps, makeMetaOps };
