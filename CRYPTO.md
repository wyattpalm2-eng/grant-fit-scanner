# The no-KYC path — how it works and what it costs you

You asked for crypto instead of KYC. It's built. Here is the honest accounting.

## What's built

`server/server.js` puts the scanner behind an x402 paywall. USDC on Base settles **directly to
your wallet**. No account, no identity verification, no marketplace, no payout approval, nobody
who can freeze it.

- `GET /demo/scan` — **free**, no wallet needed, 1/hour per IP, top 3 results
- `GET /scan` — **paid**, $0.05 per call in USDC
- `GET /` — machine-readable manifest for discovery crawlers

Verified by `npm run prove:server` (22 checks passing):
- Every case and slash variant of the paid path is correctly gated
- `HEAD` on paid routes returns 405 and cannot mint a phantom sale
- With `PAY_TO` unset the paid route **fails closed** (503) rather than serving free
- Free tier works with no wallet configured and still carries full evidence
- The index honestly reports `paywall_active: false` when unconfigured

## Deploy

```bash
cd "C:\Users\ClawBot\grant-fit-scanner" && npm install && npm run prove:server
```

Push to GitHub, connect the repo to Render (free tier, needs only an email and GitHub — **no
KYC**), and set one environment variable:

```
PAY_TO = your Base receive address
```

**Set that address deliberately.** `wallet.json` in `x402-seller` holds
`0x26e967c1e708aC62Ebe6BF66f51061E555fc6ebd`, which is *not* the address recorded in your notes
(`0x72B944dA66263bE35c2a2eDFeF5c525d58fa53Df`). Paying to the wrong one sends revenue somewhere
you may not control. Confirm which key you actually hold before you set it.

Once deployed it runs unattended. Nothing on this machine needs to stay on.

## What this costs you, stated plainly

**1. It does not fix discovery — it re-enters the loop that already failed.**

This is architecturally the same thing x402-seller was: no KYC, USDC to your wallet, working
paywall. That earned $0. Not because the rail was broken, but because it was absent from PayAI's
index (0 of 25,018) and Coinbase Bazaar (0 of 14,381) — and Bazaar indexes on *settled payments*.
No revenue → no indexing → no discovery → no revenue.

The free tier is the only lever against this, which is why it exists and why it needs no wallet.
It is the single most important line of code in the server.

**2. Your buyers don't hold crypto.**

This is the bigger problem and it's new. The market research that justified building this at all
was nonprofits and grant consultants paying $29–$999/month. Those are 501(c)(3) finance officers
and freelance grant writers. Approximately none of them hold USDC on Base or can pay an x402
invoice. Going crypto-only doesn't just change how you get paid — it discards the audience whose
willingness to pay was the entire reason this product looked good.

The x402-native audience is AI agents. Agents don't apply for federal grants.

**3. You still owe tax on it.** The rail changes; the income doesn't.

## The actual fork

| | Apify (KYC) | x402 (no KYC) |
|---|---|---|
| Your setup | ~10 min, once | Deploy + set an address |
| Payment rail | Cards, handled for you | USDC to your wallet |
| Discovery | Store SEO + marketplace traffic | You build it from zero |
| Can your buyers pay? | **Yes** | **Almost none of them** |
| Precedent | Untested here | **Tried, earned $0** |

Both are built. Both work. `setup.ps1` ships the Apify path, `server/server.js` ships the crypto
path, and the scanner underneath is identical.

My read, for what it's worth: ten minutes of identity verification is a smaller cost than
throwing away every customer who was going to pay you. But it's your call and both doors are open.

## If you want crypto to actually work

Then the product has to change to match the rail — the buyer must be crypto-native. That means
building for agents or traders, not grant seekers. I measured your existing crypto asset for
exactly this and it came back dead: the rug scorer has no predictive power (n=1,537, "danger"
59.1% vs 57.2% base). So that pivot needs a genuinely new product thesis, not a re-skin.

Say the word and I'll go find one. But shipping *this* product on *this* rail is selling to an
audience that cannot buy.
