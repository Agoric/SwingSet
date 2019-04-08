import harden from '@agoric/harden';

console.log(`loading bootstrap.js`);

const key1 = 'abc';

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    E =>
      harden({
        async bootstrap(argv, vats) {
          console.log('bootstrap() called');
          const m = await E(vats.mint).makeMint();
          const purse1 = await E(m).mint(100, 'purse1');
          const initialClist = harden({
            [key1]: [purse1],
          });
          await E(vats.inbound).init(initialClist);
          console.log('all vats initialized');
        },
      }),
    helpers.vatID,
  );
}
