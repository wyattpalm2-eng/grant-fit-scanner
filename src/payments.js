/**
 * On-chain payment verification, done entirely from the browser.
 *
 * There is no backend and no payment processor, so nothing here can "capture" a
 * payment. Instead the buyer sends USDC directly to the seller's wallet and this
 * module proves, against a public block explorer, that the transfer landed.
 *
 * The hard problem without a backend is telling two payments apart. A fixed
 * price cannot do it: if the price is $2.00 and two people pay $2.00 in the same
 * window, either could claim either transfer. So every invoice gets a unique
 * cent value (e.g. $2.37) which acts as the payment reference. This is the same
 * trick bank-transfer checkouts have always used, and it needs no server.
 */

const EXPLORERS = {
  base: 'https://base.blockscout.com',
  ethereum: 'https://eth.blockscout.com',
  optimism: 'https://optimism.blockscout.com',
};

const USDC = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  optimism: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
};

const USDC_DECIMALS = 6;

const lc = (s) => String(s || '').toLowerCase();

/** Turn a dollar amount into raw USDC units (6dp) without float drift. */
export function toRawUsdc(dollars) {
  return String(Math.round(Number(dollars) * 10 ** USDC_DECIMALS));
}

export function fromRawUsdc(raw) {
  return Number(raw) / 10 ** USDC_DECIMALS;
}

/**
 * Build an invoice with a unique cent value so the transfer is self-identifying.
 * @param {number} basePrice dollars, e.g. 2
 */
export function makeInvoice(basePrice, rand = Math.random) {
  const cents = Math.floor(rand() * 100);
  const amount = Number((Number(basePrice) + cents / 100).toFixed(2));
  return {
    amount,
    amountRaw: toRawUsdc(amount),
    createdAt: Date.now(),
    id: `inv_${Date.now().toString(36)}_${cents}`,
  };
}

/**
 * Find a transfer that settles this invoice.
 *
 * Deliberately strict. Every condition must hold, and a transfer already spent
 * on a previous unlock is rejected outright — otherwise one payment could be
 * replayed forever.
 *
 * @returns {{tx:string, amount:number, timestamp:string}|null}
 */
export function matchTransfer(items, { amountRaw, tokenAddress, toAddress, notBeforeMs, usedHashes = [] }) {
  const used = new Set(usedHashes.map(lc));

  for (const t of items || []) {
    const hash = t.tx_hash || t.transaction_hash || null;
    if (!hash || used.has(lc(hash))) continue;

    // Right token, right recipient.
    if (lc(t.token?.address_hash) !== lc(tokenAddress)) continue;
    if (lc(t.to?.hash) !== lc(toAddress)) continue;

    // Exact amount. The unique cents are the whole identification mechanism, so
    // an approximate match would defeat the point.
    if (String(t.total?.value) !== String(amountRaw)) continue;

    // Must be no older than the invoice, so an unrelated historical transfer of
    // the same value cannot be claimed.
    const ts = Date.parse(t.timestamp);
    if (!Number.isFinite(ts) || ts < notBeforeMs) continue;

    return { tx: hash, amount: fromRawUsdc(t.total.value), timestamp: t.timestamp };
  }
  return null;
}

/** Fetch recent ERC-20 transfers into an address from a public explorer. */
export async function fetchTransfers(address, chain = 'base') {
  const base = EXPLORERS[chain];
  if (!base) throw new Error(`Unsupported chain "${chain}"`);
  const url = `${base}/api/v2/addresses/${address}/token-transfers?type=ERC-20&filter=to`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Explorer returned HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json.items) ? json.items : [];
  } catch (err) {
    clearTimeout(timer);
    throw new Error(`Could not reach the block explorer: ${err.message}`);
  }
}

/** One verification attempt. Returns the settling transfer, or null. */
export async function checkPayment({ address, chain = 'base', invoice, usedHashes = [] }) {
  const items = await fetchTransfers(address, chain);
  return matchTransfer(items, {
    amountRaw: invoice.amountRaw,
    tokenAddress: USDC[chain],
    toAddress: address,
    // Allow a little clock skew between the browser and the chain.
    notBeforeMs: invoice.createdAt - 10 * 60 * 1000,
    usedHashes,
  });
}

export const usdcAddress = (chain) => USDC[chain];
export const explorerFor = (chain) => EXPLORERS[chain];
export const explorerTxUrl = (chain, tx) => `${EXPLORERS[chain]}/tx/${tx}`;
