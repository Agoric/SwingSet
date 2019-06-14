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

import harden from '@agoric/harden';
/*
import util from 'util';
const inspect = (obj) => util.inspect(obj, false, 10);
*/

export default function buildUserStore() {
  const stores = {};
  let watchers = {}; // persisted in device state
  const srcPath = require.resolve('./ustore-src');

  let mySO;
  let mySetDeviceState;

  function cloneWithException(obj, key, fn) {
    const newObj = {};
    Object.keys(obj).forEach(k => {
      if (k === key) {
        const newVal = fn();
        if (newVal !== undefined) {
          newObj[k] = newVal;
        }
      } else {
        newObj[k] = obj[k];
      }
    });
    return newObj;
  }

  // not hardened
  const bridge = {
    notify(addr, key, data) {
      const wlist = watchers[addr];
      if (!wlist) {
        return;
      }
      const ws = wlist[key];
      if (!ws) {
        return;
      }
      const [objs, lastData] = ws;
      const thisData = data === undefined ? lastData : data;
      if (thisData === null) {
        // Don't notify, no data.
        return;
      }
      if (`${thisData}` === lastData) {
        // Don't notify, no change.
      }
      if (!mySO) {
        throw Error(`notify before connect`);
      }

      // Update the thisData.
      const newWlist = { ...wlist, [key]: [objs, thisData] };
      watchers = { ...watchers, [addr]: newWlist };
      // console.log('notify watchers', inspect(watchers));
      mySetDeviceState(harden(watchers));

      for (const obj of objs) {
        mySO(obj).next(thisData);
      }
    },

    write(addr, key, data) {
      const store = stores[addr];
      if (!store) {
        throw Error(`${addr} writer not yet registered`);
      }
      store.sendMsg(JSON.stringify({ method: 'set', key, value: data }));
      bridge.notify(addr, key, data);
    },

    read(addr, key) {
      addr = String(addr);
      const store = stores[addr];
      if (!store) {
        throw Error(`${addr} reader not yet registered`);
      }
      key = String(key);
      return store.sendMsg(JSON.stringify({ method: 'get', key }));
    },

    watch(addr, key, obj) {
      let wlist = watchers[addr];
      if (!wlist) {
        wlist = {};
      }
      key = String(key);
      let ws = wlist[key];
      if (!ws) {
        ws = [[], null];
      }
      const [objs, lastData] = ws;
      if (objs.indexOf(obj) >= 0) {
        throw Error(`Object ${obj} is already listening`);
      }
      // watchers is immutable, so reconstruct it.
      ws = [[...objs, obj], lastData];
      wlist = { ...wlist, [key]: ws };
      watchers = { ...watchers, [addr]: wlist };
      // console.log('watch watchers', inspect(watchers));
      mySetDeviceState(harden(watchers));
      if (lastData !== null) {
        // Bring the listener up-to-speed.
        mySO(obj).next(lastData);
      }
      return harden({
        unwatch() {
          return bridge.unwatch(addr, key, obj);
        },
      });
    },

    unwatch(addr, key, obj) {
      const wlist = watchers[addr];
      if (!wlist) {
        return;
      }
      const ws = wlist[key];
      if (!ws) {
        return;
      }
      const [objs, lastData] = ws;

      const index = objs.indexOf(obj);
      if (index < 0) {
        throw Error(`${obj} is already unwatched`);
      }

      const newObjs = objs.filter(o => o !== obj);
      const newWlist = cloneWithException(wlist, key, () =>
        newObjs.length > 0 ? [newObjs, lastData] : undefined,
      );
      watchers = cloneWithException(watchers, addr, () =>
        Object.keys(newWlist).length > 0 ? newWlist : undefined,
      );
      // console.log('unwatch watchers', inspect(watchers));
      mySetDeviceState(harden(watchers));
    },
  };

  function notifyAll(addr, key) {
    addr = String(addr);
    const store = stores[addr];
    if (!store) {
      throw Error(`No store for address ${addr}`);
    }
    key = String(key);
    bridge.notify(addr, key);
    const ret = store.sendMsg(JSON.stringify({ method: 'keys', key }));
    const keys = JSON.parse(ret);
    for (const child of keys) {
      const subKey = key === '' ? child : `${key}.${child}`;
      notifyAll(addr, subKey);
    }
  }

  function setStore(addr, store) {
    if (store) {
      stores[addr] = store;

      // Now work through the watchers and send notifications that changed.
      notifyAll(addr, '');
    } else {
      delete stores[addr];
    }
  }

  function connect({ SO, getDeviceState, setDeviceState }) {
    mySO = SO;
    watchers = getDeviceState() || {};
    mySetDeviceState = setDeviceState;
  }

  return {
    srcPath,
    endowments: { bridge, connect },
    setStore, // for external access
    ...bridge, // these are for external access
    bridge, // for debugging/testing
  };
}
