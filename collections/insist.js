// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

// TODO: Should we just use a TypeError, like everyone else?
class CheckError extends Error {
  constructor(message) {
    super(message);
    harden(this);
  }
}
Object.defineProperties(CheckError.prototype, {
  name: { value: 'CheckError' },
  message: { value: '' },
});
harden(CheckError);

// Insist that expr is truthy with a tagged template literal like
// check(expr)`....`
// If expr is falsy, then the template contents are reported to the
// console and also in a thrown error.
//
// The literal portions of the template are assumed non-sensitive, as
// are the typeof types of the substitution values. These are
// assembles into the thrown error message. The actual contents of the
// substitution values are assumed sensitive, to be revealed to the
// console only. We assume only the virtual platform's owner can read
// what is written to the console, where the owner is in a privileged
// position over computation running on that platform.
function check(flag) {
  function tag(template, ...args) {
    if (flag) {
      return;
    }
    const interleaved = [template[0]];
    const parts = [template[0]];
    for (let i = 0; i < args.length; i++) {
      interleaved.push(args[i], template[i + 1]);
      parts.push('(a ', typeof args[i], ')', template[i + 1]);
    }
    if (args.length >= 1) {
      parts.push('\nSee console for error data.');
    }
    console.error(...interleaved);
    throw new CheckError(parts.join(''));
  }
  return harden(tag);
}
harden(check);

export { CheckError, check };
