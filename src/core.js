import { searchOpportunities, fetchOpportunity } from './grantsgov.js';
import { checkEligibility, ORG_TYPE_TO_CODE, INELIGIBLE } from './eligibility.js';
import { getIncumbents } from './incumbents.js';
import { scoreOpportunity } from './score.js';

/** Run `fn` over `items` with bounded concurrency so we stay polite to federal APIs. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        out[i] = await fn(items[i], i);
      } catch (err) {
        out[i] = { __error: err.message, __item: items[i] };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Scan live federal grant opportunities and rank them by whether this specific
 * organization can realistically win them.
 *
 * @param {object} profile  organization profile (see input schema)
 * @param {object} opts     { maxResults, minDaysToApply, includeIneligible, includeUnrestricted, log }
 */
async function scanGrants(profile, opts = {}) {
  const log = opts.log || (() => {});
  const maxResults = Number(opts.maxResults) || 50;
  const includeIneligible = opts.includeIneligible === true;
  const includeUnrestricted = opts.includeUnrestricted !== false;

  const orgType = profile.organizationType;
  const myCode = ORG_TYPE_TO_CODE[orgType];
  if (!myCode) {
    throw new Error(
      `Unknown organizationType "${orgType}". Valid values: ${Object.keys(ORG_TYPE_TO_CODE).join(', ')}`
    );
  }

  const keyword = (profile.focusKeywords || []).join(' ').trim() || profile.searchKeyword || '';

  // Filter server-side by the org's own eligibility code so we never pay to
  // download opportunities the organization is barred from.
  log(`Searching Grants.gov for applicant type ${myCode} (${orgType})...`);
  // Forecasted opportunities are not yet open, so they carry no close date.
  // They are the ones worth preparing for in advance, which is exactly the
  // planning window a grant writer wants.
  const oppStatuses = opts.includeForecasted ? 'posted|forecasted' : 'posted';
  const searchOpts = {
    oppStatuses,
    keyword,
    agencies: profile.agencies || undefined,
    fundingCategories: profile.fundingCategories || undefined,
    maxResults: maxResults * 2,
  };

  const primary = await searchOpportunities({ ...searchOpts, eligibilityCode: myCode });
  let hits = primary;

  if (includeUnrestricted) {
    const unrestricted = await searchOpportunities({ ...searchOpts, eligibilityCode: '99' });
    const seen = new Set(primary.map((h) => String(h.id)));
    hits = primary.concat(unrestricted.filter((h) => !seen.has(String(h.id))));
  }

  log(`Found ${hits.length} candidate opportunities. Fetching full records...`);

  // Only the search hit carries oppStatus; the detail record does not. Keep it
  // so scoring can tell "forecasted, not open yet" from "close date missing".
  const statusById = new Map(hits.map((h) => [String(h.id), h.oppStatus]));

  // Federal APIs tolerate this comfortably and it is the difference between a
  // page that feels responsive and one a visitor abandons.
  const wanted = hits.slice(0, maxResults * 2);
  let fetched = 0;
  const details = await mapLimit(wanted, 10, async (h) => {
    const rec = await fetchOpportunity(h.id);
    if (rec) rec.oppStatus = statusById.get(String(h.id)) || null;
    if (++fetched % 10 === 0) log(`Fetched ${fetched} of ${wanted.length} full records...`);
    return rec;
  });
  const usable = details.filter((d) => d && !d.__error);
  const failed = details.length - usable.length;
  if (failed > 0) log(`${failed} record(s) could not be fetched and were skipped.`);

  log(`Evaluating eligibility and scoring ${usable.length} opportunities...`);

  // Pass 1: eligibility + scoring WITHOUT prior-award data. This is pure local
  // computation over records already in hand, so it costs no network time.
  const prelim = [];
  let ineligibleCount = 0;
  for (const opp of usable) {
    const eligibility = checkEligibility(orgType, opp.applicantTypes);
    if (eligibility.status === INELIGIBLE && !includeIneligible) { ineligibleCount++; continue; }
    const s = scoreOpportunity(opp, profile, eligibility, null, { minDaysToApply: opts.minDaysToApply });
    if (s.daysLeft != null && s.daysLeft < 0) continue; // already closed: noise
    prelim.push({ opp, eligibility, ...s });
  }

  // Rank provisionally and enrich only the head of the list. Fetching prior
  // awards for every candidate was the dominant cost - roughly a second each,
  // for records that were then never displayed. Enriching a margin above the
  // requested count keeps the final ranking stable when the prior-award signal
  // shifts a result's score.
  prelim.sort((a, b) => b.fitScore - a.fitScore);
  const enrichCount = Math.min(prelim.length, Math.ceil(maxResults * 1.5));
  const toEnrich = prelim.slice(0, enrichCount);

  const uniqueCfdas = new Set(
    toEnrich.map((p) => p.opp.cfdaNumbers && p.opp.cfdaNumbers[0]).filter(Boolean)
  );
  log(`Looking up prior federal awards for ${uniqueCfdas.size} funding program(s)...`);

  // Warm the shared cache once per CFDA. Many opportunities share a program, so
  // this collapses duplicate lookups before any scoring depends on them.
  await mapLimit([...uniqueCfdas], 8, (cfda) => getIncumbents(cfda));

  const scored = await mapLimit(toEnrich, 8, async (p) => {
    const opp = p.opp;
    const eligibility = p.eligibility;
    const cfda = opp.cfdaNumbers && opp.cfdaNumbers[0];
    const incumbents = cfda ? await getIncumbents(cfda) : null;

    const { fitScore, band, daysLeft, signals } = scoreOpportunity(
      opp, profile, eligibility, incumbents, { minDaysToApply: opts.minDaysToApply }
    );

    if (daysLeft != null && daysLeft < 0) return null;

    return {
      fitScore,
      band,
      eligibility: eligibility.status,
      eligibilityReason: eligibility.reason,
      daysUntilDeadline: daysLeft,
      opportunityNumber: opp.number,
      title: opp.title,
      agency: opp.agencyName,
      closeDate: opp.closeDate ? opp.closeDate.toISOString().slice(0, 10) : null,
      oppStatus: opp.oppStatus || null,
      awardFloor: opp.awardFloor,
      awardCeiling: opp.awardCeiling,
      costSharingRequired: opp.costSharingRequired,
      cfdaNumbers: opp.cfdaNumbers,
      fundingCategories: opp.fundingCategories,
      priorAwards: incumbents && incumbents.sampleSize > 0 ? {
        medianAward: incumbents.medianPriorAward,
        largestAward: incumbents.largestPriorAward,
        sampleSize: incumbents.sampleSize,
        topRecipients: incumbents.topRecipients,
      } : null,
      whyThisScore: signals,
      contactEmail: opp.contactEmail,
      eligibilityNotes: opp.eligibilityNotes ? String(opp.eligibilityNotes).slice(0, 600) : null,
      url: opp.url,
    };
  });

  const results = scored.filter((r) => r && !r.__error);

  // Rank: actionable first, then best fit, then soonest real deadline.
  const bandRank = { STRONG_FIT: 0, POSSIBLE_FIT: 1, REVIEW_ELIGIBILITY: 2, WEAK_FIT: 3 };
  results.sort((a, b) => {
    if (bandRank[a.band] !== bandRank[b.band]) return bandRank[a.band] - bandRank[b.band];
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    const ad = a.daysUntilDeadline == null ? 1e9 : a.daysUntilDeadline;
    const bd = b.daysUntilDeadline == null ? 1e9 : b.daysUntilDeadline;
    return ad - bd;
  });

  const final = results.slice(0, maxResults);
  const summary = {
    scanned: usable.length,
    returned: final.length,
    strongFit: final.filter((r) => r.band === 'STRONG_FIT').length,
    possibleFit: final.filter((r) => r.band === 'POSSIBLE_FIT').length,
    needsEligibilityReview: final.filter((r) => r.band === 'REVIEW_ELIGIBILITY').length,
    filteredOutIneligible: ineligibleCount,
  };

  return { results: final, summary };
}

export { scanGrants };
