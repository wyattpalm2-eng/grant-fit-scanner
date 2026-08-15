# Launch kit — paste-ready

Drafted for you to review and post. I won't post them myself; posting under your name is yours
to approve.

**Read this first:** grant and nonprofit communities are hostile to self-promotion and will bury
an ad instantly. Every draft below leads with the useful thing and discloses that you built it.
That is not politeness, it is what keeps the post alive. Do not remove the disclosure lines.

Post to **one** community per day, not all at once. Reply to comments — the replies are what
drive the traffic, not the post.

---

## 1. r/nonprofit

**Title:** `Grants.gov publishes machine-readable eligibility codes — most people don't know, so they read announcements they were never allowed to apply for`

> Something that took me way too long to find out: every opportunity on Grants.gov carries
> structured applicant-type codes. A 501(c)(3) is code 12. A small business is 23. A federally
> recognized tribal government is 07. It's in the API on every single listing.
>
> Which means "can we even apply for this" is a mechanical lookup, not a reading exercise — and
> you can filter the entire federal database down to only what your org type is allowed to
> submit, before you read a single announcement.
>
> Two other things I learned building around this:
>
> - When a listing says "Others — see text," that's genuinely undecidable from the data. The
>   prose decides. Anything that tells you you're eligible there is guessing.
> - USAspending.gov will tell you, free, what was actually awarded under any program's CFDA
>   number in past years. If the median prior award is $40M and you're asking for $150K, you're
>   competing with major institutions. Worth knowing before you spend three weeks writing.
>
> Full disclosure: I built a tool that does this filtering, it's linked in my profile and it
> costs about a dollar a scan. But the codes and the USAspending lookup are free and public and
> you can use them yourself without me — that's most of the value and I'd rather people know it
> exists.

---

## 2. r/grantwriting

**Title:** `Do you screen for entity-type eligibility before reading, or after?`

> Curious how other people handle triage.
>
> I've been treating eligibility as a hard pre-filter — Grants.gov exposes applicant-type codes
> on every opportunity, so you can cut the database down to only what your client's entity type
> can legally submit before anything gets read. For a consultant juggling a nonprofit, a
> university, and a municipality, the three lists barely overlap.
>
> The part I'm less sure about is deadline triage. I default to "under 14 days out isn't
> realistic for a fresh proposal," but that's a made-up number and I suspect it depends heavily
> on whether it's a recompete.
>
> What's your actual cutoff?
>
> (I built a scanner around this — profile link, ~$1/scan. Genuinely more interested in the
> triage question than in pitching it.)

---

## 3. LinkedIn

> Federal grant discovery tools run $299–$999/month.
>
> The underlying data is free. Grants.gov publishes every open opportunity through a public API,
> including machine-readable eligibility codes. USAspending.gov publishes every award that was
> actually made, including who received it and how much.
>
> What you're paying for is the judgment layer on top — and for a small nonprofit, that
> subscription is often more than the grant admin budget.
>
> So I built the judgment layer and put it on Apify at roughly a dollar per scan. It applies a
> hard eligibility gate on your entity type, checks whether there's realistically time to write
> the thing, and tells you what prior winners under that program actually received — because a
> $150K ask against a program with a $40M median award isn't a real opportunity.
>
> Every score shows the fact that produced it. No black box.
>
> Link in comments. If you write grants for a living I'd genuinely like to know what it gets
> wrong.

---

## 4. Show HN

**Title:** `Show HN: Ranking federal grants by whether you can actually win them`

> Grants.gov has a keyless public API. So does USAspending.gov. Neither requires an account,
> a key, or scraping.
>
> Putting them together turns out to be more useful than either alone. Grants.gov publishes
> structured applicant-type eligibility codes per opportunity, so eligibility is a mechanical
> gate rather than an NLP problem. USAspending publishes historical awards by CFDA program
> number, so you can answer "what did people who won this actually get" — which reframes an
> opportunity completely. A $150K request against a program whose median prior award is $47.7M
> means you're competing against major research institutions, and no amount of proposal quality
> fixes that.
>
> Two implementation notes that might interest people here:
>
> The scoring nearly shipped broken. Component weights summed past the 0–100 cap, so every
> result clipped to exactly 100 and the ranking silently stopped ranking. Everything looked
> great — top result 100/100 — while conveying zero information. Now the components sum to
> exactly 100 and the test suite fails if any single score holds more than 80% of results.
>
> The other rule is that absence of evidence never scores as a pass. If an opportunity publishes
> no applicant types, or only "Others — see text," the output is NEEDS_REVIEW, never ELIGIBLE.
> I've watched a previous scoring system default "no red flags found" to "safe" and invert itself
> completely against ground truth, so this one has explicit regression tests for it.
>
> Runs on Apify, pay-per-event, about a dollar per scan.

---

## 5. Direct outreach (highest conversion, lowest volume)

Grant consultants on LinkedIn evaluate tools for a living and will answer a specific question.
Send **individually**. Never paste this to a group.

> Hi [name] — you mentioned you handle grant search for multiple clients. I built something that
> pre-filters Grants.gov by entity-type eligibility codes, so a nonprofit's list and a
> municipality's list separate automatically before anyone reads anything.
>
> Not selling you a subscription — it's about a dollar a run on Apify. I'm trying to find out
> whether the eligibility gate matches how you actually triage, or whether I've built something
> that only makes sense to an engineer. Would you take a look and tell me if it's wrong?

---

## What to expect

The first posts will mostly not convert. That's normal and not a signal to stop or to post
harder. The compounding channel is Apify's store SEO, which is already handled by the README —
these posts exist to seed the first handful of runs, because an actor with zero runs looks dead
to anyone who finds it organically.

If a post gets traction, the comments matter more than the post. Answer every one.
