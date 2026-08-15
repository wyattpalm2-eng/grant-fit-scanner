const SEARCH_URL = 'https://api.grants.gov/v1/api/search2';
const FETCH_URL = 'https://api.grants.gov/v1/api/fetchOpportunity';

/** Grants.gov publishes these as the string "none" rather than null. */
function parseMoney(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s || s === 'none' || s === 'n/a' || s === 'null') return null;
  const n = Number(s.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** "Nov 17, 2026 12:00:00 AM EST" and "11/17/2026" both appear in this API. */
function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  const mdy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (mdy) return new Date(`${mdy[3]}-${mdy[1]}-${mdy[2]}T00:00:00Z`);
  const d = new Date(s.replace(/\s+(EST|EDT|CST|CDT|MST|MDT|PST|PDT)$/i, ' UTC'));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function postJson(url, body, { retries = 3, timeoutMs = 30000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        // text/plain keeps this a CORS "simple request", so browsers skip the
        // preflight - Grants.gov returns 403 to OPTIONS but accepts a JSON body
        // under text/plain. This is what lets the app run with no backend.
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`upstream ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
  }
  throw lastErr;
}

/**
 * Search open opportunities, filtered server-side by the applicant's own
 * eligibility code so we do not pay to download grants the org cannot win.
 */
async function searchOpportunities({ keyword, eligibilityCode, agencies, fundingCategories, maxResults = 100, oppStatuses = 'posted' }) {
  const rowsPerPage = 100;
  const out = [];
  let start = 0;

  while (out.length < maxResults) {
    const payload = {
      rows: Math.min(rowsPerPage, maxResults - out.length),
      startRecordNum: start,
      keyword: keyword || '',
      oppStatuses,
    };
    if (eligibilityCode) payload.eligibilities = eligibilityCode;
    if (agencies) payload.agencies = agencies;
    if (fundingCategories) payload.fundingCategories = fundingCategories;

    const json = await postJson(SEARCH_URL, payload);
    const data = json && json.data;
    if (!data || !Array.isArray(data.oppHits) || data.oppHits.length === 0) break;

    out.push(...data.oppHits);
    start += data.oppHits.length;
    if (start >= (data.hitCount || 0)) break;
  }

  return out.slice(0, maxResults);
}

/** Full record: applicant types, award sizes, close date, cost sharing, CFDA. */
async function fetchOpportunity(opportunityId) {
  const json = await postJson(FETCH_URL, { opportunityId: String(opportunityId) });
  const data = (json && json.data) || {};
  const syn = data.synopsis || {};

  return {
    id: String(opportunityId),
    number: data.opportunityNumber || null,
    title: data.opportunityTitle || null,
    agencyName: syn.agencyName || null,
    agencyCode: data.owningAgencyCode || syn.agencyCode || null,
    contactEmail: syn.agencyContactEmail || null,
    contactName: syn.agencyContactName || null,
    description: syn.synopsisDesc || null,
    applicantTypes: syn.applicantTypes || [],
    eligibilityNotes: syn.applicantEligibilityDesc || null,
    awardCeiling: parseMoney(syn.awardCeiling),
    awardFloor: parseMoney(syn.awardFloor),
    costSharingRequired: syn.costSharing === true,
    closeDate: parseDate(syn.responseDate),
    closeDateNote: syn.responseDateDesc || null,
    postedDate: parseDate(syn.postingDate),
    cfdaNumbers: (data.cfdas || [])
      .map((c) => c && c.cfdaNumber)
      .filter(Boolean),
    fundingCategories: (syn.fundingActivityCategories || []).map((c) => c.description).filter(Boolean),
    url: `https://www.grants.gov/search-results-detail/${opportunityId}`,
  };
}

export { searchOpportunities, fetchOpportunity, parseMoney, parseDate };
