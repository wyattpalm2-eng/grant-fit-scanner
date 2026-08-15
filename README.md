# Federal Grant Fit Scanner — Grants.gov Eligibility Filter + Prior-Award Intelligence

**Stop reading grant announcements you were never allowed to apply for.**

Every other Grants.gov tool hands you a list. This one hands you a *shortlist* — live federal
opportunities ranked by whether **your specific organization** can realistically win them, with
the reasoning shown for every single score.

Point it at your org profile. Get back grants you are actually eligible for, that you actually
have time to write, sized to what you actually need, with a read on who has been winning the
money before you.

---

## What makes this different from a Grants.gov scraper

A scraper returns rows. This returns judgment, and shows its work.

| | Typical Grants.gov scraper | Federal Grant Fit Scanner |
|---|---|---|
| Eligibility | Dumps the raw text field | **Hard mechanical gate** on the federal applicant-type codes |
| Deadlines | Prints a date | Days remaining vs. time you need to write it |
| Award size | Prints a number | Compared against **what you asked for** |
| Competition | Nothing | **Who actually won this program before, and for how much** |
| Scoring | None, or a black box | Every point traced to a named fact |

### The eligibility gate is the whole point

Grants.gov publishes machine-readable applicant-type codes on every opportunity. A 501(c)(3)
is code `12`. A small business is `23`. A federally recognized tribal government is `07`.

This actor filters on those codes **server-side**, so you never even download the grants your
organization is legally barred from winning. In live testing, a small business and a tribal
government scanning the same database got result sets with **zero overlap**. That is the
difference between a list and a shortlist.

**It never guesses.** If an opportunity publishes no applicant types, or only says
*"Others — see text"*, you get `NEEDS_REVIEW`, not a false green light. Absence of evidence is
never reported as eligibility.

### Prior-award intelligence nobody else gives you

For each opportunity's CFDA program number, the actor pulls **real reported federal awards**
from USAspending.gov and tells you the median award, the largest, and who received them.

That single number reframes an opportunity. A $250,000 request against a program whose median
prior award is $47.7M is not a good fit — it means you would be competing against major research
institutions. The scanner says so, in those words, instead of quietly scoring it as a match.

---

## Output

Every result is a ranked, CRM-ready record:

```json
{
  "fitScore": 79,
  "band": "STRONG_FIT",
  "eligibility": "ELIGIBLE",
  "eligibilityReason": "Opportunity explicitly lists \"Small businesses\" (code 23) as an eligible applicant.",
  "daysUntilDeadline": 65,
  "title": "Advanced Development of Informatics Technologies for Cancer Research",
  "agency": "National Institutes of Health",
  "closeDate": "2026-10-18",
  "awardCeiling": null,
  "costSharingRequired": false,
  "cfdaNumbers": ["93.394"],
  "priorAwards": {
    "medianAward": 47701808,
    "sampleSize": 25,
    "topRecipients": ["..."]
  },
  "whyThisScore": [
    { "label": "Eligibility confirmed", "points": 25, "evidence": "..." },
    { "label": "Comfortable runway", "points": 20, "evidence": "65 days until close." },
    { "label": "Program is dominated by much larger awards", "points": 0, "evidence": "..." }
  ],
  "url": "https://www.grants.gov/search-results-detail/357305"
}
```

`whyThisScore` is the contract: **no number appears without the fact that produced it.**

### Verdict bands

- `STRONG_FIT` (70+) — eligible, time to apply, well matched
- `POSSIBLE_FIT` (45–69) — worth a look, some friction
- `REVIEW_ELIGIBILITY` — you may qualify, but only prose can confirm it
- `WEAK_FIT` — eligible but poorly aligned

---

## Input

| Field | Description |
|---|---|
| `organizationType` | **Required.** Nonprofit, small business, university, tribal, city/county/state, school district, housing authority, individual |
| `focusKeywords` | Your mission terms, e.g. `["housing", "youth"]` |
| `requestedAmount` | What you need in USD — unlocks award-size fit and prior-winner comparison |
| `canCostShare` | If `false`, matching-fund requirements are penalized heavily |
| `minDaysToApply` | Your realistic prep time (default 14) |
| `includeUnrestricted` | Also return grants open to any entity (default `true`) |
| `includeIneligible` | Audit what got filtered out (default `false`) |

---

## Who this is for

- **Nonprofits** without a $299/month grant-database subscription
- **Small businesses** hunting SBIR/STTR and agency funding
- **Grant writers and consultants** triaging opportunities across multiple clients
- **Universities, tribal governments, municipalities, school districts, housing authorities**
- **Anyone** who has wasted a week on a proposal they were never eligible to submit

## Data sources

- **[Grants.gov Search API](https://www.grants.gov/)** — all live federal funding opportunities
- **[USAspending.gov](https://www.usaspending.gov/)** — reported federal award history

Both are official U.S. government APIs serving public data. No credentials, no scraping,
no terms-of-service risk, and nothing to break when a site redesigns.

## Notes and limits

- Covers **federal** opportunities on Grants.gov. Not state, local, or private foundation grants.
- `NEEDS_REVIEW` means exactly that — the announcement text decides. Read it.
- Prior-award data is matched by CFDA program number; programs with no award history report
  `null` rather than a fabricated benchmark.
- Eligibility here reflects *entity type*. Program-specific requirements (geography, certifications,
  registrations) still live in the announcement.

**This tool narrows the field. It does not write the proposal or guarantee an award.**
