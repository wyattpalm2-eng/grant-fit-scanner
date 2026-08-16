/**
 * Proof harness. Runs the scanner against LIVE Grants.gov data for two very
 * different organizations and asserts the output is genuinely input-dependent.
 *
 * This exists because a previous scoring system on this machine passed its own
 * tests while returning a hardcoded verdict. Tests that only check "did it
 * return something" cannot catch that. These check that different inputs
 * produce different, correctly-reasoned outputs.
 */

import { scanGrants } from '../src/core.js';
import { checkEligibility } from '../src/eligibility.js';
import { matchTerms, expandTerm, broaderQueryFor } from '../src/vocabulary.js';

const log = (...a) => console.log(...a);
let failures = 0;
function assert(cond, msg) {
  if (cond) { log(`  PASS  ${msg}`); }
  else { log(`  FAIL  ${msg}`); failures++; }
}

async function main() {
  // ---------- Unit: the eligibility gate itself ----------
  log('\n=== GATE UNIT TESTS ===');

  const types501c3 = [{ id: '12', description: '501(c)(3)' }, { id: '06', description: 'Public IHE' }];
  assert(checkEligibility('nonprofit_501c3', types501c3).status === 'ELIGIBLE',
    '501(c)(3) is ELIGIBLE when code 12 is listed');
  assert(checkEligibility('small_business', types501c3).status === 'INELIGIBLE',
    'Small business is INELIGIBLE when only 12/06 are listed');
  assert(checkEligibility('small_business', [{ id: '99' }]).status === 'ELIGIBLE',
    'Unrestricted (99) makes any org ELIGIBLE');

  // The critical anti-regression checks: absence of data must never read as a pass.
  assert(checkEligibility('small_business', []).status === 'NEEDS_REVIEW',
    'Empty applicantTypes yields NEEDS_REVIEW, never ELIGIBLE');
  assert(checkEligibility('small_business', [{ id: '25' }]).status === 'NEEDS_REVIEW',
    '"Others (see text)" yields NEEDS_REVIEW, never ELIGIBLE');
  assert(checkEligibility('small_business', null).status === 'NEEDS_REVIEW',
    'Null applicantTypes yields NEEDS_REVIEW, never ELIGIBLE');

  // ---------- Vocabulary: the words applicants use vs the words agencies use ----------
  log('\n=== VOCABULARY TESTS ===');

  // The measured failure this exists to fix: "behavioral health" matched 0 of 25.
  const bh = matchTerms(['behavioral health'], 'Improving Mental Health Outcomes for Youth');
  assert(bh.related.length === 1 && bh.related[0].via === 'mental health',
    '"behavioral health" bridges to an agency\'s "mental health" wording');

  const sh = matchTerms(['shelter'], 'Continuum of Care Homeless Assistance Program');
  assert(sh.related.length === 1,
    '"shelter" bridges to a "homeless" announcement');

  const dir = matchTerms(['housing'], 'Affordable Housing Preservation');
  assert(dir.direct.length === 1 && dir.related.length === 0,
    'A direct hit is reported as direct, not bridged');

  assert(matchTerms(['quantum tunnelling'], 'Affordable Housing Preservation').direct.length === 0 &&
         matchTerms(['quantum tunnelling'], 'Affordable Housing Preservation').related.length === 0,
    'An unrelated term matches nothing — the vocabulary does not match everything');

  assert(expandTerm('reentry').includes('recidivism'),
    'Expansion reaches across a cluster (reentry -> recidivism)');
  assert(broaderQueryFor(['shelter']) === 'housing',
    'A narrow term resolves to its broad cluster head for a second query');
  assert(broaderQueryFor(['housing']) === null,
    'An already-broad term skips the extra request');
  // Regression: partial matching once resolved "health" to "mental health",
  // which would widen a general query into a subtopic and shrink the pool.
  assert(broaderQueryFor(['health']) === null,
    'A general term is never "widened" into a narrower subtopic');
  assert(broaderQueryFor(['solar']) === 'energy',
    'A specific term still widens to its general cluster head');

  // ---------- Live: two different orgs must get different answers ----------
  log('\n=== LIVE SCAN: small business (health tech) ===');
  const t0 = Date.now();
  const biz = await scanGrants({
    organizationType: 'small_business',
    focusKeywords: ['health', 'technology'],
    requestedAmount: 250000,
    canCostShare: false,
  }, { maxResults: 10, log });
  const scanSeconds = (Date.now() - t0) / 1000;

  log(`  summary: ${JSON.stringify(biz.summary)}`);
  for (const r of biz.results.slice(0, 3)) {
    log(`   [${r.band} ${r.fitScore}] ${String(r.title).slice(0, 70)}`);
    log(`      eligibility: ${r.eligibility} — ${String(r.eligibilityReason).slice(0, 100)}`);
    log(`      deadline in ${r.daysUntilDeadline}d | prior median: ${r.priorAwards ? '$' + Math.round(r.priorAwards.medianAward).toLocaleString() : 'n/a'}`);
  }

  log('\n=== LIVE SCAN: tribal government (housing) ===');
  const tribe = await scanGrants({
    organizationType: 'tribal_government',
    focusKeywords: ['housing'],
    requestedAmount: 500000,
    canCostShare: true,
  }, { maxResults: 10, log });

  log(`  summary: ${JSON.stringify(tribe.summary)}`);
  for (const r of tribe.results.slice(0, 3)) {
    log(`   [${r.band} ${r.fitScore}] ${String(r.title).slice(0, 70)}`);
  }

  // ---------- Assertions that a faked implementation would fail ----------
  log('\n=== INTEGRITY ASSERTIONS ===');
  assert(biz.results.length > 0, 'Small-business scan returned live results');
  assert(tribe.results.length > 0, 'Tribal-government scan returned live results');

  const bizIds = new Set(biz.results.map((r) => r.opportunityNumber));
  const tribeIds = new Set(tribe.results.map((r) => r.opportunityNumber));
  const overlap = [...bizIds].filter((x) => tribeIds.has(x));
  assert(overlap.length < Math.min(bizIds.size, tribeIds.size),
    `Two different org types produce different result sets (overlap ${overlap.length}/${Math.min(bizIds.size, tribeIds.size)})`);

  const scoreList = biz.results.map((r) => r.fitScore);
  const scores = new Set(scoreList);
  assert(scores.size > 1, `Scores vary across opportunities (${scores.size} distinct values) — not a constant`);

  // Saturation guard: if the components can sum past the cap, everything clips
  // to 100 and the ranking stops ranking. No single score may dominate.
  const counts = {};
  for (const s of scoreList) counts[s] = (counts[s] || 0) + 1;
  const topShare = Math.max(...Object.values(counts)) / scoreList.length;
  assert(topShare <= 0.8,
    `No single score dominates the result set (most common score holds ${(topShare * 100).toFixed(0)}%)`);

  const allBands = new Set(biz.results.map((r) => r.band));
  log(`  (observed scores: ${[...scores].sort((a, b) => b - a).join(', ')} | bands: ${[...allBands].join(', ')})`);

  const allHaveEvidence = biz.results.every(
    (r) => Array.isArray(r.whyThisScore) && r.whyThisScore.length > 0 && r.whyThisScore.every((s) => s.evidence)
  );
  assert(allHaveEvidence, 'Every returned result carries traceable evidence for its score');

  const noClosed = biz.results.every((r) => r.daysUntilDeadline == null || r.daysUntilDeadline >= 0);
  assert(noClosed, 'No already-closed opportunities leaked into results');

  const eligOk = biz.results.every((r) => r.eligibility !== 'INELIGIBLE');
  assert(eligOk, 'No INELIGIBLE opportunities leaked into default results');

  // Latency is a correctness property for anything a person waits on. This scan
  // once took 43 seconds while every assertion above still passed - correctness
  // tests cannot catch "nobody would wait for this". 15s is a generous ceiling
  // that still fails loudly if per-opportunity network work creeps back in.
  assert(scanSeconds < 15,
    `Scan completed in ${scanSeconds.toFixed(1)}s, under the 15s usability ceiling`);

  log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
