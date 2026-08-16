/**
 * Landing-page generator.
 *
 * A single tool page cannot rank. People do not search "grant fit scanner" —
 * they search "housing grants for nonprofits" and "SBIR grants for small
 * businesses". This turns the live federal feed into pages that answer those
 * queries with real, current opportunities.
 *
 * Every page has to earn its place or it is doorway spam that hurts the domain:
 * each one carries live opportunity data with real deadlines, the eligibility
 * rule that actually governs that organisation type, and prior-award context.
 * Pages with too little real content are skipped rather than shipped thin.
 *
 * Run:  node build/generate-pages.js
 * Rerun on a schedule to keep deadlines current.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanGrants } from '../src/core.js';
import { APPLICANT_TYPES, ORG_TYPE_TO_CODE } from '../src/eligibility.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'grants');
const SITE = 'https://wyattpalm2-eng.github.io/grant-fit-scanner';

const ORGS = {
  nonprofit_501c3: { label: '501(c)(3) nonprofits', short: 'nonprofits' },
  small_business:  { label: 'small businesses',      short: 'small businesses' },
  public_university: { label: 'public universities', short: 'universities' },
  tribal_government: { label: 'tribal governments',  short: 'tribal governments' },
  city_government: { label: 'city and township governments', short: 'cities' },
  county_government: { label: 'county governments',  short: 'counties' },
  school_district: { label: 'school districts',      short: 'school districts' },
  housing_authority: { label: 'housing authorities', short: 'housing authorities' },
};

const TOPICS = {
  housing:            { label: 'Housing & homelessness', kw: ['housing'] },
  'mental-health':    { label: 'Mental & behavioral health', kw: ['mental health'] },
  education:          { label: 'Education', kw: ['education'] },
  youth:              { label: 'Youth programs', kw: ['youth'] },
  workforce:          { label: 'Workforce & job training', kw: ['workforce'] },
  food:               { label: 'Food & nutrition', kw: ['food'] },
  environment:        { label: 'Environment & conservation', kw: ['environment'] },
  energy:             { label: 'Energy', kw: ['energy'] },
  'public-safety':    { label: 'Public safety', kw: ['public safety'] },
  health:             { label: 'Health care', kw: ['health care'] },
  research:           { label: 'Research & innovation', kw: ['research'] },
  broadband:          { label: 'Broadband & digital equity', kw: ['broadband'] },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Math.round(n).toLocaleString();

function shell({ title, desc, canonical, body, jsonld }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta name="robots" content="index,follow">
<link rel="stylesheet" href="${SITE}/page.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head>
<body>
<div class="wrap">
${body}
<footer>
  <p><a href="${SITE}/">Federal Grant Fit Scanner</a> &middot; live data from the
  <a href="https://www.grants.gov/" rel="noopener">Grants.gov</a> and
  <a href="https://www.usaspending.gov/" rel="noopener">USAspending.gov</a> public APIs.
  U.S. federal open data; not affiliated with any federal agency.</p>
  <p>Deadlines change. Always confirm against the official announcement before you apply.</p>
</footer>
</div>
</body>
</html>`;
}

function oppRow(r) {
  const when = r.oppStatus === 'forecasted'
    ? '<span class="tag forecast">Forecasted</span>'
    : r.daysUntilDeadline != null
      ? `<span class="tag${r.daysUntilDeadline <= 21 ? ' soon' : ''}">${r.daysUntilDeadline} days left</span>`
      : '<span class="tag">No close date</span>';
  const prior = r.priorAwards
    ? `<li>Typical prior award under this program: <b>${money(r.priorAwards.medianAward)}</b>
       (median of ${r.priorAwards.sampleSize} reported federal awards)</li>` : '';
  return `<article class="opp">
  <h3><a href="${esc(r.url)}" rel="noopener">${esc(r.title)}</a></h3>
  <p class="meta">${esc(r.agency || 'Federal agency')}${r.opportunityNumber ? ` &middot; ${esc(r.opportunityNumber)}` : ''} ${when}</p>
  <ul class="facts">
    <li>${esc(r.eligibilityReason)}</li>
    ${r.closeDate ? `<li>Closes <b>${esc(r.closeDate)}</b></li>` : ''}
    ${r.awardCeiling ? `<li>Award ceiling <b>${money(r.awardCeiling)}</b></li>` : ''}
    ${r.costSharingRequired ? '<li><b>Cost sharing / matching funds required</b></li>' : ''}
    ${prior}
  </ul>
</article>`;
}

async function buildPage(orgKey, topicKey) {
  const org = ORGS[orgKey], topic = TOPICS[topicKey];
  const code = ORG_TYPE_TO_CODE[orgKey];

  const { results } = await scanGrants(
    { organizationType: orgKey, focusKeywords: topic.kw },
    { maxResults: 12, includeForecasted: true }
  );

  // A page with almost nothing real on it is worse than no page — thin
  // programmatic pages are exactly what search engines penalise.
  if (results.length < 4) return { skipped: true, orgKey, topicKey, n: results.length };

  const title = `${topic.label} grants for ${org.label} (${results.length} open now)`;
  const desc = `Current federal ${topic.label.toLowerCase()} funding opportunities that ${org.label} `
    + `are eligible to apply for, with deadlines and typical award sizes. Updated from Grants.gov.`;
  const canonical = `${SITE}/grants/${orgKey}/${topicKey}.html`;

  const soon = results.filter((r) => r.daysUntilDeadline != null && r.daysUntilDeadline <= 30).length;

  const body = `
<nav class="crumb"><a href="${SITE}/">Grant Fit Scanner</a> / ${esc(org.label)} / ${esc(topic.label)}</nav>
<h1>${esc(topic.label)} grants for ${esc(org.label)}</h1>
<p class="lede">${results.length} federal opportunities currently open or forecasted that
<b>${esc(org.label)}</b> are eligible to apply for${soon ? `, including <b>${soon} closing within 30 days</b>` : ''}.</p>

<div class="cta-box">
  <p><b>These are filtered by entity type, not by topic alone.</b> Grants.gov publishes a machine-readable
  applicant-type code on every opportunity &mdash; ${esc(org.label)} file under code
  <code>${code}</code> (&ldquo;${esc(APPLICANT_TYPES[code])}&rdquo;). Everything below explicitly lists that code,
  so you are not reading announcements you were never permitted to submit.</p>
  <p><a class="cta" href="${SITE}/">Run this against your own organisation &rarr;</a></p>
</div>

<h2>Open and forecasted opportunities</h2>
${results.map(oppRow).join('\n')}

<h2>How eligibility actually works</h2>
<p>Every Grants.gov opportunity carries structured applicant-type codes. If your code is not listed,
you generally cannot apply, no matter how well the programme fits your mission. The codes that matter:</p>
<ul class="codes">
${['12','23','06','07','01','02','00','05','08','20','99'].map((c) =>
  `<li><code>${c}</code> &mdash; ${esc(APPLICANT_TYPES[c])}${c === code ? ' <b>&larr; you</b>' : ''}</li>`).join('\n')}
</ul>
<p>One caveat worth knowing: code <code>25</code> means &ldquo;Others &mdash; see text&rdquo;. When an
opportunity lists only that, eligibility is decided by prose in the announcement and cannot be
settled from the structured data. Treat those as <i>read it yourself</i>, never as a green light.</p>

<h2>Other topics for ${esc(org.label)}</h2>
<ul class="links">
${Object.entries(TOPICS).filter(([k]) => k !== topicKey).map(([k, t]) =>
  `<li><a href="${SITE}/grants/${orgKey}/${k}.html">${esc(t.label)} grants for ${esc(org.short)}</a></li>`).join('\n')}
</ul>

<h2>${esc(topic.label)} grants for other organisation types</h2>
<ul class="links">
${Object.entries(ORGS).filter(([k]) => k !== orgKey).map(([k, o]) =>
  `<li><a href="${SITE}/grants/${k}/${topicKey}.html">${esc(topic.label)} grants for ${esc(o.label)}</a></li>`).join('\n')}
</ul>`;

  const jsonld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: title, description: desc, url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'Federal Grant Fit Scanner', url: SITE + '/' },
  };

  const dir = path.join(OUT, orgKey);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${topicKey}.html`), shell({ title, desc, canonical, body, jsonld }), 'utf8');
  return { skipped: false, orgKey, topicKey, n: results.length, url: canonical };
}

const built = [], skipped = [];
for (const orgKey of Object.keys(ORGS)) {
  for (const topicKey of Object.keys(TOPICS)) {
    try {
      const r = await buildPage(orgKey, topicKey);
      if (r.skipped) { skipped.push(r); process.stdout.write('.'); }
      else { built.push(r); process.stdout.write('#'); }
    } catch (err) {
      skipped.push({ orgKey, topicKey, err: err.message });
      process.stdout.write('!');
    }
  }
}
console.log('');

// Index page linking every generated page — without internal links these are
// orphans that nothing will ever crawl.
const indexBody = `
<nav class="crumb"><a href="${SITE}/">Grant Fit Scanner</a> / Browse</nav>
<h1>Browse federal grants by who you are</h1>
<p class="lede">${built.length} pages of current federal funding opportunities, grouped by organisation
type and topic. Every listing is filtered by the applicant-type code the agency itself published.</p>
${Object.entries(ORGS).map(([k, o]) => {
  const mine = built.filter((b) => b.orgKey === k);
  if (!mine.length) return '';
  return `<h2>${esc(o.label)}</h2><ul class="links">${mine.map((b) =>
    `<li><a href="${SITE}/grants/${b.orgKey}/${b.topicKey}.html">${esc(TOPICS[b.topicKey].label)} &mdash; ${b.n} open</a></li>`).join('')}</ul>`;
}).join('\n')}`;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), shell({
  title: 'Browse federal grants by organisation type and topic',
  desc: 'Current federal funding opportunities grouped by who is eligible to apply: nonprofits, small businesses, tribal governments, school districts and more.',
  canonical: `${SITE}/grants/index.html`, body: indexBody,
}), 'utf8');

// Sitemap covering the tool, the browse index, and every generated page.
const urls = [`${SITE}/`, `${SITE}/grants/index.html`, ...built.map((b) => b.url)];
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + urls.map((u) => `  <url><loc>${u}</loc><changefreq>daily</changefreq></url>`).join('\n')
  + '\n</urlset>\n', 'utf8');

console.log(`built ${built.length} pages, skipped ${skipped.length} (too thin or errored)`);
console.log(`sitemap: ${urls.length} urls`);
