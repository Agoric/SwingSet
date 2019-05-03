// Copyright (C) 2019 Agoric, under Apache License 2.0


import Nat from '@agoric/nat';
import harden from '@agoric/harden';

import { makeMint } from './issuers';


function build(_E) {
  return harden({ makeMint });
}
harden(build);

function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(syscall, state, build, helpers.vatID);
}
export default harden(setup);
