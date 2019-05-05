import { makePromise } from '../../src/kernel/makePromise';

// TODO Reconcile with spec of Promise.allSettled
function allSettled(promises) {
  const result = makePromise();
  const list = [];
  const len = promises.length;
  let count = len;
  for (let i = 0; i < len; i += 1) {
    Promise.resolve(promises[i]).then(
      v => {
        list[i] = v;
        count -= 1;
        if (count === 0) {
          result.res(list);
        }
      },
      reason => {
        list[i] = promises[i];
        count -= 1;
        if (count === 0) {
          result.res(list);
        }
      });
    return result.p;
  }
}

export { allSettled };
