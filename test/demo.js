import { scanGrants } from '../src/core.js';
import fs from 'node:fs';
(async()=>{
 const { results, summary } = await scanGrants({
   organizationType:'nonprofit_501c3',
   focusKeywords:['youth','mental health'],
   requestedAmount:150000,
   canCostShare:false,
 },{maxResults:8});
 console.log('SUMMARY',JSON.stringify(summary));
 console.log('\n--- TOP 3 WITH FULL REASONING ---');
 for(const r of results.slice(0,3)){
   console.log(`\n[${r.band} ${r.fitScore}/100] ${String(r.title).slice(0,72)}`);
   console.log(`  ${r.agency} | closes ${r.closeDate} (${r.daysUntilDeadline}d) | ${r.opportunityNumber}`);
   if(r.priorAwards) console.log(`  prior: median $${Math.round(r.priorAwards.medianAward).toLocaleString()} n=${r.priorAwards.sampleSize}`);
   for(const s of r.whyThisScore) console.log(`    ${s.points>=0?'+':''}${s.points}  ${s.label} :: ${String(s.evidence).slice(0,105)}`);
 }
 fs.writeFileSync('SAMPLE_OUTPUT.json',JSON.stringify(results.slice(0,5),null,2));
 console.log('\nwrote SAMPLE_OUTPUT.json');
 const audit = await scanGrants({organizationType:'individual',focusKeywords:['youth']},{maxResults:8,includeIneligible:true});
 const inelig = audit.results.filter(r=>r.eligibility==='INELIGIBLE').length;
 console.log(`\nAUDIT (individual, includeIneligible=true): ${audit.results.length} returned, ${inelig} INELIGIBLE -> gate actively excludes`);
})();
