/**
 * Grant-domain vocabulary.
 *
 * Federal announcements and the people writing applications use different words
 * for the same thing. An agency funds "behavioral health"; the nonprofit doing
 * the work calls it "mental health". Plain substring matching scored that as a
 * total miss and penalised every result — measured: searching "behavioral
 * health" matched 0 of 25 returned opportunities.
 *
 * This is a curated synonym graph rather than an embedding model on purpose:
 * it runs instantly in the browser with nothing to download, and every match
 * stays explainable — the UI can say *which* related term bridged the gap,
 * which matters when the whole product promise is showing your work.
 */

const CLUSTERS = [
  // health
  ['mental health', 'behavioral health', 'psychiatric', 'psychological', 'counseling', 'suicide prevention', 'depression', 'anxiety'],
  ['substance abuse', 'substance use', 'addiction', 'opioid', 'overdose', 'drug treatment', 'recovery', 'alcohol'],
  ['health care', 'healthcare', 'health services', 'clinical', 'medical', 'patient', 'primary care'],
  ['public health', 'population health', 'health equity', 'disease prevention', 'epidemiology'],
  ['maternal health', 'prenatal', 'infant', 'pregnancy', 'maternal', 'childbirth'],
  ['disability', 'disabilities', 'accessibility', 'assistive', 'developmental disability'],
  ['aging', 'senior', 'older adults', 'elderly', 'geriatric', 'long-term care'],

  // housing & homelessness
  ['housing', 'affordable housing', 'homelessness', 'homeless', 'shelter', 'rental assistance', 'supportive housing', 'housing counseling', 'eviction'],
  ['community development', 'neighborhood', 'revitalization', 'blight', 'redevelopment'],

  // youth & education
  ['youth', 'young people', 'adolescent', 'teen', 'juvenile', 'runaway youth', 'foster youth'],
  ['education', 'school', 'student', 'classroom', 'teacher', 'curriculum', 'academic'],
  ['early childhood', 'child care', 'childcare', 'preschool', 'head start', 'pre-k'],
  ['literacy', 'reading', 'adult education', 'ged', 'tutoring'],
  ['stem', 'science education', 'engineering', 'mathematics', 'computer science'],

  // economic
  ['workforce', 'employment', 'job training', 'apprenticeship', 'career', 'reemployment', 'labor'],
  ['small business', 'entrepreneur', 'entrepreneurship', 'startup', 'business development', 'sbir', 'sttr'],
  ['economic development', 'economic growth', 'job creation', 'investment'],

  // food & agriculture
  ['food', 'nutrition', 'hunger', 'food security', 'food insecurity', 'snap', 'meals', 'food bank'],
  ['agriculture', 'farming', 'farmer', 'rural development', 'crop', 'livestock', 'agricultural'],

  // environment & energy
  ['environment', 'environmental', 'conservation', 'ecosystem', 'habitat', 'wildlife', 'pollution'],
  ['climate', 'climate change', 'resilience', 'adaptation', 'emissions', 'decarbonization'],
  ['energy', 'renewable energy', 'solar', 'wind', 'efficiency', 'clean energy', 'grid'],
  ['water', 'drinking water', 'wastewater', 'watershed', 'stormwater', 'water quality'],

  // infrastructure
  ['transportation', 'transit', 'highway', 'roadway', 'mobility', 'pedestrian', 'bicycle'],
  ['broadband', 'internet access', 'digital equity', 'digital divide', 'connectivity', 'telecommunications'],
  ['infrastructure', 'construction', 'facility', 'capital improvement', 'renovation'],

  // justice & safety
  ['criminal justice', 'reentry', 'corrections', 'incarceration', 'probation', 'recidivism'],
  ['violence prevention', 'domestic violence', 'sexual assault', 'trafficking', 'victim services', 'gun violence'],
  ['public safety', 'law enforcement', 'police', 'first responder', 'emergency response'],
  ['disaster', 'emergency management', 'hazard mitigation', 'preparedness', 'recovery', 'flood'],

  // culture & research
  ['arts', 'humanities', 'culture', 'cultural', 'museum', 'library', 'heritage', 'preservation'],
  ['research', 'basic research', 'scientific', 'laboratory', 'clinical trial', 'investigator'],
  ['technology', 'innovation', 'software', 'artificial intelligence', 'data science', 'cybersecurity'],

  // populations
  ['veteran', 'veterans', 'military', 'service member'],
  ['tribal', 'native american', 'indian', 'indigenous', 'alaska native'],
  ['rural', 'remote', 'frontier', 'underserved area'],
  ['immigrant', 'refugee', 'migrant', 'asylum', 'newcomer'],
  ['low-income', 'poverty', 'underserved', 'disadvantaged', 'equity', 'vulnerable'],
];

// term -> Set of related terms (bidirectional within a cluster)
const GRAPH = new Map();
for (const cluster of CLUSTERS) {
  for (const term of cluster) {
    const key = term.toLowerCase();
    if (!GRAPH.has(key)) GRAPH.set(key, new Set());
    for (const other of cluster) {
      if (other.toLowerCase() !== key) GRAPH.get(key).add(other.toLowerCase());
    }
  }
}

/**
 * Expand a user's term into the related vocabulary agencies actually use.
 * Returns the original first so direct hits still rank as direct hits.
 */
export function expandTerm(term) {
  const t = String(term || '').toLowerCase().trim();
  if (!t) return [];
  const related = GRAPH.get(t);
  if (related) return [t, ...related];

  // Partial match: "youth mental health services" should still reach the
  // mental-health cluster without needing an exact vocabulary entry.
  const hits = new Set();
  for (const [key, set] of GRAPH) {
    if (t.includes(key) || key.includes(t)) {
      hits.add(key);
      for (const r of set) hits.add(r);
    }
  }
  return hits.size ? [t, ...hits] : [t];
}

/**
 * Match a user's terms against opportunity text.
 *
 * Direct hits and related hits are reported separately so scoring can reward a
 * direct match more, and so the UI can show which related term bridged the gap
 * instead of asserting an unexplained "match".
 *
 * @returns {{direct:string[], related:Array<{term:string, via:string}>}}
 */
export function matchTerms(terms, haystack) {
  const hay = String(haystack || '').toLowerCase();
  const direct = [];
  const related = [];

  for (const raw of terms || []) {
    const t = String(raw).toLowerCase().trim();
    if (!t) continue;
    if (hay.includes(t)) { direct.push(t); continue; }

    const alt = expandTerm(t).find((a) => a !== t && hay.includes(a));
    if (alt) related.push({ term: t, via: alt });
  }
  return { direct, related };
}

/** Broader query for the API so a narrow word does not starve the candidate pool. */
export function searchQueryFor(terms) {
  const list = (terms || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean);
  if (!list.length) return '';
  // One term: send it alone. Grants.gov ANDs multiple words, so piling on
  // synonyms here would shrink the pool rather than widen it.
  return list[0];
}

/**
 * The broadest term in the same cluster, used as a SECOND query.
 *
 * A narrow word starves the pool at the API level before local matching can
 * help: searching "shelter" returned only 12 candidates while "housing" — the
 * same subject in the language agencies use for it — returned the full set.
 * Running the cluster head as an extra query widens the pool, and the local
 * matcher still decides what actually fits.
 *
 * Returns null when the term is already the broad one, so we skip the request.
 */
export function broaderQueryFor(terms) {
  const list = (terms || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean);
  if (!list.length) return null;
  const first = list[0];

  // Prefer an exact cluster membership. Partial matching alone picked the wrong
  // cluster for general words: "health" partial-matched "mental health" and
  // would have *narrowed* the query to a subtopic instead of widening it.
  const exact = CLUSTERS.find((c) => c.some((t) => t.toLowerCase() === first));
  const cluster = exact || CLUSTERS.find((c) => c.some((t) => {
    const lc = t.toLowerCase();
    // Only accept a partial match where the cluster term is MORE specific than
    // what the user typed; never treat a general word as a member of a
    // narrower cluster.
    return lc.includes(first) && lc !== first;
  }));
  if (!cluster) return null;

  const head = cluster[0].toLowerCase();
  if (head === first) return null;
  // A head that contains the user's term is more specific, not broader —
  // widening to it would shrink the pool.
  if (head.includes(first)) return null;
  return head;
}
