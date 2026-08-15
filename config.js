// ---------------------------------------------------------------------------
// Revenue configuration.
//
// Everything here is OFF until filled in, and the site degrades cleanly when it
// is: no broken links, no dead buttons, no "coming soon" placeholders. Fill a
// value, commit, and the funnel turns on. Nothing else needs to change.
// ---------------------------------------------------------------------------

export const CONFIG = {
  // Your published Apify actor URL. This is the paid tier and the primary
  // revenue path: Apify bills the customer by card, takes platform cost + 20%,
  // and pays you the rest. Set this after `apify push` + publish.
  //
  //   e.g. 'https://apify.com/YOUR_USERNAME/federal-grant-fit-scanner'
  apifyActorUrl: '',

  // Optional crypto tip address, for the no-KYC path. Shown as a quiet link,
  // never a paywall - paywalling the free tool would destroy the discovery
  // advantage that makes any of this work.
  //
  // LEAVE BLANK unless you have confirmed you hold the private key. Two
  // different addresses appear in this workspace (x402-seller/wallet.json holds
  // 0x26e967c1e708aC62Ebe6BF66f51061E555fc6ebd; the project notes record
  // 0x72B944dA66263bE35c2a2eDFeF5c525d58fa53Df). Publishing the wrong one sends
  // money somewhere you cannot reach.
  cryptoAddress: '',
  cryptoNetwork: 'Base / Ethereum',

  // Free tier limits. Keep the free tool genuinely useful - it is the marketing.
  freeMaxResults: 25,

  // What the paid tier adds. Shown verbatim on the upgrade card, so keep every
  // line true: each of these is real capability the actor already has.
  proFeatures: [
    'Up to 300 opportunities per scan, not 25',
    'CSV and JSON export straight into your spreadsheet or CRM',
    'Scheduled daily or weekly scans that run without you',
    'Email alerts the moment a grant you are eligible for is posted',
    'API access for your own tooling',
  ],
};

export const hasPro = () => Boolean(CONFIG.apifyActorUrl);
export const hasCrypto = () => Boolean(CONFIG.cryptoAddress);
