// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { makeMint } from '@agoric/ertp/core/issuers';
import { makePixelListAssayMaker } from '@agoric/ertp/more/pixels/pixelListAssay';

function build(_E, _log) {
  function makePixelListMint(canvasSize) {
    const makePixelListAssay = makePixelListAssayMaker(canvasSize);
    return makeMint('pixelList', makePixelListAssay);
  }
  return harden({ makePixelListMint, makeMint });
}
harden(build);

function setup(syscall, state, helpers) {
  function log(...args) {
    helpers.log(...args);
    console.log(...args);
  }
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, log),
    helpers.vatID,
  );
}
export default harden(setup);
