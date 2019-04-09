#!/usr/bin/env node

// or: npx lotion-cli state GCI
// npx lotion-cli send GCI TXDATA

const lotion = require('lotion');

const messages = [
  { index: 0, methodName: 'getIssuer', args: [], resultIndex: 1},
  { index: 1, methodName: 'makeEmptyPurse', args: ['purse2'], resultIndex: 2},
  { index: 2, methodName: 'deposit', args: [20, {'@qclass': 'index', index: 0}], resultIndex: 3},
  { index: 2, methodName: 'getBalance', args: [], resultIndex: 4},
  { index: 0, methodName: 'getBalance', args: [], resultIndex: 5},
];

async function main() {
  let argv = process.argv.splice(2);
  const GCI = argv.shift();
  const which = Number(argv.shift());
  const msg = messages[which];
  if (!msg) {
    throw new Error(`bad index ${which}`);
  }

  const { state, send } = await lotion.connect(GCI);
  const result = await send(JSON.stringify(messages[which]));
  console.log(`result:`, result);
  const counters = await state.counters;
  console.log(`counters:`, counters);
  
}

main();
