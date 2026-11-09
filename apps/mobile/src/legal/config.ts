// Business details the Terms and Privacy Policy name. Fill every field before release: the documents show the
// bracketed placeholders until then, and `legalReady()` stays false so a release check can catch it.
// See docs/legal-checklist.md for what each one should be.
export const LEGAL = {
  // The legal entity that owns Kelmi, e.g. "Kelmi Labs LLC". Prefer an LLC or corporation over your own name.
  company: 'LOGICBAKER COMPANY LIMITED',
  // Where people send privacy requests and legal notices. Must be monitored.
  email: '[CONTACT EMAIL]',
  // A postal address for legal notices (a registered agent's address works).
  address: '[MAILING ADDRESS]',
  // The US state whose law governs the Terms and where disputes are heard, e.g. "Delaware".
  state: '[STATE]',
  // The county for court claims, e.g. "New Castle County".
  county: '[COUNTY]',
  // When these versions take effect. Change it, and tell users, whenever the documents change materially.
  // PLACEHOLDER DATE: this must be changed to the real publication date before release.
  effective: 'November 5, 2026',
  // Where the same documents live on the web. App Store Connect and Google Play need these URLs.
  termsUrl: 'https://usekavi.com/terms',
  privacyUrl: 'https://usekavi.com/privacy',
  healthUrl: 'https://usekavi.com/consumer-health-data',
};

export const legalReady = () => !Object.values(LEGAL).some((v) => v.startsWith('['));

// Bump this whenever the Terms or Privacy Policy change materially. It is saved with each person's acceptance at sign-up.
// Bumped to 2026-11-06 for the minimum age change (18+ to 13+). Nothing in the app currently compares it with an older
// saved value, so a bump does not re-prompt existing users: people who accepted an earlier version are not asked again.
export const TERMS_VERSION = '2026-11-06';
