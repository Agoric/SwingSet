const harden = require('@agoric/harden');

function setup(syscall, state, helpers, endowments) {
  const { log } = helpers;
  const dispatch = harden({
    invoke(targetID, method, _args) {
      log(`invoke ${targetID} ${method}`);
      endowments.shared.push('pushed');
      return harden({ body: JSON.stringify([]), slots: [] });
    },
    getState() {
      return '';
    },
  });
  return dispatch;
}

export { setup };
