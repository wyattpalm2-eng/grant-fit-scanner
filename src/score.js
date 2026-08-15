import { ELIGIBLE, NEEDS_REVIEW } from './eligibility.js';

const DAY_MS = 86400000;

/**
 * Every point this module awards or removes carries an `evidence` string naming
 * the fact that caused it. Nothing is scored from the absence of data: missing
 * fields produce an explicit UNKNOWN signal worth zero, never a silent pass.
 */
function scoreOpportunity(opp, profile, eligibility, incumbents, opts = {}) {
  const minDays = Number.isFinite(opts.minDaysToApply) ? opts.minDaysToApply : 14;
  const now = opts.now instanceof Date ? opts.now : new Date();
  const signals = [];
  let score = 0;

  const add = (label, points, evidence) => {
    signals.push({ label, points, evidence });
    score += points;
  };

  // --- Eligibility (gate, already decided upstream) ---
  // Component ceilings are tuned to sum to exactly 100 for a flawless match, so
  // the score spends its full range instead of clipping everything to 100.
  // Eligibility 25 + deadline 20 + award fit 15 + cost share 5 + keywords 20
  // + prior-award benchmark 15 = 100.
  if (eligibility.status === ELIGIBLE) {
    add('Eligibility confirmed', 25, eligibility.reason);
  } else if (eligibility.status === NEEDS_REVIEW) {
    add('Eligibility unconfirmed', 0, eligibility.reason);
  }

  // --- Deadline feasibility (arithmetic) ---
  let daysLeft = null;
  if (opp.closeDate) {
    daysLeft = Math.floor((opp.closeDate.getTime() - now.getTime()) / DAY_MS);
    if (daysLeft < 0) {
      add('Deadline passed', -100, `Close date ${opp.closeDate.toISOString().slice(0, 10)} is in the past.`);
    } else if (daysLeft < minDays) {
      add('Deadline too tight', -25,
        `${daysLeft} day(s) until close — below your ${minDays}-day minimum to prepare a submission.`);
    } else if (daysLeft <= 30) {
      add('Deadline tight but workable', 8, `${daysLeft} days until close.`);
    } else if (daysLeft <= 120) {
      add('Comfortable runway', 20, `${daysLeft} days until close.`);
    } else {
      add('Long runway', 12,
        `${daysLeft} days until close — ample time, though far-off deadlines often mean rolling or recurring programs.`);
    }
  } else if (opp.oppStatus === 'forecasted') {
    // A forecasted opportunity has no close date because it has not opened yet.
    // That is not missing data - it is the planning window, and it is the single
    // best time to start preparing. Scoring it as "unknown" buried these below
    // everything else and made the include-forecasted toggle look broken.
    add('Forecasted — not open yet', 15,
      'Agency has announced this but not opened it. You have lead time to prepare before it posts.' +
      (opp.closeDateNote ? ` Agency note: "${String(opp.closeDateNote).slice(0, 100)}"` : ''));
  } else {
    add('Close date unknown', 0,
      'No structured close date published. Treat timing as unverified.' +
      (opp.closeDateNote ? ` Agency note: "${String(opp.closeDateNote).slice(0, 120)}"` : ''));
  }

  // --- Award size fit (arithmetic, only when the agency published numbers) ---
  const want = Number(profile.requestedAmount) || null;
  if (want && (opp.awardCeiling || opp.awardFloor)) {
    const ceil = opp.awardCeiling;
    const floor = opp.awardFloor;
    if (ceil && want > ceil) {
      add('Request exceeds award ceiling', -15,
        `You need $${want.toLocaleString()} but the ceiling is $${ceil.toLocaleString()}.`);
    } else if (floor && want < floor) {
      add('Request below award floor', -10,
        `You need $${want.toLocaleString()} but the floor is $${floor.toLocaleString()}.`);
    } else {
      add('Award size fits your request', 15,
        `Your $${want.toLocaleString()} request sits within the published range` +
        `${floor ? ` floor $${floor.toLocaleString()}` : ''}${ceil ? ` ceiling $${ceil.toLocaleString()}` : ''}.`);
    }
  } else {
    add('Award size not comparable', 0,
      !want ? 'No requestedAmount supplied, so award-size fit was not evaluated.'
            : 'Agency published no award ceiling or floor for this opportunity.');
  }

  // --- Cost sharing (hard practical blocker for many small orgs) ---
  if (opp.costSharingRequired) {
    if (profile.canCostShare === false) {
      add('Cost sharing required, you cannot match', -30,
        'This opportunity requires cost sharing / matching funds and your profile says you cannot provide it.');
    } else {
      add('Cost sharing required', -5, 'Matching funds are required — budget for it.');
    }
  } else {
    add('No cost sharing required', 5, 'Agency does not require matching funds.');
  }

  // --- Mission / keyword alignment (explainable: matched terms are listed) ---
  const terms = (profile.focusKeywords || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean);
  if (terms.length) {
    const haystack = [opp.title, opp.description, ...(opp.fundingCategories || [])]
      .filter(Boolean).join(' ').toLowerCase();
    const matched = terms.filter((t) => haystack.includes(t));
    if (matched.length) {
      add('Mission keywords matched', Math.min(20, matched.length * 7),
        `Matched your terms: ${matched.join(', ')}.`);
    } else {
      add('No mission keywords matched', -10,
        `None of your terms (${terms.join(', ')}) appear in the title, description, or category.`);
    }
  } else {
    add('Mission alignment not evaluated', 0, 'No focusKeywords supplied.');
  }

  // --- Competition signal (facts from prior federal awards) ---
  if (incumbents && incumbents.sampleSize > 0) {
    const med = incumbents.medianPriorAward;
    if (med != null && med > 0 && want) {
      const ratio = want / med;
      const medStr = `$${Math.round(med).toLocaleString()}`;
      const n = incumbents.sampleSize;
      // Being far SMALLER than the typical award is not an advantage. It usually
      // means the program is dominated by large institutional recipients and a
      // small applicant is an outlier competing against them.
      if (ratio >= 0.4 && ratio <= 2.0) {
        add('Your ask is in line with prior winners', 15,
          `You want $${want.toLocaleString()}; median prior award under CFDA ${incumbents.cfdaNumber} is ${medStr} (n=${n}).`);
      } else if (ratio > 2.0) {
        add('Your ask exceeds typical prior awards', -10,
          `You want $${want.toLocaleString()}, over 2x the ${medStr} median prior award under CFDA ${incumbents.cfdaNumber} (n=${n}).`);
      } else {
        add('Program is dominated by much larger awards', 0,
          `You want $${want.toLocaleString()}, under half the ${medStr} median prior award under CFDA ${incumbents.cfdaNumber} (n=${n})` +
          `${incumbents.topRecipients && incumbents.topRecipients.length ? `. Recent recipients include ${incumbents.topRecipients.slice(0, 2).join(', ')}` : ''}` +
          '. Expect to compete against much larger institutions.');
      }
    } else if (med != null && med > 0) {
      add('Prior award benchmark available', 5,
        `Median prior award under CFDA ${incumbents.cfdaNumber} is $${Math.round(med).toLocaleString()} (n=${incumbents.sampleSize}). Supply requestedAmount to score your fit against it.`);
    }
  } else {
    add('No prior-award benchmark', 0,
      (incumbents && incumbents.note) || 'No prior federal awards found for this program.');
  }

  const bounded = Math.max(0, Math.min(100, score));
  let band;
  if (eligibility.status === NEEDS_REVIEW) band = 'REVIEW_ELIGIBILITY';
  else if (bounded >= 70) band = 'STRONG_FIT';
  else if (bounded >= 45) band = 'POSSIBLE_FIT';
  else band = 'WEAK_FIT';

  return { fitScore: bounded, band, daysLeft, signals };
}

export { scoreOpportunity };
