# Turn on the money — 3 steps, ~15 minutes, once

Everything else is done. The product works, the free site is live and public, the paid tier is
built, and the funnel between them is wired and tested. This file is the only thing left.

**Live free site:** https://wyattpalm2-eng.github.io/grant-fit-scanner/

---

## How this earns

```
   Free browser scan  ──►  Upgrade card  ──►  Apify actor  ──►  Apify bills the
   (live now, public)      (auto-renders)     (paid tier)       customer, pays you 80%
   the discovery layer                                          
```

The free tool is not charity — it is the marketing. It ranks in Google, costs nothing to run,
and every scan ends with an upgrade card pointing at the paid version. The paid version lives on
Apify because Apify already solves the three things you cannot bootstrap alone: **card payments,
marketplace traffic, and payouts.**

You keep 80% of revenue. Suggested pricing bills a 50-result scan at about **$1.05**, against
Instrumentl at **$299/month**. You are not out-featuring a funded competitor; you are letting a
small nonprofit pay a dollar instead of signing a $3,588 annual contract.

---

## Step 1 — Apify account + KYC (~10 min, once, ever)

1. Sign up: https://console.apify.com/sign-up
2. Complete KYC: https://console.apify.com/billing

**This is the irreducible step and the only one.** Apify pays a verified legal identity because
anti-money-laundering law requires it. No script can be you. Without KYC the actor still runs and
still bills — the money just never releases.

## Step 2 — Publish the actor (~3 min)

```bash
pwsh -File "C:\Users\ClawBot\grant-fit-scanner\setup.ps1"
```

It installs the CLI, re-runs the full test suite against live federal data, **refuses to publish
if anything fails**, logs you in, builds, and pushes.

Then in the console, two settings the CLI cannot reach:

- **Monetization → Pay per event**
  - `scan-started` → **$0.05**
  - `opportunity-scored` → **$0.02**
- **Publish to Store**
  - Categories: **Lead generation** and **Business**
  - Description: paste the top of `README.md`
  - Run it once from the console so the store page shows a successful run — an actor with zero
    runs reads as dead to anyone who finds it

## Step 3 — Connect the funnel (~1 min)

Copy your published actor URL into [`config.js`](config.js):

```js
apifyActorUrl: 'https://apify.com/YOUR_USERNAME/federal-grant-fit-scanner',
```

```bash
cd "C:\Users\ClawBot\grant-fit-scanner" && git add -A && git commit -m "Activate paid tier" && git push
```

GitHub Pages redeploys in about a minute. Every free scan now ends with a live upgrade CTA.
**That is the whole activation.** Verified working — the card renders, the link resolves, and the
heading reports real numbers ("Showing 25 of 50 scanned").

---

## Then: get people there

Publishing without traffic is the exact failure that produced $0 three times on this machine.
Two channels, both already prepared:

**Passive, compounding — already done.** Apify store pages and GitHub Pages both rank in Google.
The README and site copy target `grants.gov api`, `federal grant eligibility checker`,
`Instrumentl alternative`, `nonprofit grant finder`, `SBIR grant search`. This runs while you sleep.

**Active, needs you — drafted and ready.** `LAUNCH_KIT.md` has five paste-ready posts for
r/nonprofit, r/grantwriting, LinkedIn, Show HN, and direct outreach. Every one leads with the
useful thing and discloses you built it, because grant communities bury ads instantly. Post one
per day, not all at once, and answer every comment — the comments drive the traffic, not the post.

You now have something those posts can point at: a working tool a stranger can use in one click
with no signup. That is what the previous three attempts never had.

## Honest expectations

First posts mostly will not convert; that is normal and not a reason to post harder. Realistic
shape: first organic users in days, first dollars within weeks, SEO compounding over months. The
free tool costs $0 to run, so there is no burn rate and no deadline — it can sit there earning
slowly and improving forever.

**What would move the needle most next:** state and local grants. Federal-only is the single
biggest gap in every grant-tool review, and it is where Instrumentl is weakest.

---

## The no-KYC alternative

If you will not do Step 1, `server/server.js` ships an x402 paywall taking USDC on Base straight
to your wallet, deployable to Render's free tier with only an email. See `CRYPTO.md`.

It is built and tested, and I do not recommend it for this product: nonprofit finance officers and
grant writers do not hold USDC. It also re-enters the discovery loop that already earned $0 — see
`CRYPTO.md` for the full accounting. Ten minutes of verification costs less than discarding every
customer who was going to pay you.
