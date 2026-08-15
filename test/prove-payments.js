/**
 * Adversarial tests for on-chain payment verification.
 *
 * This is the module that decides whether someone has paid, so every test here
 * is an attempt to get unlocked WITHOUT paying. A verifier that accepts a wrong
 * amount, a stale transfer, or a replayed transaction is worse than no verifier
 * at all: it would report revenue that does not exist. This machine has already
 * produced one ledger full of sales that never happened.
 */

import { makeInvoice, matchTransfer, toRawUsdc, fromRawUsdc, usdcAddress } from '../src/payments.js';

let failures = 0;
const check = (cond, msg) => {
  if (cond) console.log(`  PASS  ${msg}`);
  else { console.log(`  FAIL  ${msg}`); failures++; }
};

const SELLER = '0x72B944dA66263bE35c2a2eDFeF5c525d58fa53Df';
const ATTACKER = '0x000000000000000000000000000000000000dEaD';
const USDC_BASE = usdcAddress('base');
const NOW = Date.parse('2026-08-15T12:00:00Z');

const transfer = (over = {}) => ({
  tx_hash: over.tx || '0xaaa',
  timestamp: over.timestamp || '2026-08-15T12:05:00Z',
  total: { value: over.value || '2370000', decimals: '6' },
  token: { address_hash: over.token || USDC_BASE },
  to: { hash: over.to || SELLER },
  from: { hash: ATTACKER },
});

const invoice = { amountRaw: '2370000', createdAt: NOW };
const opts = (over = {}) => ({
  amountRaw: invoice.amountRaw,
  tokenAddress: USDC_BASE,
  toAddress: SELLER,
  notBeforeMs: NOW - 600000,
  usedHashes: [],
  ...over,
});

console.log('\n=== AMOUNT ENCODING ===');
check(toRawUsdc(2.37) === '2370000', '$2.37 encodes to 2370000 raw units (6dp)');
check(toRawUsdc(0.1) === '100000', '$0.10 encodes without float drift');
check(fromRawUsdc('2370000') === 2.37, 'raw units decode back to dollars');

console.log('\n=== INVOICE UNIQUENESS ===');
const inv = makeInvoice(2, () => 0.37);
check(inv.amount === 2.37, `base $2 + unique cents yields $${inv.amount}`);
const amounts = new Set(Array.from({ length: 60 }, () => makeInvoice(2).amount));
check(amounts.size > 20, `invoices spread across many cent values (${amounts.size} distinct in 60)`);

console.log('\n=== ACCEPTS A GENUINE PAYMENT ===');
const good = matchTransfer([transfer()], opts());
check(good !== null && good.tx === '0xaaa', 'exact-amount, correct-token, correct-recipient transfer is accepted');
check(good && good.amount === 2.37, 'settled amount is reported in dollars');

console.log('\n=== REJECTS EVERY FORGERY ===');
check(matchTransfer([transfer({ value: '2360000' })], opts()) === null,
  'rejects underpayment of one cent');
check(matchTransfer([transfer({ value: '2380000' })], opts()) === null,
  'rejects a different amount (cents are the payment reference)');
check(matchTransfer([transfer({ to: ATTACKER })], opts()) === null,
  'rejects a transfer sent to somebody else');
check(matchTransfer([transfer({ token: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' })], opts()) === null,
  'rejects a worthless look-alike token of the same amount');
check(matchTransfer([transfer({ timestamp: '2026-08-15T11:00:00Z' })], opts()) === null,
  'rejects a transfer that predates the invoice (no claiming old payments)');
check(matchTransfer([transfer({ tx: '0xspent' })], opts({ usedHashes: ['0xspent'] })) === null,
  'rejects a transaction already spent on a previous unlock (no replay)');
check(matchTransfer([transfer({ tx: '0xSPENT' })], opts({ usedHashes: ['0xspent'] })) === null,
  'replay check is case-insensitive on the tx hash');
check(matchTransfer([{ ...transfer(), tx_hash: null, transaction_hash: null }], opts()) === null,
  'rejects a transfer with no usable transaction hash');
check(matchTransfer([], opts()) === null, 'empty transfer list unlocks nothing');
check(matchTransfer(null, opts()) === null, 'null transfer list unlocks nothing');

console.log('\n=== CASE HANDLING (addresses vary in casing on-chain) ===');
check(matchTransfer([transfer({ to: SELLER.toLowerCase() })], opts()) !== null,
  'accepts a lowercased recipient address');
check(matchTransfer([transfer({ token: USDC_BASE.toUpperCase() })], opts()) !== null,
  'accepts an uppercased token address');

console.log('\n=== FIELD-NAME TOLERANCE ===');
check(matchTransfer([{ ...transfer(), tx_hash: undefined, transaction_hash: '0xbbb' }], opts()) !== null,
  'accepts transaction_hash as well as tx_hash');

console.log(`\n${failures === 0 ? 'ALL PAYMENT CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
