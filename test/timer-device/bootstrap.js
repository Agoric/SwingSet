const harden = require('@agoric/harden');

export default function setup(syscall, state, helpers) {
  const { log } = helpers;
  return helpers.makeLiveSlots(
    syscall,
    state,
    (E, D) =>
      harden({
        async bootstrap(argv, vats, devices) {
          if (argv[0] === 'timer') {
            log(`starting wake test`);
            const callback = harden({
              wake() {
                log(`callback.wake()`);
              },
            });
            D(devices.timer).setWakeup(3, callback);
          } else if (argv[0] === 'repeater') {
            log(`starting repeater test`);
            const callback = harden({
              wake(cb) {
                log(`callback.wake(${cb ? 'cb' : cb})`);
              },
            });
            const rptr = D(devices.timer).createRepeater(3, 2);
            D(rptr).schedule(callback);
          } else if (argv[0] === 'repeater2') {
            log(`starting repeater test`);
            let callbackCalled = 0;
            const callback = harden({
              wake(cb) {
                callbackCalled += 1;
                if (callbackCalled < 2) {
                  D(cb).schedule(callback);
                }
                log(
                  `callback.wake(${
                    cb ? 'cb' : cb
                  }) called ${callbackCalled} times.`,
                );
              },
            });
            const rptr = D(devices.timer).createRepeater(3, 2);
            D(rptr).schedule(callback);
          } else {
            throw new Error(`unknown argv mode '${argv[0]}'`);
          }
        },
      }),
    helpers.vatID,
  );
}
