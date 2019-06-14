import harden from '@agoric/harden';

export default function setup(syscall, state, helpers, endowments) {
  const { bridge, connect } = endowments;

  return helpers.makeDeviceSlots(
    syscall,
    state,
    s => {
      connect(s);
      return harden({
        write(addr, key, str) {
          return bridge.write(addr, key, str);
        },
        read(addr, key) {
          return bridge.read(addr, key);
        },
        notify(addr, key, str) {
          return bridge.notify(addr, key, str);
        },
        watch(addr, key, fn) {
          return bridge.watch(addr, key, fn);
        },
      });
    },
    helpers.name,
  );
}
