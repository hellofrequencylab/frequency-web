// Google Analytics 4 (gtag.js).
//
// Deliberately inert unless BOTH:
//   • NEXT_PUBLIC_GA_MEASUREMENT_ID is set (the `G-XXXXXXXXXX` from the GA4 property), and
//   • we're running in production.
// So it's safe to ship before the property exists, and it never fires in dev or
// on preview deploys (keeps preview traffic out of your reports).
//
// Privacy: we pass `anonymize_ip` and disable Google's advertising signals
// (`allow_google_signals`/`allow_ad_personalization_signals` off). GA4's
// "Enhanced measurement" auto-tracks client-side route changes, so this single
// snippet covers SPA navigation across the whole app — no manual pageview wiring.
// Disclosed in the privacy policy (see app/privacy/page.tsx) and ADR-048.
//
// STAFF OPT-OUT: an operator working IN the product should not pollute their own
// reports. The loader checks a persisted browser flag (`freq-ga-optout`, set by
// <GaStaffOptOut/> whenever a staff viewer loads) and, when present, sets GA's
// official kill switch `window['ga-disable-<ID>']=true` BEFORE the first config
// call, so not even the initial page_view is sent.
//
// 2026-09-05 (scan2 L3-03): "running in production" above meant NODE_ENV, which Next forces to
// 'production' on every Vercel build, previews included, so the tag DID fire on preview deploys.
// The gate is now VERCEL_ENV === 'production', with NODE_ENV consulted only when VERCEL_ENV is
// unset (local / non-Vercel). VERCEL_ENV is a Vercel system variable, present at build and
// runtime, and this is a Server Component, so the read is a real one and not an inlined blank.
//
// ── 🔴 2026-09-15 (OWN-061, ADR-1367): THE TAG NO LONGER LOADS UNCONDITIONALLY ─────────────────
// This file used to render `<script async src=".../gtag/js?id=...">` flat into the head, and the
// only consent surface anywhere was <GaConsentGate/> in the AUTHENTICATED (main) layout. The tag
// mounts in the ROOT layout, so every anonymous visitor and every route outside (main) got GA4
// with no consent surface at all — this file's own header used to concede it ("the acquisition tag
// loads site-wide for everyone").
//
// The `src` tag is gone. What ships instead is ONE inline script, built by
// lib/consent/cookie-consent.ts, which decides from the consent cookies whether to append that
// `src` tag at all. Same head, same timing, same config for a visitor whose answer is yes; nothing
// on the wire for a visitor in the prior-consent region who has not answered. <GaConsentGate/> is
// untouched and still runs in the (main) layout: the two gates are ANDed, browser layer and
// account layer, and neither replaces the other.

import { gaBootstrapScript } from '@/lib/consent/cookie-consent'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

/** The deployment we are running in: Vercel's VERCEL_ENV when present, NODE_ENV otherwise. */
function deployEnv(): string | undefined {
  return process.env.VERCEL_ENV || process.env.NODE_ENV
}

export function GoogleAnalytics() {
  if (!GA_ID || deployEnv() !== 'production') return null

  return <script dangerouslySetInnerHTML={{ __html: gaBootstrapScript(GA_ID) }} />
}
