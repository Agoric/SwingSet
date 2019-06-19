/*
  The 'ustore' device manages a user-level store that enables change
  notifications when the state is updated.  The notification watchers
  are persistent, though the actual state and store configurations are
  not.  This allows reconfiguring the stores as a normal process, since
  the watchers are bound to store addresses and store keys.

  It is intended for use by vats that want to access persistent keyed
  string data while using the device (D) path rather than the eventual-send
  (E) path.  This is especially useful on-chain, where the public chain state
  can be followed by ag-solo vats, and public chain state updates are
  propagated to the follower's vats without needing explicit messaging
  from the chain to the specific follower.

  Note that when a watcher is installed it will be called once
  for the last known state, and not again until the address and key it
  is watching changes.
*/

export default function buildUserStore() {
  const stores = {};
  const bridge = {};
  const srcPath = require.resolve('./ustore-src');

  function setStore(addr, store) {
    if (store) {
      stores[addr] = store;

      // console.log(`FIGME: Calling`, bridge.afterSetStore);
      if (bridge.afterSetStore) {
        bridge.afterSetStore(addr, store);
      }
    } else {
      delete stores[addr];
    }
  }

  return {
    srcPath,
    endowments: { bridge, stores },
    setStore, // for external access
  };
}
