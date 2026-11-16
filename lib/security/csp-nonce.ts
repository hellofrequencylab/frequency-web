// NONCE-BASED script-src, IN TWO STEPS, BEHIND TWO SWITCHES (SCAN-1243, ADR-1954).
//
// The enforced policy in next.config.ts keeps `'unsafe-inline'` in script-src because Next's App
// Router puts inline scripts in every page. A nonce removes it, and Next only stamps a nonce on a
// page it renders PER REQUEST (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md:
// "you must use dynamic rendering to add nonces"; static, ISR and PPR pages cannot carry one). So
// this policy is sent ONLY on the routes that are already per-request renders: the member app under
// app/(main), whose layout reads headers() on every request. The static marketing, discover, help
// and Space-website pages keep today's policy and stay static. Nothing here touches the root layout.
//
// THE TWO SWITCHES (both blank by default, both read through envFlag; docs/RUNBOOKS.md
// "Nonce-based script policy"):
//   CSP_NONCE_REPORT_ONLY  the test run. The strict policy rides ALONGSIDE today's enforced one as
//                          Content-Security-Policy-Report-Only. Nothing is blocked; a browser only
//                          reports what the strict policy would have blocked.
//   CSP_NONCE_ENFORCE      the strict policy is sent as Content-Security-Policy on the same routes.
//                          It wins over the first switch. Blank it and redeploy to roll back.
// Both off (the default), `nonceCspFor` returns null before doing any work and the proxy sends
// exactly what it sent before this file existed.
//
// HOW AN INLINE SCRIPT GETS THROUGH THE STRICT POLICY:
//   · Next's own scripts (bootstrap, chunks, the streamed RSC payload) get the nonce from Next
//     itself: it reads `'nonce-…'` out of the REQUEST's Content-Security-Policy header, which the
//     proxy sets (next/dist/server/route-modules/app-page/parse-request-headers.js).
//   · The root layout's pre-paint scripts are CONSTANT strings, so they are allowed by SHA-256 hash
//     (`inlineScriptSources` below). The root layout cannot read a nonce: reading headers() there
//     would turn every static page dynamic.
//   · The one inline script whose text varies per request (the generation stamp in
//     app/(main)/layout.tsx) carries the nonce, read from the `x-nonce` request header.
//   · JSON-LD (`<script type="application/ld+json">`) is a data block. The browser never executes
//     it, so CSP never checks it and it needs neither.
//   · Scripts that trusted code appends (gtag.js, Stripe.js, the Maps loader, Vercel Analytics,
//     Turbopack chunks) are allowed by `'strict-dynamic'`.
// The full inventory is docs/security/csp-nonce.md.

import { envFlag } from '@/lib/env/string'
import { log } from '@/lib/log'
import { isDocumentRequest, type MarkerRequest } from '@/lib/nav/marker-cookie'
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme/mode'
import { INSTALL_CAPTURE_SCRIPT } from '@/lib/pwa/install-capture'
import { POPOVER_DISMISS_SCRIPT } from '@/lib/ui/popover-dismiss'
import { SIDE_PREPAINT_SCRIPT } from '@/lib/ui/side-prepaint'
import { analyticsHeadScript } from '@/lib/consent/analytics-head'

const CSP_NONCE_REPORT_ONLY_FLAG = 'CSP_NONCE_REPORT_ONLY'
const CSP_NONCE_ENFORCE_FLAG = 'CSP_NONCE_ENFORCE'

type NonceCspMode = 'off' | 'report-only' | 'enforce'

/** Which step of the rollout this deployment is on. Enforce wins when both are set. */
function nonceCspMode(): NonceCspMode {
  if (envFlag(CSP_NONCE_ENFORCE_FLAG)) return 'enforce'
  if (envFlag(CSP_NONCE_REPORT_ONLY_FLAG)) return 'report-only'
  return 'off'
}

// ── WHICH ROUTES ─────────────────────────────────────────────────────────────────────────────
//
// A route is in only when the page that renders it lives under app/(main). The rule is written
// against the path the app RENDERS (after the proxy's own rewrites), and csp-nonce-routes.test.ts
// walks app/ to hold both halves: no page outside app/(main) matches, and every page inside does.

/** First segments that only app/(main) owns. */
const MEMBER_SEGMENTS = new Set([
  'admin', 'cart', 'channels', 'circles', 'codes', 'connections', 'crew', 'drafts', 'e', 'edit',
  'entry-points', 'feed', 'founder', 'friends', 'g', 'hunts', 'journal', 'journeys', 'launch', 'lead',
  'library', 'marketplace', 'meet', 'messages', 'n', 'nearby', 'network', 'notifications', 'offer',
  'on-air', 'orders', 'outreach', 'pages', 'partners', 'people', 'practices', 'profile', 'rewards',
  'scan', 'search', 'settings', 'site-map', 'support', 'training', 'upgrade',
])

// First segments shared with a static or ISR page outside app/(main) (the share pages under
// app/(public), the /spaces marketing index, the claim links). Each rule names the member half only.
const SHARED_SEGMENT_RULES: Record<string, RegExp> = {
  // The index, create, drafts, the scanner and the member calendar; then an event's member pages.
  // /events/<slug> itself is the ISR share page; the proxy rewrites a member to /events/<slug>/full.
  events: /^\/events(?:\/(?:new|scan|calendar)|\/drafts(?:\/[^/]+)?|\/(?!claim\/|calendar\/)[^/]+\/(?:full|manage|seat\/[^/]+))?$/,
  // /spaces is the marketing index and /spaces/<slug> the ISR profile (a member is rewritten to
  // /spaces/<slug>/full). Under a Space, everything is the member tree except the public Show page,
  // the calendar feed and the Spotlight page.
  spaces: /^\/spaces\/(?:(?:directory|new|operating)|invite\/[^/]+|(?!claim\/|invite\/|directory\/|new\/|operating\/)[^/]+\/(?!calendar\.ics$|spotlight(?:\/|$)|podcasts\/[^/]+$)[^/]+(?:\/.*)?)$/,
  classifieds: /^\/classifieds(?:\/new|\/[^/]+\/edit)?$/,
  housing: /^\/housing(?:\/new|\/roommates|\/[^/]+\/edit)?$/,
  market: /^\/market(?:\/manage|\/sell)?$/,
  store: /^\/store$/,
}

/** True when `renderPath` (the path the app renders, after any proxy rewrite) is a member-app page. */
export function isNonceRoute(renderPath: string): boolean {
  const path = renderPath.length > 1 ? renderPath.replace(/\/+$/, '') : renderPath
  const first = path.split('/')[1] ?? ''
  if (MEMBER_SEGMENTS.has(first)) return true
  const rule = SHARED_SEGMENT_RULES[first]
  return rule ? rule.test(path) : false
}

// ── THE POLICY ───────────────────────────────────────────────────────────────────────────────

/** Where the strict policy's reports go: the existing sink, tagged so the two policies' reports
 *  can be told apart in the log (app/api/csp-report/route.ts logs the tag as `policy`). */
const NONCE_REPORT_URI = '/api/csp-report?policy=nonce'

/**
 * Today's enforced directives, restated. THE CANON IS next.config.ts: that file keeps its own
 * literal because the SCAN-1243 verify probe reads it there, and it is the policy every static page
 * still gets. csp-nonce.test.ts imports next.config.ts and fails if this copy differs by one byte.
 * When a host is added to the policy, add it in both files; the test names the difference.
 */
export function enforcedDirectives(isDev: boolean): string[] {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com https://va.vercel-scripts.com https://vercel.live https://*.vercel.live https://maps.googleapis.com https://maps.gstatic.com https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.frequencylocal.com wss://api.frequencylocal.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net https://www.google.com/g/collect https://www.googletagmanager.com https://vercel.live https://*.vercel.live https://tiles.openfreemap.org https://maps.googleapis.com https://maps.gstatic.com https://photon.komoot.io https://ipapi.co https://api.stripe.com https://merchant-ui-api.stripe.com https://o4512171150934016.ingest.us.sentry.io",
    "frame-src 'self' https://vercel.live https://*.vercel.live https://www.youtube.com https://player.vimeo.com https://open.spotify.com https://w.soundcloud.com https://bandcamp.com https://embed.music.apple.com https://player.twitch.tv https://clips.twitch.tv https://js.stripe.com https://hooks.stripe.com",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    'report-uri /api/csp-report',
  ]
}

/**
 * The strict policy: today's policy with ONE directive changed and the report address tagged.
 *
 * script-src swaps `'unsafe-inline'` for the nonce, `'strict-dynamic'`, `'report-sample'` (so a
 * report carries the first 40 characters of a blocked inline script, which is how the test run names
 * it) and the hashes. `'self'` and the host list stay: a browser that implements `'strict-dynamic'`
 * ignores them, and one that does not falls back to them, so no browser gets a wider policy than
 * today's. style-src is untouched: this row is about scripts.
 *
 * PURE. The nonce must match Next's own pattern (get-script-nonce-from-header.js), or Next would
 * not find it and no script would carry it.
 */
export function buildNoncePolicy(opts: { nonce: string; scriptHashes: readonly string[]; isDev: boolean }): string {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(opts.nonce)) throw new Error('csp nonce is not base64')
  const strict = [`'nonce-${opts.nonce}'`, "'strict-dynamic'", "'report-sample'", ...opts.scriptHashes].join(' ')
  return enforcedDirectives(opts.isDev)
    .map((directive) => {
      if (directive.startsWith('script-src ')) return directive.replace("'unsafe-inline'", strict)
      if (directive.startsWith('report-uri ')) return `report-uri ${NONCE_REPORT_URI}`
      return directive
    })
    .join('; ')
}

// ── THE HASHES ───────────────────────────────────────────────────────────────────────────────

/**
 * Every constant inline script a member-app document can contain, in the order they appear. Each
 * is imported from the module the page renders it from, so the hash and the page cannot drift.
 *
 * ⚠️ `analyticsHeadScript()` embeds three functions by `toString()` (lib/consent/cookie-consent.ts).
 * The proxy and the page are separate bundles, so if the bundler ever prints those functions
 * differently in the two, this hash will not match and the analytics script shows up in the report
 * as a blocked inline script whose sample starts `(function(){try{\nvar ID=`. That is a thing to
 * look for in the test run, before enforcing (docs/RUNBOOKS.md).
 */
export function inlineScriptSources(): string[] {
  return [
    THEME_BOOTSTRAP_SCRIPT, // app/layout.tsx
    INSTALL_CAPTURE_SCRIPT, // app/layout.tsx
    POPOVER_DISMISS_SCRIPT, // app/layout.tsx
    analyticsHeadScript(), // app/layout.tsx, through components/analytics/google-analytics.tsx
    SIDE_PREPAINT_SCRIPT, // components/frequency/site/shell/site-root.tsx (signed-out views in the member tree)
  ]
}

/** `'sha256-…'` for one inline script, the form a CSP source list takes. */
export async function scriptHashSource(script: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script))
  let binary = ''
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte)
  return `'sha256-${btoa(binary)}'`
}

// The scripts are constants for the life of the process, so they are hashed once.
let hashes: Promise<string[]> | null = null
function inlineScriptHashes(): Promise<string[]> {
  hashes ??= Promise.all(inlineScriptSources().map(scriptHashSource))
  return hashes
}

/** 128 random bits, base64. Fresh for every document. */
function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

// ── WHAT THE PROXY ASKS ──────────────────────────────────────────────────────────────────────

export interface NonceCsp {
  nonce: string
  /** The RESPONSE header the policy goes out under: report-only for the test run. */
  header: 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only'
  policy: string
}

/**
 * The strict policy for this request, or null when it gets none: both switches off, not a full
 * page load (an RSC or Server Action response is not a document, so a policy on it does nothing),
 * or not a member-app route.
 *
 * FAIL-SAFE, AND IT SAYS SO: if hashing throws, the request keeps today's policy and
 * `csp.nonce.failed` is logged at error level. A page with no strict policy still works; a proxy
 * that throws is a 500 on every member page.
 */
export async function nonceCspFor(request: MarkerRequest, renderPath: string): Promise<NonceCsp | null> {
  const mode = nonceCspMode()
  if (mode === 'off') return null
  if (!isDocumentRequest(request) || !isNonceRoute(renderPath)) return null
  try {
    const nonce = newNonce()
    return {
      nonce,
      header: mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
      policy: buildNoncePolicy({
        nonce,
        scriptHashes: await inlineScriptHashes(),
        isDev: process.env.NODE_ENV === 'development',
      }),
    }
  } catch (error) {
    hashes = null
    log.error('csp.nonce.failed', { error: error instanceof Error ? error.message : String(error) })
    return null
  }
}
