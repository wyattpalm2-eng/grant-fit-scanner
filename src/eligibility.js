/**
 * Grants.gov applicant-type codes. These are the machine-readable eligibility
 * codes the federal system itself publishes on every opportunity, which is what
 * makes the gate mechanical rather than a guess.
 */
const APPLICANT_TYPES = {
  '00': 'State governments',
  '01': 'County governments',
  '02': 'City or township governments',
  '04': 'Special district governments',
  '05': 'Independent school districts',
  '06': 'Public and State controlled institutions of higher education',
  '07': 'Native American tribal governments (Federally recognized)',
  '08': 'Public housing authorities/Indian housing authorities',
  '11': 'Native American tribal organizations (other than Federally recognized)',
  '12': 'Nonprofits having a 501(c)(3) status with the IRS',
  '13': 'Nonprofits without a 501(c)(3) status with the IRS',
  '20': 'Private institutions of higher education',
  '21': 'Individuals',
  '22': 'For profit organizations other than small businesses',
  '23': 'Small businesses',
  '25': 'Others (see Additional Information on Eligibility)',
  '99': 'Unrestricted',
};

/** Human-facing org types -> the federal code they file under. */
const ORG_TYPE_TO_CODE = {
  nonprofit_501c3: '12',
  nonprofit_other: '13',
  small_business: '23',
  large_business: '22',
  public_university: '06',
  private_university: '20',
  state_government: '00',
  county_government: '01',
  city_government: '02',
  special_district: '04',
  school_district: '05',
  tribal_government: '07',
  tribal_organization: '11',
  housing_authority: '08',
  individual: '21',
};

/** "Others (see text)" — presence means eligibility cannot be settled mechanically. */
const CODE_OTHERS = '25';
const CODE_UNRESTRICTED = '99';

const ELIGIBLE = 'ELIGIBLE';
const NEEDS_REVIEW = 'NEEDS_REVIEW';
const INELIGIBLE = 'INELIGIBLE';

/**
 * Decide whether an org may apply.
 *
 * The single most important rule here: absence of evidence is never treated as
 * eligibility. If an opportunity publishes no applicant types, or only says
 * "Others (see text)", the answer is NEEDS_REVIEW — never ELIGIBLE. A previous
 * scoring system on this machine defaulted "no red flags found" to "safe" and
 * inverted itself completely; this is that bug, designed out.
 *
 * @param {string} orgType key of ORG_TYPE_TO_CODE
 * @param {Array<{id:string,description:string}>} applicantTypes from fetchOpportunity
 * @returns {{status:string, reason:string, matchedCode:string|null}}
 */
function checkEligibility(orgType, applicantTypes) {
  const myCode = ORG_TYPE_TO_CODE[orgType];
  if (!myCode) {
    return {
      status: NEEDS_REVIEW,
      reason: `Unrecognized organization type "${orgType}" — cannot evaluate mechanically.`,
      matchedCode: null,
    };
  }

  const codes = (applicantTypes || [])
    .map((t) => String(t && t.id != null ? t.id : t).padStart(2, '0'))
    .filter(Boolean);

  if (codes.length === 0) {
    return {
      status: NEEDS_REVIEW,
      reason:
        'This opportunity publishes no applicant-type codes. Eligibility cannot be confirmed from the data — read the announcement before investing time.',
      matchedCode: null,
    };
  }

  if (codes.includes(myCode)) {
    return {
      status: ELIGIBLE,
      reason: `Opportunity explicitly lists "${APPLICANT_TYPES[myCode]}" (code ${myCode}) as an eligible applicant.`,
      matchedCode: myCode,
    };
  }

  if (codes.includes(CODE_UNRESTRICTED)) {
    return {
      status: ELIGIBLE,
      reason: 'Opportunity is marked Unrestricted (code 99) — open to any entity type.',
      matchedCode: CODE_UNRESTRICTED,
    };
  }

  if (codes.includes(CODE_OTHERS)) {
    return {
      status: NEEDS_REVIEW,
      reason:
        `Your type (${APPLICANT_TYPES[myCode]}) is not listed, but the opportunity includes ` +
        '"Others (see text)" (code 25). Eligibility depends on prose in the announcement, so this is not decidable from structured data.',
      matchedCode: CODE_OTHERS,
    };
  }

  const listed = codes.map((c) => APPLICANT_TYPES[c] || `code ${c}`).join('; ');
  return {
    status: INELIGIBLE,
    reason: `Your type (${APPLICANT_TYPES[myCode]}) is not among the eligible applicants. Eligible: ${listed}.`,
    matchedCode: null,
  };
}

export {
  APPLICANT_TYPES,
  ORG_TYPE_TO_CODE,
  checkEligibility,
  ELIGIBLE,
  NEEDS_REVIEW,
  INELIGIBLE,
};
