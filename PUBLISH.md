# How this makes money, and how it gets found

Written for Wyatt. Blunt about what works, what doesn't, and what only you can do.

---

## 1. The revenue model

Apify **pay-per-event**. You set the prices; Apify bills the customer, takes the platform
compute cost plus 20%, and pays you the rest. You never build billing, never chase an invoice,
never need a merchant account.

Suggested opening prices (set these in the Apify console under Monetization):

| Event | Price | Why |
|---|---|---|
| `scan-started` | $0.05 | Covers a run that legitimately returns nothing |
| `opportunity-scored` | $0.02 | The actual value unit |

A 50-result scan bills **$1.05**. Instrumentl charges **$299/month**. You are not competing on
features with a funded company — you are competing on the fact that a small nonprofit can run
this for a dollar instead of signing a $3,588 annual contract.

Both event names are already wired in `src/main.js` and are charged defensively: if billing
fails, the customer still gets their results. That is deliberate.

---

## 2. Distribution — the part that actually decides this

Your last three builds were good products that nobody could find. So here is the honest split.

### What works without you doing anything (passive, compounding)

**Apify Store SEO is the whole game.** Actor pages rank in Google. The README is deliberately
written as a landing page, not documentation — it targets the phrases people actually type:

- `grants.gov api` / `grants.gov scraper`
- `federal grant eligibility checker`
- `Instrumentl alternative`
- `nonprofit grant finder`
- `SBIR grant search`
- `grant deadline tracker`

This is slow and it compounds. It is also the only channel that runs while you sleep, which is
why I spent real effort on the README rather than treating it as an afterthought.

### What requires you, and cannot be automated

I cannot create accounts, complete KYC, or post publicly on your behalf. These are yours:

1. **Apify account + KYC.** No KYC, no payout — Apify forfeits unclaimed rewards. Do this first.
2. **Publish the actor** (steps below).
3. **Post it where grant people actually are.** This is the highest-leverage hour you will spend:
   - `r/nonprofit`, `r/grantwriting`, `r/Grants` — these communities are genuinely underserved
     and hostile to spam, so lead with the free-eligibility-gate angle, not a pitch
   - Nonprofit Facebook/Slack groups and grant-writer Discords
   - LinkedIn — grant consultants live there
   - Hacker News `Show HN` — the USAspending prior-award angle is the interesting hook for that crowd

**I will draft any of these posts for your approval — just ask.** I won't post them myself.

### Honest timeline

**This will not make money today.** Anyone telling you a fresh marketplace listing earns
same-day revenue is selling something. Realistic: first organic users in days to weeks, first
dollars shortly after, compounding from SEO over months. The reason to pick this over another
clever build is that it is the only path here with *working payment rails and organic discovery
attached* — which is precisely what x402-seller never had.

If you want literal money-this-week, that is a different play: bounties (Algora, Gitcoin) or
freelance work, where the demand is already funded and waiting. Say the word and I'll go at that
instead — but it's labor, not an asset that compounds.

---

## 3. Publishing steps

```bash
npm install -g apify-cli
```

```bash
apify login
```

```bash
cd "C:\Users\ClawBot\grant-fit-scanner" && apify push
```

Then in the Apify console:

1. **Monetization** → Pay per event → add `scan-started` and `opportunity-scored` at the prices above.
2. **SEO / Description** → paste the README opening; set category to **Lead generation** *and*
   **Business**; add the keyword list from section 2.
3. **Publish to Store.**
4. Run it once from the console with a real profile so the store page shows a successful run.

---

## 4. Verify before you publish

```bash
cd "C:\Users\ClawBot\grant-fit-scanner" && npm run prove
```

That runs the gate unit tests plus two live scans and asserts the output is genuinely
input-dependent — different org types must produce different result sets, scores must vary, no
single score may hold more than 80% of results, and every score must carry traceable evidence.

Those assertions exist because of what happened last time. A scoring system on this machine once
passed its own tests while returning a hardcoded verdict, and the rug scorer shipped for weeks
while inverted. `npm run prove` is designed to fail loudly in both of those cases rather than
report a comfortable green.

---

## 5. What I'd fix next

- **State and local grants.** Federal only today. This is the most requested gap in every grant
  tool review, and it is where Instrumentl is weakest.
- **Saved profiles + change alerts.** "Tell me when a grant I'm eligible for is posted" is the
  recurring-revenue version of this product, and it's a scheduled Apify run away.
- **Foundation grants** (990-PF data) — much harder, much more valuable.
- **Sharpen keyword matching.** Current matching is substring-based and honest about it; real
  semantic matching against the mission statement would materially improve ranking, and your
  free LLM pools can do it at zero marginal cost.
