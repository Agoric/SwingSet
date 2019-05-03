// Copyright (C) 2019 Agoric, under Apache License 2.0


import harden from '@agoric/harden';


class CheckError extends Error {
  constructor(message) {
    super(message);
    harden(this);
  }
}
Object.defineProperties(CheckError.prototype, {
  name: { value: 'CheckError' },
  message: { value: '' }
});
harden(CheckError);


function check(flag) {
  return harden(function tag(template, ...args) {
    if (flag) {
      return;
    }
    const interleaved = [template[0]];
    for (let i = 0; i < args.length; i++) {
      interleaved.push(args[i], template[i+1]);
    }
    console.error(...interleaved);
    throw new CheckError(interleaved.join(''));
  });
}
harden(check);


export { CheckError, check };
