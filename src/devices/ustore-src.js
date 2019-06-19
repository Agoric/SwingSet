import harden from '@agoric/harden';

export default function setup(syscall, state, helpers, endowments) {
  const { bridge, stores } = endowments;
  const buffered = {};

  return helpers.makeDeviceSlots(
    syscall,
    state,
    s => {
      const { SO, getDeviceState, setDeviceState } = s;
      let watchers = getDeviceState() || {};

      let handlers;

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

      function notifyAll(addr) {
        addr = String(addr);
        const store = stores[addr];
        if (!store) {
          throw Error(`No store to notify for ${addr}`);
        }

        if (!watchers[addr]) {
          return;
        }

        for (const key of Object.keys(watchers[addr])) {
          handlers.notify(addr, key, handlers.read(addr, key));
        }
      }

      bridge.afterSetStore = function afterSetStore(addr) {
        // Work through the watchers and send notifications that changed.
        notifyAll(addr);

        // Perform any buffered requests.
        const bufs = buffered[addr];
        delete buffered[addr];
        if (bufs) {
          for (const [key, data] of bufs) {
            // console.log(`Buffered ${addr} ${key}`, data);
            handlers.write(addr, key, data);
          }
        }
      };

      handlers = harden({
        notify(addr, key, data) {
          // console.log(`actually notifying ${addr} ${key} ${data}`);
          if (data === undefined || data === null) {
            // No data to notify.
            return;
          }
          const wlist = watchers[addr];
          if (!wlist) {
            // console.log(`No watchers for ${addr}`);
            return;
          }
          const ws = wlist[key];
          if (!ws) {
            // console.log(`No key watchers for ${addr} ${key}`);
            return;
          }
          const [objs, lastData] = ws;
          data = String(data);
          if (data === lastData) {
            // Don't notify, no change.
            // console.log(`No change for ${data}`);
            return;
          }

          // Update the lastData.
          const newWlist = { ...wlist, [key]: [objs, data] };
          watchers = { ...watchers, [addr]: newWlist };
          // console.log('notify watchers', inspect(watchers));
          setDeviceState(harden(watchers));

          for (const obj of objs) {
            console.log(`calling ${obj} with ${data}`);
            SO(obj).nextUserState(key, data);
          }
        },

        write(addr, key, data) {
          const store = stores[addr];
          if (!store) {
            console.log(
              `stores[${addr}] doesn't exist, buffering ${key}`,
              data,
            );
            if (!buffered[addr]) {
              buffered[addr] = [];
            }
            buffered[addr].push([key, data]);
            return;
          }
          store.sendMsg(
            JSON.stringify({
              method: 'set',
              key: `ustore.${key}`,
              value: data,
            }),
          );
          // console.log(`Written ${addr} ${key}`, data, ret);
          handlers.notify(addr, key, data);
        },

        read(addr, key) {
          addr = String(addr);
          const store = stores[addr];
          if (!store) {
            throw Error(`${addr} reader not yet registered`);
          }
          key = String(key);
          const storekey = key === '' ? `ustore` : `ustore.${key}`;
          return JSON.parse(
            store.sendMsg(JSON.stringify({ method: 'get', key: storekey })),
          );
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
          setDeviceState(harden(watchers));
          if (lastData !== null) {
            // Bring the listener up-to-speed.
            SO(obj).next(lastData);
          }
          return harden({
            unwatch() {
              return handlers.unwatch(addr, key, obj);
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
          setDeviceState(harden(watchers));
        },
      });
      return handlers;
    },
    helpers.name,
  );
}
