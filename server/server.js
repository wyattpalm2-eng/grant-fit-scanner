/**
 * Crypto-paid front end for the Federal Grant Fit Scanner.
 *
 * No KYC anywhere in this path. USDC on Base settles directly to PAY_TO.
 *
 * Two deliberate design choices, both learned the hard way on this machine:
 *
 *  1. The free tier is not generosity, it is the discovery mechanism. A fully
 *     paywalled API is invisible: Coinbase Bazaar indexes on *settled payments*,
 *     so zero revenue means zero indexing means nobody ever finds it. A free
 *     endpoint that works with no wallet is the only way to break that loop.
 *
 *  2. HEAD requests are hard-blocked on paid routes. A previous server here
 *     compared req.path to its paid-path list with exact string equality, but
 *     Express matches case-insensitively and tolerates trailing slashes, so
 *     HEAD /scan/, /Scan and /SCAN all slipped the guard, dispatched to GET,
 *     and recorded sales. Uptime monitors and crawlers minted 44 phantom
 *     customers that way. The normaliser below is the fix.
 */

import express from 'express';
import { scanGrants } from '../src/core.js';

const PORT = process.env.PORT || 3000;
const NETWORK = process.env.X402_NETWORK || 'eip155:8453'; // Base mainnet
const PRICE = process.env.X402_PRICE || '$0.05';
const PAY_TO = process.env.PAY_TO || '';

const PAID_PATHS = new Set(['/scan']);

/** Case- and trailing-slash-insensitive, matching how Express actually routes. */
function normalisePath(p) {
  const base = String(p || '').split('?')[0].toLowerCase();
  return base.length > 1 ? base.replace(/\/+$/, '') : base;
}
const isPaidPath = (p) => PAID_PATHS.has(normalisePath(p));

const app = express();
app.use(express.json({ limit: '256kb' }));
app.disable('x-powered-by');

// ── Phantom-sale guard ──────────────────────────────────────────────────────
// Must run before any payment middleware. A HEAD carries no body, so it can
// never deliver value — it can only ever fabricate a sale.
app.use((req, res, next) => {
  if (req.method === 'HEAD' && isPaidPath(req.path)) {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  next();
});

// ── x402 paywall ────────────────────────────────────────────────────────────
let paywallReady = false;
if (PAY_TO && /^0x[a-fA-F0-9]{40}$/.test(PAY_TO)) {
  try {
    const { paymentMiddleware, x402ResourceServer } = await import('@x402/express');
    const { HTTPFacilitatorClient } = await import('@x402/core/server');
    const { ExactEvmScheme } = await import('@x402/evm/exact/server');

    const facilitatorUrls = (process.env.X402_FACILITATORS ||
      'https://facilitator.payai.network,https://facilitator.xpay.sh,https://facilitator.0xarchive.io'
    ).split(',').map((s) => s.trim()).filter(Boolean);

    const resourceServer = new x402ResourceServer(
      facilitatorUrls.map((url) => new HTTPFacilitatorClient({ url }))
    ).register(NETWORK, new ExactEvmScheme());

    app.use(paymentMiddleware(resourceServer, {
      'GET /scan': {
        accepts: [{ scheme: 'exact', price: PRICE, network: NETWORK, payTo: PAY_TO }],
        description: 'Full federal grant fit scan, ranked and evidence-backed.',
      },
    }));
    paywallReady = true;
    console.log(`x402 paywall active: ${PRICE} per /scan -> ${PAY_TO} on ${NETWORK}`);
  } catch (err) {
    console.error(`x402 middleware failed to load: ${err.message}`);
    console.error('Paid route will refuse requests rather than serve unpaid.');
  }
} else {
  console.warn('PAY_TO is unset or malformed. Paid route disabled; free tier still runs.');
}

// Fail closed. If the paywall did not initialise, the paid route must not serve.
app.use((req, res, next) => {
  if (isPaidPath(req.path) && !paywallReady) {
    return res.status(503).json({
      error: 'Paid endpoint unavailable: payment layer not configured.',
      free_alternative: '/demo/scan',
    });
  }
  next();
});

// ── Free tier (the discovery hook) ──────────────────────────────────────────
const demoHits = new Map();
const DEMO_WINDOW_MS = 3600000;

function parseProfile(q) {
  return {
    organizationType: q.organizationType || q.org || 'nonprofit_501c3',
    focusKeywords: (q.keywords || q.focusKeywords || '')
      .split(',').map((s) => s.trim()).filter(Boolean),
    requestedAmount: q.amount ? Number(q.amount) : undefined,
    canCostShare: q.canCostShare === 'false' ? false : undefined,
  };
}

app.get('/demo/scan', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const prev = demoHits.get(ip) || 0;
  if (now - prev < DEMO_WINDOW_MS) {
    return res.status(429).json({
      error: 'Free tier allows one scan per hour.',
      retry_after_seconds: Math.ceil((DEMO_WINDOW_MS - (now - prev)) / 1000),
      full_access: { endpoint: 'GET /scan', price: PRICE, protocol: 'x402', network: NETWORK },
    });
  }
  demoHits.set(ip, now);

  try {
    const { results, summary } = await scanGrants(parseProfile(req.query), { maxResults: 3 });
    res.json({
      tier: 'free',
      note: 'Top 3 results. GET /scan returns the full ranked set with prior-award intelligence.',
      summary,
      results,
      full_access: { endpoint: 'GET /scan', price: PRICE, protocol: 'x402', network: NETWORK },
    });
  } catch (err) {
    res.status(502).json({ error: `Upstream federal API failed: ${err.message}` });
  }
});

// ── Paid tier ───────────────────────────────────────────────────────────────
app.get('/scan', async (req, res) => {
  try {
    const { results, summary } = await scanGrants(parseProfile(req.query), {
      maxResults: Math.min(Number(req.query.maxResults) || 50, 300),
      minDaysToApply: req.query.minDaysToApply ? Number(req.query.minDaysToApply) : undefined,
      includeIneligible: req.query.includeIneligible === 'true',
    });
    // An empty result is a real answer, not an error. Say so explicitly so a
    // paying caller knows it got a valid response and why it is empty.
    res.json({
      tier: 'paid',
      summary,
      results,
      note: results.length === 0
        ? 'No opportunities matched. This is a valid result: your organization type may be ineligible for everything currently posted, or your keywords may be too narrow.'
        : undefined,
    });
  } catch (err) {
    res.status(502).json({ error: `Upstream federal API failed: ${err.message}` });
  }
});

// ── Manifest / index ────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'Federal Grant Fit Scanner',
    status: 'live',
    description:
      'Ranks live Grants.gov opportunities by whether your organization can actually win them: ' +
      'hard eligibility gate on federal applicant-type codes, deadline feasibility, award-size fit, ' +
      'and prior-award intelligence from USAspending.gov.',
    free_endpoints: ['GET /demo/scan?org=nonprofit_501c3&keywords=youth,housing'],
    paid_endpoints: ['GET /scan?org=...&keywords=...&amount=...'],
    price_per_call: PRICE,
    protocol: 'x402',
    network: NETWORK,
    pay_to: PAY_TO || null,
    paywall_active: paywallReady,
    data_sources: ['Grants.gov public API', 'USAspending.gov public API'],
    attribution: 'U.S. federal open data. No affiliation with or endorsement by any federal agency.',
  });
});

app.get('/health', (_req, res) => res.json({ ok: true, paywall: paywallReady }));

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  app.listen(PORT, () => console.log(`Grant Fit Scanner listening on :${PORT}`));
}

export { app, isPaidPath, normalisePath };
