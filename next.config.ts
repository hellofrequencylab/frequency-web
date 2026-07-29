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
  // maps.googleapis.com + maps.gstatic.com: the Google Maps JS API loader and the chunks it
  // pulls in, used ONLY when NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is set (ADR-901). With no
  // browsable key nothing from those hosts is ever requested — the maps run on MapLibre.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com https://va.vercel-scripts.com https://*.vercel.live https://maps.googleapis.com https://maps.gstatic.com`,
  // fonts.googleapis.com: the Maps JS API injects a Roboto stylesheet link at runtime.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  // fonts.gstatic.com serves the font files that stylesheet references.
  "font-src 'self' data: https://fonts.gstatic.com",
  // connect-src is the exfiltration gate — every runtime fetch/XHR/WS target is listed:
  // Supabase (REST + realtime), GA (incl. GA4's region-routed /g/collect endpoint), Vercel
  // insights/live, OpenFreeMap tiles (maplibre), Google Maps tiles/metadata (the keyed path,
  // ADR-901), Photon (address geocoding), ipapi (IP geo).
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.frequencylocal.com wss://api.frequencylocal.com https://www.google-analytics.com https://region1.google-analytics.com https://vitals.vercel-insights.com https://*.vercel.live https://tiles.openfreemap.org https://maps.googleapis.com https://maps.gstatic.com https://photon.komoot.io https://ipapi.co",
  // frame-src — the only hosts we may embed. Spotlight media embeds (lib/spotlight/embeds.ts)
  // reconstruct iframe srcs ONLY for these allowlisted players; keep the two lists in sync.
  "frame-src 'self' https://*.vercel.live https://www.youtube.com https://player.vimeo.com https://open.spotify.com https://w.soundcloud.com",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  'report-uri /api/csp-report', // keep reporting even while enforcing — catch any miss
].join('; ')

// 🔴 THE GOOGLE MAPS HOST SET IS COMPLETE — audited host by host, NO directive change needed.
// Recorded here because "CSP must be blocking the tiles" is the most natural guess when a
// keyed map falls back to MapLibre, and it cost real time. The Maps JS API pulls
// bootstrap + main.js + util.js + map.js + onion.js + controls.js, all from
// maps.googleapis.com (`script-src` ✅); its raster and vector tile images are covered by
// `img-src … https:` ✅; its /maps/vt XHRs and its own /maps/api/mapsjs/gen_204?csp_test=true
// probe go to maps.googleapis.com (`connect-src` ✅); it injects a Roboto stylesheet from
// fonts.googleapis.com (`style-src` ✅) whose files come from fonts.gstatic.com
// (`font-src` ✅). It creates no iframe, so `frame-src` is not involved, and it calls neither
// `eval()` nor `new Function()`, so production's lack of `'unsafe-eval'` is fine.
//
// ⚠️ FOR THE ADR-170 NONCE FOLLOW-UP: a nonce-based script-src WILL break this loader. The
// Google bootstrap propagates the nonce itself by copying
// `document.querySelector('script[nonce]').nonce` onto the main.js tag it appends, so the
// nonce must be on our injected tag in lib/maps/google-loader.ts or the second script is
// blocked and the map dies with no rejection to fall back on.

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
  // TYPECHECKING IS CI'S JOB, NOT THE BUILD'S (2026-07-28). `next build` ran a FULL
  // TypeScript pass on top of the compile, and as the repo grew that second pass began
  // exhausting the Vercel build container: the worker took a SIGKILL with an OOM event
  // reported, so a green PR failed to reach production. The pass is redundant, not
  // load-bearing: .github/workflows/ci.yml runs `pnpm exec tsc --noEmit` as a REQUIRED
  // check on every PR, and main only ever receives merged PRs, so a type error still
  // cannot land. Turning it off here removes the duplicate work, not the safety net.
  // If the typecheck ever stops gating CI, this MUST come back.
  typescript: { ignoreBuildErrors: true },
  // Server Action request bodies default to 1MB, which silently rejects image uploads
  // before they reach the action — our hero/cover uploaders accept up to 8MB
  // (uploadPageHero, uploadCircleCover). Raise the limit so the framework lets those
  // through and the action's own size check is the real gate.
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
  // Keep the wasm rasterizer (styled QR PNG export, lib/qr/raster.ts) external so the
  // bundler doesn't try to bundle its .wasm — it's loaded from node_modules at runtime.
  // `sharp` is a NATIVE binary: it re-encodes every OG card from Satori's lossless PNG to a
  // ~12x smaller JPEG (lib/og/deliver.ts). It must stay external or the bundler tries to trace a
  // platform-specific .node file into the serverless output.
  serverExternalPackages: ['@resvg/resvg-wasm', 'pdf-parse', 'mammoth', 'sharp'],
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
    // Also the OG share-card fonts (lib/og/load-nunito.ts), read from public/fonts at RUNTIME with
    // readFile — the same derived-path shape as the .wasm below. Next's tracer follows the JS entry
    // but not a path built inside the function, and an OG card that cannot load a font does not
    // degrade politely: Satori throws on an empty `fonts` array.
    //
    // Belt-and-braces rather than a known break (five OG routes already read from public/ this way),
    // but these fonts exist specifically to stop Apple Mail timing out on the claim card, and
    // shipping a fix that swapped a slow card for a broken one would be worse than not shipping it.
    //
    // ⚠️ FOLDED INTO THIS KEY, not added as a second '/**'. A duplicate key is a TS error and, worse,
    // the later one silently wins — which would have dropped the help content above and left
    // "Ask Vera" deflecting every question, the exact failure its own comment warns about.
    //
    // ⚠️ NAMED, not `*.ttf`. The glob also swept in LiberationSans-Regular (410,820 bytes), which
    // nothing reads from disk — lib/entry-points/flyer-raster.ts fetches its faces over HTTP — so
    // every lambda in the app carried it for nothing. The two faces below are the ones load-nunito
    // actually opens: the Nunito pair it draws with, and LiberationSans-Bold, its same-directory
    // fallback (~665KB total, down from ~1.05MB).
    '/**': [
      './content/help/**/*',
      './public/fonts/Nunito-Bold.ttf',
      './public/fonts/Nunito-Black.ttf',
      './public/fonts/LiberationSans-Bold.ttf',
    ],
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
      // The pricing "five doors" (ADR-590/591). Only genuinely RETIRED persona slugs belong here.
      //
      // These rules used to assume a short-slug rename (coaches / hosts / communities) that the funnel
      // registry never adopted: lib/marketing/funnel-config.ts still keys the doors on the LONG slugs,
      // and PERSONA_LOADOUTS + the sitemap both point at those. So three rules were shadowing live
      // pages — /for/coaches-and-healers redirected to /for/coaches, which is not a registry slug and
      // 404s under `dynamicParams = false`, and /for/event-hosts + /for/community-builders bounced
      // back to the very page their card was clicked from. Three of the five doors on /pricing were
      // dead, and all three are advertised in the sitemap. A redirect must never shadow a real route:
      // the guard in lib/marketing/funnel-redirects.test.ts now fails if one does.
      { source: '/for/event-spaces', destination: '/pricing', permanent: false },
      { source: '/for/service-businesses', destination: '/pricing', permanent: false },
      { source: '/for/product-businesses', destination: '/pricing', permanent: false },
      // Founder-pricing retirement: the founders marketing funnel is gone and the beta
      // price framing is "Opening Beta" on /pricing. Permanent — the routes are deleted
      // for good, so inbound links + old emails should transfer straight to /pricing.
      { source: '/founders', destination: '/pricing', permanent: true },
      { source: '/founders/offer', destination: '/pricing', permanent: true },
      { source: '/founders/business', destination: '/pricing', permanent: true },
      // Housing namespace move (ADR-596 cleanup): the last member-facing /marketplace/* URL
      // moved to /housing. Permanent (308) so old indexed URLs, bookmarks, and saved links
      // transfer their signals to the new canonical home. :path* also matches zero segments,
      // but keep the bare rule explicit so the pair reads like the other retired routes.
      { source: '/marketplace/housing', destination: '/housing', permanent: true },
      { source: '/marketplace/housing/:path*', destination: '/housing/:path*', permanent: true },
      // Events namespace merge (ADR-866, closing ADR-862's flagged follow-up): the commerce
      // hub's Events tab was a literal twin of /events (same data, same surface, canonical
      // already pointed here), so the duplicate route is retired and everything lands on the
      // one events home. Permanent (308), same shape as the housing pair above.
      { source: '/marketplace/events', destination: '/events', permanent: true },
      { source: '/marketplace/events/:path*', destination: '/events/:path*', permanent: true },
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
      // Supabase custom domain (branded API/storage host). Storage public URLs move
      // here once NEXT_PUBLIC_SUPABASE_URL points at the custom domain; the wildcard
      // above does not cover a non-supabase.co host, so it needs its own entry.
      {
        protocol: "https",
        hostname: "api.frequencylocal.com",
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
