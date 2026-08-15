// Browser front end. Imports the same verified modules the Node tests exercise,
// so there is no second copy of the scoring logic that can drift out of sync.
import { scanGrants } from './src/core.js';
import { ORG_TYPE_TO_CODE } from './src/eligibility.js';

const ORG_LABELS = {
  nonprofit_501c3: 'Nonprofit with 501(c)(3) status',
  nonprofit_other: 'Nonprofit without 501(c)(3) status',
  small_business: 'Small business',
  large_business: 'For-profit (other than small business)',
  public_university: 'Public / state-controlled university',
  private_university: 'Private university',
  state_government: 'State government',
  county_government: 'County government',
  city_government: 'City or township government',
  special_district: 'Special district government',
  school_district: 'Independent school district',
  tribal_government: 'Tribal government (federally recognized)',
  tribal_organization: 'Tribal organization (other)',
  housing_authority: 'Public / Indian housing authority',
  individual: 'Individual',
};

const BAND_LABEL = {
  STRONG_FIT: 'Strong fit',
  POSSIBLE_FIT: 'Possible fit',
  REVIEW_ELIGIBILITY: 'Review eligibility',
  WEAK_FIT: 'Weak fit',
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Math.round(n).toLocaleString();

// Populate org dropdown from the same map the gate uses, so the UI can never
// offer an option the engine does not understand.
const sel = $('org');
for (const key of Object.keys(ORG_TYPE_TO_CODE)) {
  const o = document.createElement('option');
  o.value = key;
  o.textContent = ORG_LABELS[key] || key;
  sel.appendChild(o);
}
sel.value = 'nonprofit_501c3';

function logLine(msg) {
  $('logcard').hidden = false;
  $('log').textContent += msg + '\n';
}

function renderSignal(s) {
  const cls = s.points > 0 ? 'p' : s.points < 0 ? 'n' : 'z';
  const pts = s.points > 0 ? `+${s.points}` : String(s.points);
  return `<div class="sig"><i class="${cls}">${pts}</i><div>
    <b>${esc(s.label)}</b><span>${esc(s.evidence)}</span></div></div>`;
}

function renderResult(r) {
  const deadline = r.daysUntilDeadline == null
    ? 'No published close date'
    : `<b>${r.daysUntilDeadline} days</b> left${r.closeDate ? ` &middot; closes ${esc(r.closeDate)}` : ''}`;

  const bits = [];
  if (r.awardCeiling) bits.push(`Ceiling ${money(r.awardCeiling)}`);
  if (r.costSharingRequired) bits.push('Match required');
  if (r.priorAwards) {
    bits.push(`Prior median ${money(r.priorAwards.medianAward)} (n=${r.priorAwards.sampleSize})`);
  }

  return `<div class="res">
    <div class="res-top">
      <div class="score"><b>${r.fitScore}</b><span>/ 100</span></div>
      <div style="min-width:0;flex:1">
        <h3><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></h3>
        <div class="meta">${esc(r.agency || 'Federal agency')}${r.opportunityNumber ? ` &middot; ${esc(r.opportunityNumber)}` : ''}</div>
        <div class="meta">${deadline}${bits.length ? ' &middot; ' + bits.map(esc).join(' &middot; ') : ''}</div>
        <span class="pill ${r.band}">${BAND_LABEL[r.band] || r.band}</span>
        <details><summary>Why this score</summary>
          ${r.whyThisScore.map(renderSignal).join('')}
          ${r.eligibilityNotes ? `<div class="sig"><i class="z">i</i><div><b>Agency eligibility notes</b><span>${esc(r.eligibilityNotes)}</span></div></div>` : ''}
        </details>
      </div>
    </div>
  </div>`;
}

async function run() {
  const btn = $('go');
  btn.disabled = true;
  btn.textContent = 'Scanning live federal data…';
  $('log').textContent = '';
  $('out').innerHTML = '';

  const profile = {
    organizationType: sel.value,
    focusKeywords: $('kw').value.split(',').map((s) => s.trim()).filter(Boolean),
    requestedAmount: Number($('amt').value) || undefined,
    canCostShare: !$('cost').checked,
  };

  try {
    const { results, summary } = await scanGrants(profile, {
      maxResults: 25,
      minDaysToApply: Number($('days').value) || 14,
      log: logLine,
    });

    if (!results.length) {
      $('out').innerHTML = `<div class="card"><div class="err">
        <b>No matching opportunities.</b> That is a real result, not an error — it usually means your
        keywords are too narrow, or your organization type is not eligible for anything currently
        posted. Try fewer or broader keywords.</div></div>`;
      return;
    }

    const counts = { STRONG_FIT: 0, POSSIBLE_FIT: 0, REVIEW_ELIGIBILITY: 0, WEAK_FIT: 0 };
    for (const r of results) counts[r.band]++;

    const pills = Object.entries(counts).filter(([, n]) => n > 0)
      .map(([b, n]) => `<span class="pill ${b}">${n} ${BAND_LABEL[b].toLowerCase()}</span>`).join('');

    $('out').innerHTML = `<div class="card">
        <div class="summary">${pills}</div>
        <div class="hint">Scanned ${summary.scanned} live opportunities${
          summary.filteredOutIneligible > 0
            ? `, filtered out ${summary.filteredOutIneligible} your organization type cannot apply for`
            : ''}.</div>
      </div>` + results.map(renderResult).join('');
  } catch (err) {
    $('out').innerHTML = `<div class="card"><div class="err">
      <b>Scan failed.</b> ${esc(err.message)}<br>
      The federal APIs occasionally rate-limit or go down for maintenance. Try again in a moment.
      </div></div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan live federal grants';
  }
}

$('go').addEventListener('click', run);
