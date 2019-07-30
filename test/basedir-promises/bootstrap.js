import harden from '@agoric/harden';
import makePromise from '../../src/kernel/makePromise';

console.log(`loading bootstrap`);

function build(E, log) {
  return harden({
    bootstrap(argv, vats) {
      const mode = argv[0];
      if (mode === 'flush') {
        Promise.resolve().then(log('then1'));
        Promise.resolve().then(log('then2'));
      } else if (mode === 'e-then') {
        E(vats.left)
          .callRight(1, vats.right)
          .then(r => log(`b.resolved ${r}`), err => log(`b.rejected ${err}`));
      } else if (mode === 'chain1') {
        const p1 = E(vats.left).call2(1);
        const p2 = E(p1).call3(2);
        p2.then(x => log(`b.resolved ${x}`));
        log(`b.call2`);
      } else if (mode === 'chain2') {
        const p1 = E(Promise.resolve(vats.left)).call2(1);
        const p2 = E(p1).call3(2);
        p2.then(x => log(`b.resolved ${x}`));
        log(`b.call2`);
      } else if (mode === 'local1') {
        const t1 = harden({
          foo(arg) {
            log(`local.foo ${arg}`);
            return 2;
          },
        });
        const p1 = E(t1).foo(1);
        p1.then(x => log(`b.resolved ${x}`));
        log(`b.local1.finish`);
      } else if (mode === 'local2') {
        const t1 = harden({
          foo(arg) {
            log(`local.foo ${arg}`);
            return 3;
          },
        });
        const p1 = E(vats.left).returnArg(t1);
        const p2 = E(p1).foo(2);
        p2.then(x => log(`b.resolved ${x}`));
        log(`b.local2.finish`);
      } else if (mode === 'send-promise1') {
        const t1 = harden({
          foo(arg) {
            log(`local.foo ${arg}`);
            return 3;
          },
        });
        const { p: p1, res: r1 } = makePromise();
        console.log(`here1`, Object.isFrozen(p1));
        const p2 = E(vats.left).takePromise(p1);
        console.log(`here2`);
        p2.then(x => log(`b.resolved ${x}`));
        r1(t1);
        log(`b.send-promise1.finish`);
      } else if (mode === 'send-promise2') {
        // the promise we send actually resolves to their side, not ours. In
        // the future this should short-circuit us.
        const p1 = E(vats.left).returnMyObject();
        const p2 = E(vats.left).takePromise(p1);
        p2.then(x => log(`b.resolved ${x}`));
        log(`b.send-promise2.finish`);
      } else if (mode === 'call-promise1') {
        const p1 = E(vats.left).returnMyObject();
        const p2 = E(p1).foo();
        p2.then(x => log(`b.resolved ${x}`));
        log(`b.call-promise1.finish`);
      } else if (mode === 'harden-promise-1') {
        const { p: p1 } = makePromise();
        harden(p1);
        // in bug #95, this first call returns a (correctly) frozen Promise:
        const p2 = E(vats.left).checkHarden(p1);
        // but this one does not:
        const p3 = E(p2).checkHarden(p1, p2);
        log(`p2 frozen ${Object.isFrozen(p2)}`);
        // p3 is frozen by liveslots EPromiseHandler.get
        log(`p3 frozen ${Object.isFrozen(p3)}`);
        // p4 is frozen by liveslots makeQueued.POST, maybe
        const p4 = p2!checkHarden(p1, p2);
        log(`p4 frozen ${Object.isFrozen(p4)}`); // this fails
        Promise.all([p2, p3, p4]).then(_ => {
          log(`b.harden-promise-1.finish`);
        });
      } else {
        throw Error(`unknown mode ${mode}`);
      }
    },
  });
}

export default function setup(syscall, state, helpers) {
  function log(what) {
    helpers.log(what);
    console.log(what);
  }
  log(`bootstrap called`);
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, log),
    helpers.vatID,
  );
}
