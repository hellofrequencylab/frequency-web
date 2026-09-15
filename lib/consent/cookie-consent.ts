// The BROWSER-LEVEL cookie consent law, in one pure place (OWN-061, ADR-1370).
//
// ── WHAT THIS IS AND WHAT IT IS NOT ─────────────────────────────────────────────────────────────
// lib/consent/consent.ts is the ACCOUNT-level ledger: `consent_records` keyed by a profile id,
// which is what a signed-in member's AI writes and account-tied analytics gate on. It cannot answer
// for a visitor, because a visitor has no profile row, and the two writers this module gates both
// fire long before anyone signs in:
//
//   · the GA4 tag, which the ROOT layout mounts for EVERYONE (components/analytics/google-analytics.tsx);
//   · the 90-day first-touch attribution cookie `fq_attr` (+ the `fq_src` channel hint), which
//     proxy.ts writes at the EDGE on an anonymous visitor's very first request (HYG-048).
//
// So this is the browser layer, stored in cookies because the edge has to read it before a byte of
// JS runs, and because the visitor it describes is anonymous by definition. The two layers are
// ANDed, never merged: a signed-in member who denies here stops GA for this browser, and the
// account scope still governs their account-tied data.
//
// ── OPT-IN WHERE PRIOR CONSENT IS THE LAW, OPT-OUT EVERYWHERE ELSE ──────────────────────────────
// ePrivacy Art. 5(3) (as implemented across the EU/EEA and, post-Brexit, by PECR in the UK) requires
// consent BEFORE non-essential storage is written. Nowhere else does, and the `analytics` scope in
// scopes.ts has defaulted to GRANTED since ADR-069. Flipping that default globally would silently
// change behaviour for every existing visitor and member, so it is NOT flipped: `analyticsAllowed`
// returns true for an un-decided visitor OUTSIDE the prior-consent region, exactly as today, and
// false for an un-decided visitor INSIDE it. One function, two regions, no default changed.
//
// ── PURE, AND EDGE-SAFE ─────────────────────────────────────────────────────────────────────────
// No React, no next/*, no DOM, no server imports, so the edge (proxy.ts), the head script builder,
// the banner and the unit tests all read ONE file. The head script below is a STRING because it has
// to run before paint and before hydration; the jsdom test executes that real string against this
// same law across the full matrix, so a copy that drifts fails the build (the method
// lib/theme/mode.test.ts established for the pre-paint bootstrap).

/* ── Storage ──────────────────────────────────────────────────────────────── */

/** The visitor's recorded choice. Readable at the edge and by the head script, so: a cookie. */
export const CONSENT_COOKIE = 'fq_consent'

/**
 * Whether prior consent is required where this visitor is. A BOOLEAN, not a country: the edge
 * already knows the country and nothing downstream needs it, so the browser is told the answer
 * rather than the input. Strictly necessary for providing the consent mechanism itself, which is
 * the one category ePrivacy exempts, so it is written before a choice exists.
 */
export const CONSENT_REGION_COOKIE = 'fq_ask'

/**
 * How long a recorded choice stands. Six months is the re-ask cadence EU regulators consistently
 * describe as reasonable; after it the banner asks again rather than assuming a years-old click.
 */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180 // 180 days

/** A recorded choice. Absence of one is `null`, and is NOT the same as `'denied'`. */
export type ConsentChoice = 'granted' | 'denied'

/* ── Where prior consent is the law ───────────────────────────────────────── */

/**
 * ISO 3166-1 alpha-2 codes where non-essential storage needs consent FIRST: the EU-27, the three
 * non-EU EEA states (Iceland, Liechtenstein, Norway, which take ePrivacy through the EEA
 * agreement), and the UK (PECR). Matched against Vercel's `x-vercel-ip-country`, which the /q
 * resolver already reads.
 *
 * Deliberately NOT here: Switzerland. The revised FADP has no prior-consent rule for cookies, so
 * adding CH would be a guess in the direction of asking people who did not need asking. If the
 * owner wants the wider net, add 'CH' and the Crown dependencies (GG, JE, IM) here; it is a
 * one-line change and nothing else moves.
 */
export const PRIOR_CONSENT_COUNTRIES: readonly string[] = [
  // EU-27
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // EEA, non-EU
  'IS', 'LI', 'NO',
  // United Kingdom
  'GB',
] as const

const PRIOR_CONSENT_SET = new Set(PRIOR_CONSENT_COUNTRIES)

/**
 * Whether a country code sits in the prior-consent region.
 *
 * 🔴 AN UNKNOWN COUNTRY IS TREATED AS OUTSIDE IT, and that is a deliberate, narrow call: the header
 * is absent in local dev, in tests and on any non-Vercel host, and it is never absent for a real
 * visitor on the production edge. Failing closed on absence would flip the analytics default for
 * every developer and every visitor the moment the header hiccuped, which is the behaviour change
 * OWN-061 explicitly forbids. Failing open on a REAL EU IP is the thing that would matter, and
 * Vercel always labels one.
 */
export function requiresPriorConsent(country: string | null | undefined): boolean {
  if (!country) return false
  return PRIOR_CONSENT_SET.has(country.trim().toUpperCase())
}

/* ── The recorded choice ──────────────────────────────────────────────────── */

/** Narrow a raw cookie value to a choice. Anything else (including absence) is "not decided". */
export function parseConsentChoice(raw: string | null | undefined): ConsentChoice | null {
  return raw === 'granted' || raw === 'denied' ? raw : null
}

export interface ConsentState {
  /** What the visitor has recorded, or null if they have not been asked or have not answered. */
  choice: ConsentChoice | null
  /** Whether prior consent is required where they are. */
  priorConsentRegion: boolean
}

/**
 * THE ONE ORDERING RULE. Every non-essential writer asks this before it writes: the GA4 tag, and
 * the first-touch attribution cookie at the edge. A `false` here means nothing lands on the
 * visitor's device.
 */
export function analyticsAllowed(state: ConsentState): boolean {
  if (state.choice === 'granted') return true
  if (state.choice === 'denied') return false
  return !state.priorConsentRegion
}

/** Whether the banner has anything to ask. Only ever true where prior consent is required. */
export function shouldAskForConsent(state: ConsentState): boolean {
  return state.priorConsentRegion && state.choice === null
}

/* ── The head script ──────────────────────────────────────────────────────── */

/**
 * The GA4 loader, as a synchronous `<head>` script.
 *
 * ⚠️ WHY A STRING AND NOT A CLIENT COMPONENT. The ROOT layout is deliberately STATIC (its own
 * comment says so: the public marketing and discover pages prerender), so nothing there may read a
 * cookie on the server. A React client component could read one, but only after hydration, which
 * would move GA behind the bundle for the visitors whose answer is "load it", and would put the
 * decision in the eager shell bundle every phone parses (check:shell-weight). This runs in the
 * head, costs no client-bundle bytes, and answers before the first paint.
 *
 * It defines `window.__fqGa` — an IDEMPOTENT loader — and calls it immediately only when the law
 * above allows. The banner calls the SAME function when a visitor accepts, so consent starts GA in
 * that pageview without a reload and without a second copy of the loading rules anywhere.
 *
 * ⚠️ FOR THE ADR-170 NONCE FOLLOW-UP: the gtag tag is now APPENDED rather than server-rendered, so
 * this joins `lib/maps/google-loader.ts` in the list of injected scripts a nonce-based `script-src`
 * would break. The nonce would have to be carried onto the element created below. Today's policy
 * (next.config.ts) is `'unsafe-inline'` plus an allow-list that already names
 * `https://www.googletagmanager.com`, so nothing here needs it yet.
 */
export function gaBootstrapScript(gaId: string): string {
  const id = JSON.stringify(gaId)
  return `(function(){try{
var ID=${id},started=false;
window.__fqGa=function(){
if(started)return;started=true;
window.dataLayer=window.dataLayer||[];
function gtag(){window.dataLayer.push(arguments);}
try{if(localStorage.getItem('freq-ga-optout')==='1'){window['ga-disable-'+ID]=true;}}catch(e){}
gtag('js',new Date());
gtag('config',ID,{anonymize_ip:true,allow_google_signals:false,allow_ad_personalization_signals:false});
var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+ID;
document.head.appendChild(s);
};
var m=/(?:^|;\\s*)${CONSENT_COOKIE}=([^;]*)/.exec(document.cookie);
var choice=m?m[1]:'';
var ask=/(?:^|;\\s*)${CONSENT_REGION_COOKIE}=1(?:\\s*;|\\s*$)/.test(document.cookie);
if(choice==='granted'||(choice!=='denied'&&!ask)){window.__fqGa();}
}catch(e){}})();`
}

/**
 * Withdrawal, expressed once. GA's own kill switch stops further hits in THIS pageview (the tag may
 * already be loaded when someone changes their mind), and the `_ga*` pair plus the attribution
 * cookies are cleared so the storage goes with the permission. Returns the cookie names it cleared
 * so a caller can assert on them; the DOM work is the caller's, which keeps this file pure.
 */
export function cookiesToClearOnWithdrawal(documentCookie: string): string[] {
  const names = new Set<string>(['fq_attr', 'fq_src'])
  for (const pair of documentCookie.split(';')) {
    const name = pair.split('=')[0]?.trim()
    if (name && (name === '_ga' || name.startsWith('_ga_') || name.startsWith('_gid'))) names.add(name)
  }
  return [...names]
}
