// Copyright (C) 2013 Google Inc, under Apache License 2.0
// Copyright (C) 2018 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

function makeFred(_E, _host) {
  function init(_timerP, _myMoneyPurseP, _myStockPurseP, _myFinPurseP) {}

  const fred = harden({
    init,
    acceptOptionOffer(_allegedChitPaymentP) {},
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
