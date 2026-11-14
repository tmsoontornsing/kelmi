// Business details the Terms and Privacy Policy name. Fill every field before release: the documents show the
// bracketed placeholders until then, and `legalReady()` stays false so a release check can catch it.
// See docs/legal-review.md for what each one should be.
export const LEGAL = {
  // The legal entity that owns Kelmi, e.g. "Kelmi Labs LLC". Prefer an LLC or corporation over your own name.
  company: 'LOGICBAKER COMPANY LIMITED',
  // Where the company is registered. Thailand's Personal Data Protection Act (PDPA) applies to a data controller based
  // there, wherever its users are, so the Privacy Policy is written to meet it too.
  country: 'Thailand',
  // The company's registered address, exactly as on its company registration (DBD) certificate. The PDPA requires the
  // controller's address in the privacy notice, and California Civil Code 1789.3 requires it for paid services.
  address: '[REGISTERED ADDRESS]',
  // Where people send privacy requests and legal notices. Must be monitored.
  email: 'support@usekelmi.com',
  // The US state whose law governs the Terms and where disputes are heard.
  state: 'Delaware',
  // The county for court claims.
  county: 'New Castle County',
  // When these versions take effect. Change it, and tell users, whenever the documents change materially.
  // PLACEHOLDER DATE: this must be changed to the real publication date before release.
  effective: 'November 5, 2026',
  // Where the same documents live on the web. App Store Connect and Google Play need these URLs.
  termsUrl: 'https://usekelmi.com/terms',
  privacyUrl: 'https://usekelmi.com/privacy',
  healthUrl: 'https://usekelmi.com/consumer-health-data',
};

export const legalReady = () => !Object.values(LEGAL).some((v) => v.startsWith('['));

// Bump this whenever the Terms or Privacy Policy change materially. It is saved with each person's acceptance at sign-up.
// Bumped to 2026-11-06 for the minimum age change (18+ to 13+), and to 2026-11-14 for Kelmi Plus subscription terms, the
// Thai company and PDPA notices, and Delaware law. Nothing in the app currently compares it with an older
// saved value, so a bump does not re-prompt existing users: people who accepted an earlier version are not asked again.
export const TERMS_VERSION = '2026-11-14';
