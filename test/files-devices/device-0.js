const harden = require('@agoric/harden');

function setup(_syscall, _state, _helpers, _endowments) {
  const dispatch = harden({
    invoke(_target, _method, _args) {
      return harden({ body: '', slots: [] });
    },
    getState() {
      return '';
    },
  });
  return dispatch;
}

export { setup };
