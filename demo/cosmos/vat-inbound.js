
import harden from '@agoric/harden';

export default function setup(syscall, state, helpers, devices) {
  const clists = new Map(); // sender -> clist

  return helpers.makeLiveSlots(
    syscall,
    state,
    E => {
      function inbound(sender, data) {
        console.log(`inbound sender='${sender}'`);
        const clist = clists.get(sender);
        const d = JSON.parse(data);
        const val = clist.get(d.index);
        const { methodName, resultIndex } = d;
        const args = d.args.map(arg => {
          if (typeof arg === 'object' && arg['@qclass'] === 'index') {
            console.log(` lookup ${arg.index}`);
            return clist.get(arg.index);
          } else {
            return arg;
          }
        });
        console.log(`inbound`, val, methodName, d.args, args);
        const p = E(val)[methodName](...args);
        if (resultIndex) {
          clist.set(resultIndex, p);
          p.then(val => console.log(`resultIndex[${resultIndex}] resolved to ${val}`),
                 err => console.log(`resultIndex[${resultIndex}] rejected to ${val}`),
                );
        }
      }
      devices.inbound.registerInboundCallback(inbound);

      return harden({
        async init(initialClist) {
          console.log(`initialClist is`, initialClist);
          Object.getOwnPropertyNames(initialClist).forEach(sender => {
            const contents = initialClist[sender];
            if (!clists.has(sender)) {
              clists.set(sender, new Map());
            }
            const clist = clists.get(sender);
            contents.forEach((val, index) => {
              clist.set(index, val);
            });
          });
          console.log('initialClist configured');
        },
      });
    },
    helpers.vatID,
  );
}
