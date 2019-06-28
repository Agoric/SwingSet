import harden from '@agoric/harden';

import { makeGallery } from '@agoric/ertp/more/pixels/gallery';

function build(E, log) {
  const canvasSize = 10;
  function stateChangeHandler(_newState) {
    // does nothing in this test
  }

  const gallery = makeGallery(E, log, stateChangeHandler, canvasSize);

  return harden(gallery.userFacet);
}
harden(build);

function setup(syscall, state, helpers) {
  function log(...args) {
    helpers.log(...args);
    console.log(...args);
  }
  log(`=> setup called`);
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, log),
    helpers.vatID,
  );
}
export default harden(setup);
