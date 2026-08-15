# Crypto payments — LIVE

**Status: live and taking payments** at https://wyattpalm2-eng.github.io/grant-fit-scanner/

No KYC. No payment processor. No backend. No account anywhere. Buyers send USDC straight to your
wallet and the browser proves it landed.

## How it works

1. Visitor runs a free scan and sees the top 5 ranked matches.
2. The rest are gated behind an invoice for a **unique amount** — e.g. `$2.45 USDC`.
3. They send exactly that to your address on Base.
4. Their browser queries a public block explorer, finds the matching transfer, and unlocks
   full results for 30 days.

**The unique cents are the whole mechanism.** Without a backend there is no session to attach a
payment to, so a fixed price could not tell two concurrent buyers apart. Varying the cents makes
each transfer self-identifying — the same trick bank-transfer checkouts have always used.

## Your wallet

Currently `0x26e967c1e708aC62Ebe6BF66f51061E555fc6ebd`, set in [`config.js`](config.js).

Chosen because it is *verified* controllable: the private key is in `x402-seller/wallet.json` on
this machine, and that file is gitignored and was never committed — checked deliberately, since
the x402-seller repo is public.

**Two things to act on:**
1. It is an auto-generated hot wallet with a plaintext private key on a single machine. Fine for
   small revenue. Move to a wallet you actively custody before a real balance builds up.
2. To change it, edit one line in `config.js` and push. Nothing else needs touching.

## What is verified

`npm run prove:payments` — 20 adversarial tests, every one an attempt to unlock **without paying**:

- underpayment by a single cent → rejected
- any other amount → rejected (the cents are the reference)
- transfer sent to a different address → rejected
- worthless look-alike token of the same face value → rejected
- transfer that predates the invoice → rejected (no claiming old payments)
- replay of an already-spent transaction → rejected, case-insensitively
- missing transaction hash, empty list, null list → unlock nothing

Confirmed live: clicking "verify payment" with no payment sent does **not** unlock and stores
nothing.

## The honest limitation

This is a client-side gate on a static site. Someone comfortable with browser dev tools can bypass
it. That is inherent to having no backend — there is no server to hold the results back. For a $2
tool it is an acceptable trade, and it is documented rather than hidden.

If bypass ever costs real money, the fix is `server/server.js` (below), where the results never
leave the server until payment settles.

## Server alternative (x402, if you outgrow the static gate)

`server/server.js` implements a real x402 paywall — the buyer cannot obtain results at all without
settling. Deploys to Render's free tier with only an email and GitHub, still no KYC. Set `PAY_TO`
and run. Verified by `npm run prove:server` (22 checks), including the HEAD-request guard that
previously let crawlers manufacture 44 phantom sales.

## Still true, and worth remembering

Crypto payment removes the KYC step but not the demand problem. Nonprofit finance officers and
grant writers overwhelmingly do not hold USDC, so expect low conversion from the audience this
product was built for. The free tier exists precisely because of that: it is the discovery layer,
it costs nothing to run, and it is what search engines and shared links land on.

The card-payment path (Apify, requires KYC, buyers can actually pay) is still built and one command
from live if you change your mind — see [ACTIVATE.md](ACTIVATE.md).
