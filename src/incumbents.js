const USASPENDING_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

/** Assistance award types: grants, block grants, cooperative agreements. */
const ASSISTANCE_TYPES = ['02', '03', '04', '05'];

const cache = new Map();

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Who actually won money under this CFDA program before, and how much.
 *
 * This is the layer the raw Grants.gov relays on the marketplace do not have,
 * and it is the difference between "here is a grant" and "here is whether you
 * stand a chance". Every value returned is a reported federal award, not a
 * model output.
 */
async function getIncumbents(cfdaNumber, { years = 3, limit = 25 } = {}) {
  if (!cfdaNumber) return null;
  if (cache.has(cfdaNumber)) return cache.get(cfdaNumber);

  const end = new Date();
  const start = new Date(end.getFullYear() - years, end.getMonth(), end.getDate());
  const fmt = (d) => d.toISOString().slice(0, 10);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(USASPENDING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        filters: {
          award_type_codes: ASSISTANCE_TYPES,
          program_numbers: [cfdaNumber],
          time_period: [{ start_date: fmt(start), end_date: fmt(end) }],
        },
        fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency'],
        limit,
        sort: 'Award Amount',
        order: 'desc',
        page: 1,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`USAspending HTTP ${res.status}`);

    const json = await res.json();
    const rows = Array.isArray(json.results) ? json.results : [];
    if (rows.length === 0) {
      const empty = { cfdaNumber, sampleSize: 0, note: 'No prior awards found under this program in the lookback window.' };
      cache.set(cfdaNumber, empty);
      return empty;
    }

    const amounts = rows.map((r) => Number(r['Award Amount'])).filter(Number.isFinite);
    const recipients = [...new Set(rows.map((r) => r['Recipient Name']).filter(Boolean))];

    const result = {
      cfdaNumber,
      sampleSize: rows.length,
      lookbackYears: years,
      medianPriorAward: median(amounts),
      largestPriorAward: amounts.length ? Math.max(...amounts) : null,
      smallestPriorAward: amounts.length ? Math.min(...amounts) : null,
      topRecipients: recipients.slice(0, 5),
      note: `Based on ${rows.length} reported federal awards under CFDA ${cfdaNumber} in the last ${years} years.`,
    };
    cache.set(cfdaNumber, result);
    return result;
  } catch (err) {
    clearTimeout(timer);
    // Incumbent intel is an enrichment. Losing it must never invalidate a result.
    const failed = { cfdaNumber, sampleSize: 0, note: `Prior-award lookup unavailable: ${err.message}` };
    cache.set(cfdaNumber, failed);
    return failed;
  }
}

export { getIncumbents };
