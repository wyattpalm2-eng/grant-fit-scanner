// Browser front end. Imports the same verified modules the Node tests exercise,
// so there is no second copy of the scoring logic that can drift out of sync.
import { scanGrants } from './src/core.js';
import { ORG_TYPE_TO_CODE } from './src/eligibility.js';
import { CONFIG, hasCrypto, hasPro } from './config.js';
import { makeInvoice, checkPayment, explorerTxUrl } from './src/payments.js';

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

// ── Unlock state ────────────────────────────────────────────────────────────
// Kept in localStorage. This is a client-side gate on a static site, which means
// a determined user with dev tools can bypass it. That is inherent to having no
// backend and is an accepted trade for a $2 tool - it is not a bug to be hidden.
// Spent transaction hashes are retained so one payment cannot be replayed.
const LS_UNLOCK = 'gfs_unlock';
const LS_SPENT = 'gfs_spent_tx';

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

function getUnlock() {
  const u = readJson(LS_UNLOCK, null);
  if (!u || !u.until || Date.now() > u.until) return null;
  return u;
}
function setUnlock(tx) {
  const until = Date.now() + CONFIG.unlockDays * 86400000;
  localStorage.setItem(LS_UNLOCK, JSON.stringify({ tx, until }));
  const spent = readJson(LS_SPENT, []);
  if (!spent.includes(tx)) spent.push(tx);
  localStorage.setItem(LS_SPENT, JSON.stringify(spent));
}
const spentHashes = () => readJson(LS_SPENT, []);
const paywallActive = () => hasCrypto() && !getUnlock();

// ── Populate org dropdown from the same map the gate uses ───────────────────
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

// ── Rendering ───────────────────────────────────────────────────────────────
function renderSignal(s) {
  const cls = s.points > 0 ? 'p' : s.points < 0 ? 'n' : 'z';
  const pts = s.points > 0 ? `+${s.points}` : String(s.points);
  return `<div class="sig"><i class="${cls}">${pts}</i><div>
    <b>${esc(s.label)}</b><span>${esc(s.evidence)}</span></div></div>`;
}

function renderResult(r) {
  const deadline = r.oppStatus === 'forecasted'
    ? '<b>Forecasted</b> — not open yet, prepare early'
    : r.daysUntilDeadline == null
      ? 'No published close date'
      : `<b>${r.daysUntilDeadline} days</b> left${r.closeDate ? ` &middot; closes ${esc(r.closeDate)}` : ''}`;

  const bits = [];
  if (r.awardCeiling) bits.push(`Ceiling ${money(r.awardCeiling)}`);
  if (r.costSharingRequired) bits.push('Match required');
  if (r.priorAwards) bits.push(`Prior median ${money(r.priorAwards.medianAward)} (n=${r.priorAwards.sampleSize})`);

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

function toCsv(rows) {
  const cols = ['fitScore','band','eligibility','daysUntilDeadline','closeDate','opportunityNumber',
    'title','agency','awardFloor','awardCeiling','costSharingRequired','cfdaNumbers',
    'contactEmail','url','eligibilityReason'];
  const cell = (v) => {
    if (v == null) return '';
    const s = Array.isArray(v) ? v.join('; ') : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(',')]
    .concat(rows.map((r) => cols.map((c) => cell(r[c])).join(',')))
    .join('\r\n');
}

function downloadCsv(rows) {
  // Leading BOM so Excel opens it as UTF-8 rather than mangling agency names.
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `federal-grants-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

let currentInvoice = null;
let lastResults = [];
let lastSummary = null;

function renderPaywall(lockedCount) {
  currentInvoice = currentInvoice || makeInvoice(CONFIG.basePrice);
  const inv = currentInvoice;
  return `<div class="card upgrade" id="paywall">
    <h2>${lockedCount} more ${lockedCount === 1 ? 'match' : 'matches'} found</h2>
    <p>You are seeing the top ${CONFIG.freePreviewResults}. Unlock the full ranked list,
       <b>CSV export</b>, and every scan you run for the next ${CONFIG.unlockDays} days — by sending
       <b>exactly $${inv.amount.toFixed(2)} USDC</b> on ${esc(CONFIG.chain)}.</p>

    <label style="margin-top:14px">Send exactly this amount</label>
    <div class="paybox"><code id="payamt">${inv.amount.toFixed(2)} USDC</code>
      <button class="copy" data-copy="${inv.amount.toFixed(2)}">Copy</button></div>
    <div class="hint">The cents are your payment reference — they are what identifies your
      transfer. Sending a different amount will not unlock.</div>

    <label style="margin-top:14px">To this address (${esc(CONFIG.chain)})</label>
    <div class="paybox"><code id="payaddr">${esc(CONFIG.cryptoAddress)}</code>
      <button class="copy" data-copy="${esc(CONFIG.cryptoAddress)}">Copy</button></div>

    <button class="go" id="verify" style="margin-top:16px">I've sent it — verify payment</button>
    <div id="paystatus" class="hint" style="margin-top:10px"></div>
    <p class="hint" style="margin-top:12px">Paid directly to the operator's wallet and verified
      on-chain in your browser. No account, no card, no processor. Your unlock is stored only in
      this browser.</p>
  </div>`;
}

function renderApify() {
  if (!hasPro()) return '';
  const feats = CONFIG.proFeatures.map((f) => `<li>${esc(f)}</li>`).join('');
  return `<div class="card upgrade"><h2>Need more than this?</h2>
    <p>The full version runs on Apify and adds:</p><ul>${feats}</ul>
    <a class="cta" href="${esc(CONFIG.apifyActorUrl)}" target="_blank" rel="noopener">Run it on Apify</a></div>`;
}

function paint() {
  const results = lastResults;
  const summary = lastSummary;
  if (!results.length) return;

  const counts = { STRONG_FIT: 0, POSSIBLE_FIT: 0, REVIEW_ELIGIBILITY: 0, WEAK_FIT: 0 };
  for (const r of results) counts[r.band]++;
  const pills = Object.entries(counts).filter(([, n]) => n > 0)
    .map(([b, n]) => `<span class="pill ${b}">${n} ${BAND_LABEL[b].toLowerCase()}</span>`).join('');

  const locked = paywallActive();
  const shown = locked ? results.slice(0, CONFIG.freePreviewResults) : results;
  const hidden = results.length - shown.length;

  const unlocked = !locked && hasCrypto() && getUnlock();
  const unlockNote = unlocked
    ? `<div class="hint" style="color:var(--strong)">Unlocked — full results, all scans, until ${
        new Date(unlocked.until).toLocaleDateString()}.</div>` : '';

  // Export is available whenever nothing is gated: either the operator has not
  // configured payments at all, or this visitor has unlocked.
  const exportBtn = !locked
    ? `<button class="copy" id="csv" style="margin-top:12px">Export ${results.length} results to CSV</button>`
    : '';

  $('out').innerHTML = `<div class="card">
      <div class="summary">${pills}</div>
      <div class="hint">Scanned ${summary.scanned} live opportunities${
        summary.filteredOutIneligible > 0
          ? `, filtered out ${summary.filteredOutIneligible} your organization type cannot apply for`
          : ''}.</div>
      ${unlockNote}
      ${exportBtn}
    </div>`
    + shown.map(renderResult).join('')
    + (hidden > 0 ? renderPaywall(hidden) : '')
    + renderApify();

  wirePaywall();
}

function wirePaywall() {
  const csv = $('csv');
  if (csv) csv.addEventListener('click', () => downloadCsv(lastResults));

  document.querySelectorAll('.copy:not(#csv)').forEach((b) => {
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        const old = b.textContent; b.textContent = 'Copied';
        setTimeout(() => { b.textContent = old; }, 1400);
      } catch { /* clipboard blocked; the value is visible and selectable anyway */ }
    });
  });

  const v = $('verify');
  if (!v) return;
  v.addEventListener('click', async () => {
    const status = $('paystatus');
    v.disabled = true;
    v.textContent = 'Checking the blockchain…';
    status.textContent = '';
    try {
      const hit = await checkPayment({
        address: CONFIG.cryptoAddress,
        chain: CONFIG.chain,
        invoice: currentInvoice,
        usedHashes: spentHashes(),
      });
      if (hit) {
        setUnlock(hit.tx);
        status.innerHTML = `Payment confirmed — <a href="${esc(explorerTxUrl(CONFIG.chain, hit.tx))}"
          target="_blank" rel="noopener">view transaction</a>. Unlocking…`;
        setTimeout(paint, 900);
      } else {
        status.textContent =
          `No matching payment found yet. Transfers usually confirm within a few seconds — ` +
          `wait a moment and check again. The amount must be exactly ` +
          `$${currentInvoice.amount.toFixed(2)} USDC on ${CONFIG.chain}.`;
        v.disabled = false;
        v.textContent = "I've sent it — verify payment";
      }
    } catch (err) {
      status.textContent = `Could not verify: ${err.message}`;
      v.disabled = false;
      v.textContent = "I've sent it — verify payment";
    }
  });
}

// ── Scan ────────────────────────────────────────────────────────────────────
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
      maxResults: CONFIG.freeMaxResults,
      minDaysToApply: Number($('days').value) || 14,
      includeForecasted: $('forecast').checked,
      log: logLine,
    });

    lastResults = results;
    lastSummary = summary;

    if (!results.length) {
      $('out').innerHTML = `<div class="card"><div class="err">
        <b>No matching opportunities.</b> That is a real result, not an error — it usually means your
        keywords are too narrow, or your organization type is not eligible for anything currently
        posted. Try fewer or broader keywords.</div></div>`;
      return;
    }
    paint();
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
