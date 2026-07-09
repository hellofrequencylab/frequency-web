import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// An ENFORCED Content-Security-Policy (P8 hardening, ADR-170). Graduated from
// report-only after the report-only pass confirmed the real source set.
//
// What this blocks NOW: clickjacking (`frame-ancestors 'self'`), `<base>`-tag
// injection (`base-uri 'self'`), form hijacking (`form-action 'self'`), plugins
// (`object-src 'none'`), and data-exfiltration to any host outside the verified
// `connect-src` allowlist — plus `eval()` as an XSS vector (dropped in production;
// React/Next only need it in dev). `'wasm-unsafe-eval'` keeps the WASM rasterizer
// (resvg) and maplibre working.
//
// The one directive still permissive: `script-src` keeps `'unsafe-inline'`. Next's
// App Router emits inline RSC streaming scripts on every page, so dropping inline
// without nonces (which force every page dynamic — see ADR-170) or experimental SRI
// would break hydration site-wide. The full inline-script XSS mile is the tracked
// follow-up; everything around it is enforced today.
const isDev = process.env.NODE_ENV === 'development'
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'", // matches X-Frame-Options SAMEORIGIN (clickjacking)
  "form-action 'self'",
  // 'unsafe-inline' retained for Next's inline RSC scripts; 'unsafe-eval' is dev-only
  // (React debug); 'wasm-unsafe-eval' for the resvg WASM rasterizer + maplibre.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com https://va.vercel-scripts.com https://*.vercel.live`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // connect-src is the exfiltration gate — every runtime fetch/XHR/WS target is listed:
  // Supabase (REST + realtime), GA (incl. GA4's region-routed /g/collect endpoint), Vercel
  // insights/live, OpenFreeMap tiles (maplibre), Photon (address geocoding), ipapi (IP geo).
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://region1.google-analytics.com https://vitals.vercel-insights.com https://*.vercel.live https://tiles.openfreemap.org https://photon.komoot.io https://ipapi.co",
  // frame-src — the only hosts we may embed. Spotlight media embeds (lib/spotlight/embeds.ts)
  // reconstruct iframe srcs ONLY for these allowlisted players; keep the two lists in sync.
  "frame-src 'self' https://*.vercel.live https://www.youtube.com https://player.vimeo.com https://open.spotify.com https://w.soundcloud.com",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  'report-uri /api/csp-report', // keep reporting even while enforcing — catch any miss
].join('; ')

// Baseline security headers applied to every route. X-Frame-Options is SAMEORIGIN (not
// DENY) so the Puck editor's same-origin preview iframe keeps working while cross-origin
// clickjacking is still blocked. CSP is now ENFORCED (graduated from report-only).
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Map uses the Geolocation API; camera/microphone are never used.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'Content-Security-Policy', value: csp },
]

const nextConfig: NextConfig = {
  // Server Action request bodies default to 1MB, which silently rejects image uploads
  // before they reach the action — our hero/cover uploaders accept up to 8MB
  // (uploadPageHero, uploadCircleCover). Raise the limit so the framework lets those
  // through and the action's own size check is the real gate.
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
  // Keep the wasm rasterizer (styled QR PNG export, lib/qr/raster.ts) external so the
  // bundler doesn't try to bundle its .wasm — it's loaded from node_modules at runtime.
  serverExternalPackages: ['@resvg/resvg-wasm', 'pdf-parse', 'mammoth'],
  // The help center is plain Markdown under content/help/**, read from disk at
  // RUNTIME by (a) the "Ask Vera" reindex — nightly cron + admin "Build index" —
  // and (b) the support launcher's search index in the (main) layout. Next's
  // tracer can't follow those dynamic fs reads, so without an explicit include the
  // files are absent from the serverless bundle: every read returns [], the
  // help_chunks index builds empty, and "Ask Vera" can only ever deflect. The
  // content is tiny, so bundle it into the routes that need it. (Help *pages* are
  // unaffected — they're statically generated at build time.) See docs/SUPPORT-SYSTEM.md.
  outputFileTracingIncludes: {
    '/api/cron/embed-help': ['./content/help/**/*'],
    '/admin/vera-ai': ['./content/help/**/*'],
    '/**': ['./content/help/**/*'],
    // The resvg WASM rasterizer (lib/qr/raster.ts) reads index_bg.wasm from node_modules at
    // RUNTIME via fs (the package is in serverExternalPackages, so it is never bundled). Next's
    // tracer follows the JS entry but NOT that derived `readFile` path, so without an explicit
    // include the .wasm is absent from the serverless bundle on Vercel — initWasm throws and every
    // styled PNG export silently degrades to a plain code. Bundle it into the two routes that
    // rasterize: the styled QR download + the entry-point flyer.
    '/api/qr': ['./node_modules/@resvg/resvg-wasm/index_bg.wasm'],
    // `*` (not the literal `[slug]`, which globs as a character class) matches the dynamic segment.
    '/api/entry-points/*/flyer': ['./node_modules/@resvg/resvg-wasm/index_bg.wasm'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  // Admin reorg Phase 3: the CRM + Marketing operator surfaces moved INTO the admin
  // address space, and the old /growth launchpad collapsed into the /admin/growth
  // dashboard. These redirects catch bookmarks and any lingering reference. Temporary
  // (permanent: false) so the mapping can still evolve without a cached 308 locking it.
  async redirects() {
    return [
      { source: '/crm', destination: '/admin/growth?tab=crm', permanent: false },
      { source: '/crm/:path*', destination: '/admin/crm/:path*', permanent: false },
      { source: '/marketing', destination: '/admin/growth?tab=marketing', permanent: false },
      { source: '/marketing/:path*', destination: '/admin/marketing/:path*', permanent: false },
      { source: '/growth', destination: '/admin/growth', permanent: false },
      // The Quest help category was renamed from the-game -> the-quest (naming canon:
      // the year-round game is "The Quest"). Redirect old help links + bookmarks.
      { source: '/help/the-game', destination: '/help/the-quest', permanent: false },
      { source: '/help/the-game/:path*', destination: '/help/the-quest/:path*', permanent: false },
      // The pricing "five doors" rename (ADR-590): the old persona pages collapsed to five doors.
      // Redirect the retired slugs so bookmarks + inbound links keep landing somewhere real.
      // The funnel doors use SHORT slugs (ADR-591). The retired persona long-slugs redirect in. The short
      // slugs studios / hosts / communities / nonprofits are real pages (or land as their funnels ship), so
      // they are NOT redirected here (a redirect would shadow the real route).
      { source: '/for/coaches-and-healers', destination: '/for/coaches', permanent: false },
      { source: '/for/event-hosts', destination: '/pricing', permanent: false },
      { source: '/for/community-builders', destination: '/pricing', permanent: false },
      { source: '/for/event-spaces', destination: '/pricing', permanent: false },
      { source: '/for/service-businesses', destination: '/pricing', permanent: false },
      { source: '/for/product-businesses', destination: '/pricing', permanent: false },
    ]
  },
  images: {
    // Serve modern formats + responsive sizes via Next's optimizer.
    formats: ["image/avif", "image/webp"],
    // Allow optimizing images uploaded to the public Supabase Storage buckets
    // (site-media for marketing pages, plus avatars/post media).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Demo/seed placeholder imagery (circle covers + member avatars). Harmless
      // to allow; simply unreferenced once demo content is cleared.
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "i.pravatar.cc" },
    ],
  },
};

// Wrap with Sentry's Next plugin (H0-4). This is SAFE WHEN UNCONFIGURED: with no
// SENTRY_DSN the runtime SDK never initialises (see lib/observability/sentry.ts),
// and with no SENTRY_AUTH_TOKEN / org / project the build-time source-map upload is
// skipped — withSentryConfig becomes a near pass-through that doesn't break the build.
// org/project/authToken come from env so nothing Sentry-specific is hardcoded.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only chatter about source-map upload in CI.
  silent: !process.env.CI,
  // Upload a wider set of source maps for readable client stack traces.
  widenClientFileUpload: true,
  // Tree-shake Sentry logger statements from the production client bundle.
  disableLogger: true,
});
