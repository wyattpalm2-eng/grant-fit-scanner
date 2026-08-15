import { Actor } from 'apify';
import { scanGrants } from './core.js';

/**
 * Pay-per-event billing. Charging is wrapped so that a billing failure can
 * never destroy a run the user is waiting on — the results still get delivered.
 */
async function charge(eventName, count = 1) {
  try {
    await Actor.charge({ eventName, count });
  } catch (err) {
    Actor.log.warning(`Could not charge for "${eventName}": ${err.message}`);
  }
}

Actor.main(async () => {
  const input = (await Actor.getInput()) || {};

  const profile = {
    organizationType: input.organizationType,
    focusKeywords: input.focusKeywords || [],
    requestedAmount: input.requestedAmount,
    canCostShare: input.canCostShare,
    agencies: input.agencies,
    fundingCategories: input.fundingCategories,
  };

  if (!profile.organizationType) {
    throw new Error('organizationType is required. See the input schema for accepted values.');
  }

  await charge('scan-started');

  const { results, summary } = await scanGrants(profile, {
    maxResults: input.maxResults || 50,
    minDaysToApply: input.minDaysToApply,
    includeIneligible: input.includeIneligible,
    includeUnrestricted: input.includeUnrestricted,
    log: (msg) => Actor.log.info(msg),
  });

  if (results.length) {
    await Actor.pushData(results);
    await charge('opportunity-scored', results.length);
  }

  Actor.log.info(
    `Done. Scanned ${summary.scanned}, returned ${summary.returned} ` +
    `(${summary.strongFit} strong fit, ${summary.possibleFit} possible, ` +
    `${summary.needsEligibilityReview} need eligibility review, ` +
    `${summary.filteredOutIneligible} filtered out as ineligible).`
  );

  await Actor.setValue('SUMMARY', summary);

  if (results.length === 0) {
    Actor.log.warning(
      'No matching opportunities. This is a real result, not an error — it usually means your ' +
      'keywords are too narrow or your organization type is ineligible for currently posted grants. ' +
      'Try fewer focusKeywords, or set includeUnrestricted to true.'
    );
  }
});
