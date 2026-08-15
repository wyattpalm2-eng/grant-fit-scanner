/**
 * Regression tests for the crypto-paid front end.
 *
 * The HEAD tests are the important ones. The previous server on this machine
 * recorded 44 sales that never happened because HEAD requests to case- and
 * slash-variant paid paths slipped its guard and were dispatched to GET. Those
 * phantom customers were indistinguishable from real ones in the ledger.
 */

import { isPaidPath, normalisePath, app } from '../server/server.js';

let failures = 0;
function check(cond, msg) {
  if (cond) console.log(`  PASS  ${msg}`);
  else { console.log(`  FAIL  ${msg}`); failures++; }
}

console.log('\n=== PATH NORMALISER (phantom-sale guard) ===');
const variants = ['/scan', '/scan/', '/Scan', '/SCAN', '/ScAn/', '/scan//', '/scan?org=x'];
for (const v of variants) {
  check(isPaidPath(v), `"${v}" is recognised as a paid path`);
}
check(!isPaidPath('/demo/scan'), '"/demo/scan" is NOT a paid path');
check(!isPaidPath('/health'), '"/health" is NOT a paid path');
check(!isPaidPath('/'), '"/" is NOT a paid path');
check(normalisePath('/') === '/', 'root path survives normalisation');

console.log('\n=== LIVE SERVER BEHAVIOUR ===');

const server = app.listen(0, async () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // HEAD on every paid-path variant must be refused, never dispatched to GET.
    for (const v of ['/scan', '/scan/', '/SCAN', '/Scan/']) {
      const r = await fetch(base + v, { method: 'HEAD' });
      check(r.status === 405, `HEAD ${v} -> 405 (refused, cannot mint a phantom sale)`);
    }

    // With PAY_TO unset the paid route must fail closed, never serve free.
    const paid = await fetch(`${base}/scan?org=small_business&keywords=health`);
    check(paid.status === 503, `GET /scan with no PAY_TO -> 503 (fails closed, got ${paid.status})`);
    const paidBody = await paid.json();
    check(!paidBody.results, 'Unpaid /scan returned no results payload');

    // Free tier must work with no wallet at all - this is the discovery hook.
    const demo = await fetch(`${base}/demo/scan?org=nonprofit_501c3&keywords=youth`);
    check(demo.status === 200, `GET /demo/scan -> 200 with no wallet (got ${demo.status})`);
    const demoBody = await demo.json();
    check(Array.isArray(demoBody.results) && demoBody.results.length > 0,
      `Free tier returned live results (${demoBody.results ? demoBody.results.length : 0})`);
    check(demoBody.results.every((r) => Array.isArray(r.whyThisScore) && r.whyThisScore.length),
      'Free-tier results still carry full evidence');

    // Rate limit must actually engage on the second call.
    const again = await fetch(`${base}/demo/scan?org=nonprofit_501c3&keywords=youth`);
    check(again.status === 429, `Second free scan -> 429 rate limited (got ${again.status})`);

    const root = await fetch(base + '/');
    const rootBody = await root.json();
    check(rootBody.paywall_active === false,
      'Index honestly reports paywall_active=false when unconfigured');

    console.log(`\n${failures === 0 ? 'ALL SERVER CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  } catch (err) {
    console.error('FATAL', err);
    failures++;
  } finally {
    server.close();
    process.exit(failures === 0 ? 0 : 1);
  }
});
