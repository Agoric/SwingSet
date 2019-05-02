// Copyright (C) 2019 Agoric
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import Nat from '@agoric/nat';
import harden from '@agoric/harden';

// Return an assay factory, which makes assays, validates assays, and
// provides set operations over assays. An assay is a pass-by-copy
// description of some set of erights.
//
// The default assay factory makes the default kind of assay.  The
// default kind of assay is a labeled natural number describing a
// quantity of fungible erights. The label is used only for an
// identity check. The label is normally a presence of the issuer
// describing what kinds of rights these are. This is a form of
// labeled unit, as in unit typing.
export function makeNatOps(label) {
  // memoize well formedness check.
  const brand = new WeakSet();

  const ops = harden({
    
    // Given the raw data that this kind of assay would label, return
    // an assay so labeling that data.
    make(allegedData) {
      const assay = harden({label, data: Nat(allegedData)});
      brand.add(assay);
      return assay;
    },
    
    // Is this an assay object made by this factory? If so, return
    // it. Otherwise error.
    vouch(assay) {
      if (brand.has(assay)) {
        return assay;
      }
      throw new TypeError(`unrecognized assay`);
    },

    // Is this like an assay object made by this factory, such as one
    // received by pass-by-copy from an otherwise-identical remote
    // assay? On success, return an assay object made by this
    // factory. Otherwise error.
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
      if (!Object.is(allegedLabel, label)) {
        throw new TypeError(`unrecognized label`);
      }
      // Will throw on inappropriate data
      return ops.make(data);
    },

    // Return the raw data that this assay labels.
    data(assay) {
      return ops.vouch(assay).data;
    },

    // Represents the empty set of erights, i.e., no erights
    empty() { return ops.make(0); },

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

    // Set subtraction of erights.
    // Describe the erights described by `leftAssay` and not described
    // by `rightAssay`.
    without(leftAssay, rightAssay) {
      return ops.make(ops.data(leftAssay) - ops.data(rightAssay));
    },
  });
  return ops;
}
