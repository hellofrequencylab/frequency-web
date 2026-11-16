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
// ── 🔴 2026-09-15 (OWN-061, ADR-1370): THE TAG NO LONGER LOADS UNCONDITIONALLY ─────────────────
// This file used to render `<script async src=".../gtag/js?id=...">` flat into the head, and the
// only consent surface anywhere was <GaConsentGate/> in the AUTHENTICATED (main) layout. The tag
// mounts in the ROOT layout, so every anonymous visitor and every route outside (main) got GA4
// with no consent surface at all — this file's own header used to concede it ("the acquisition tag
// loads site-wide for everyone").
//
// The `src` tag is gone. What ships instead is ONE inline script, built by
// lib/consent/cookie-consent.ts, which decides from the consent cookies whether to append that
// `src` tag at all. The pure root stays static. The head asks the private request-policy endpoint before configuration; nothing
// on the wire for a visitor in the prior-consent region who has not answered. The request-policy
// wrapper also resolves the real account before loading; <GaConsentGate/> synchronizes later
// account/staff changes in the mounted app. Browser and account permission remain ANDed.

// The script text and the gate come from lib/consent/analytics-head.ts, which the proxy also reads
// to allow this script by hash under the nonce-based CSP (SCAN-1243). One string, two readers.
import { analyticsHeadScript, googleTagEnabled } from '@/lib/consent/analytics-head'

export function GoogleAnalytics() {
  if (!googleTagEnabled()) return null

  return <script dangerouslySetInnerHTML={{ __html: analyticsHeadScript() }} />
}

/** Product analytics remains request-policy gated when Google is unconfigured or disabled on a preview. */
export function FirstPartyAnalyticsPolicy() {
  if (googleTagEnabled()) return null
  return <script dangerouslySetInnerHTML={{ __html: analyticsHeadScript() }} />
}
