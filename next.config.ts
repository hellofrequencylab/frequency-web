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
  // vercel.live is listed TWICE on purpose, here and below. A CSP wildcard matches
  // sub-domains ONLY: `https://*.vercel.live` does not cover the apex, and the preview
  // toolbar serves its feedback bundle from `https://vercel.live/_next-live/...`. The
  // smoke suite caught this as a console error on every preview deployment.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com https://va.vercel-scripts.com https://vercel.live https://*.vercel.live https://maps.googleapis.com https://maps.gstatic.com`,
  // fonts.googleapis.com: the Maps JS API injects a Roboto stylesheet link at runtime.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  // fonts.gstatic.com serves the font files that stylesheet references.
  "font-src 'self' data: https://fonts.gstatic.com",
  // connect-src is the exfiltration gate — every runtime fetch/XHR/WS target is listed:
  // Supabase (REST + realtime), GA (incl. GA4's region-routed /g/collect endpoint), Vercel
  // live (preview toolbar), OpenFreeMap tiles (maplibre), Google Maps tiles/metadata (the
  // keyed path, ADR-901), Photon (address geocoding), ipapi (IP geo). Web vitals are
  // first-party (POST /api/vitals, ADR-922) — the old vitals.vercel-insights.com entry
  // was the stale allowlist ADR-922 said should go rather than grow a third collector.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.frequencylocal.com wss://api.frequencylocal.com https://www.google-analytics.com https://region1.google-analytics.com https://vercel.live https://*.vercel.live https://tiles.openfreemap.org https://maps.googleapis.com https://maps.gstatic.com https://photon.komoot.io https://ipapi.co",
  // frame-src — the only hosts we may embed. Spotlight media embeds (lib/spotlight/embeds.ts)
  // reconstruct iframe srcs ONLY for these allowlisted players; keep the two lists in sync.
  "frame-src 'self' https://vercel.live https://*.vercel.live https://www.youtube.com https://player.vimeo.com https://open.spotify.com https://w.soundcloud.com",
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

// The faces lib/og/load-nunito.ts opens from disk at RUNTIME: the Nunito pair every share card draws
// with, and LiberationSans-Bold, its same-directory fallback.
//
// ⚠️ NAMED, not `./public/fonts/*.ttf`. That glob also swept in LiberationSans-Regular (410,820
// bytes), which nothing reads from disk — lib/entry-points/flyer-raster.ts fetches its faces over
// HTTP — so every lambda in the app carried it for nothing.
const OG_CARD_FONTS = [
  './public/fonts/Nunito-Bold.ttf',
  './public/fonts/Nunito-Black.ttf',
  './public/fonts/LiberationSans-Bold.ttf',
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
  // before they reach the action — our cover uploaders accept up to 8MB
  // (e.g. uploadCircleCover). Raise the limit so the framework lets those
  // through and the action's own size check is the real gate.
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
    // Client router cache TTLs (docs: 05-config/01-next-config-js/staleTimes.md).
    // Default is { dynamic: 0 } — every back/forward or repeat visit refetches the
    // full RSC payload, re-running the (main) layout's fetch wave. 30s lets the
    // router reuse a just-visited dynamic segment; static keeps the 5-min default.
    staleTimes: { dynamic: 30, static: 300 },
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
    '/**': ['./content/help/**/*'],
    // The share-card fonts, on the routes that rasterise. Belt-and-braces, not the delivery
    // mechanism: load-nunito's reads are literal-pathed, so the tracer already resolves each face
    // into every function that reaches the module. These keys re-state them because an OG card that
    // cannot load a font does not degrade politely — Satori throws on an empty `fonts` array — and
    // `deliverCard` is fail-safe, so the damage would show up as broken previews in someone else's
    // mail client rather than as a red build (DEPLOY-SAFETY rule 6).
    //
    // 🔴 THESE USED TO SIT ON '/**' — 650KB of faces × 482 functions, for the 10 image routes that
    // draw with them. Narrowing here, plus the literal-pathed reads in load-nunito, takes the fonts
    // from 333MB of per-function output to 49MB. Measured against the real .next trace, not estimated.
    //
    // Route keys match with picomatch in `contains` mode (next/dist/build/collect-build-traces.js),
    // against a route string that KEEPS its `app/` prefix — normalizeAppPath only strips groups and a
    // trailing /page|/route. So '/opengraph-image' is a SUBSTRING test, and that is what makes it
    // safe: it catches '/app/opengraph-image-12g5h9' (the help group's card, whose suffix is a build
    // hash nobody can hardcode), '/app/spaces/[slug]/opengraph-image-tt3pwa', and
    // '/app/events/claim/[token]/opengraph-image' alike. Deliberately coarse — it also reaches the
    // seven discover/spotlight cards, which draw with no custom face, for ~4.7MB. Under-matching
    // breaks a card silently; over-matching costs bytes the budget gate prints.
    //
    // ⚠️ The help content above must stay on its own '/**' entry. A duplicate key is a TS error and,
    // worse, the later one silently wins — which would drop the help content and leave "Ask Vera"
    // deflecting every question, the exact failure its own comment warns about.
    '/opengraph-image': OG_CARD_FONTS,
    '/twitter-image': OG_CARD_FONTS,
    // The root card's generator (ADR-1002) is a plain route handler, so neither key above reaches it.
    '/dev/og-root-card': OG_CARD_FONTS,
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
  // 877MB of meditation audio that NO server code ever opens (ADR-1003 follow-up).
  //
  // Three OG modules read `join(process.cwd(), 'public', <variable>)` — the spaces and events share
  // cards and lib/og/claim-card.tsx. Next's tracer cannot resolve a path built inside a function, so
  // it falls back to globbing `public/` wholesale, and the whole folder lands in the 62 functions
  // under those segments: 877MB of `public/tracks`, 686MB of `public/images`, ~1.6GB in total.
  //
  // The mp3s are the safe half to cut, and the reason is checkable rather than a judgement call:
  // their ONLY reference anywhere is `lib/on-air.ts:338-340`, which emits the URL STRINGS
  // ('/tracks/forest.mp3') for the browser's audio player to fetch over HTTP. Nothing server-side
  // opens them, so a function that cannot see them behaves identically.
  //
  // ⚠️ EXCLUDES BEAT INCLUDES, and Next matches these route keys with picomatch in `contains` mode
  // (next/dist/build/collect-build-traces.js), so `'/**'` is every route and a negation would match
  // everything too. Only ever list something here that NO route may read from disk.
  //
  // The rest of that 1.6GB needs the tracer to stop globbing at source — turning the three variable
  // reads into literal-pathed ones — which is a code change, not a config line. Tracked in ADR-1003.
  //
  // ── The HEIC decoder (ADR-1002 follow-up, docs/DEPLOY-SAFETY.md rule 2) ──────────────────────
  //
  // `heic2any` is libheif compiled to wasm. It converts an iPhone photo to JPEG IN THE BROWSER,
  // before the upload starts, and it is physically incapable of running anywhere else: it needs the
  // File the person just picked. It was nonetheless in 381 serverless functions, measured at
  // 1.29MB x 381 = 491MB — the fourth-largest line in the build.
  //
  // WHY, and why no source-level fix reaches it. lib/library/image-shrink.ts is imported by two
  // dozen uploaders spread across the app; Next server-renders every one of those client
  // components; and @vercel/nft reads the `import('heic2any')` specifier out of the emitted SSR
  // chunk whether or not that branch can execute there. The tricks that look like fixes are not:
  // `turbopackIgnore` changes nothing (nft reads the specifier anyway) and a computed specifier
  // only breaks the bundle, because Turbopack resolves dynamic imports at build time. The
  // MAP pattern (`next/dynamic({ ssr:false })`, which really does keep maplibre out of the server
  // trace) needs a component; this is a plain async function called from an upload handler.
  //
  // So the boundary is a module — lib/library/heic-decode.ts, the one place allowed to name
  // heic2any — and the trace is corrected here. Safe for the same reason `public/tracks/**` is: no
  // server code path can reach it, so a function that cannot see the chunk behaves identically.
  //
  // ⚠️ KEYED ON THE CHUNK NAME, and deliberately narrow: `*heic2any*` matches only chunks Turbopack
  // named after that package, never a shared one. Excludes are applied with picomatch over the
  // already-collected trace (next/dist/build/collect-build-traces.js), NOT by globbing the disk, so
  // this cannot repeat the Rust panic a broad `@img/**/*` glob caused — but keep it narrow anyway.
  //
  // ⚠️ AN EXCLUDE THAT STOPS MATCHING IS SILENT (rule 6). If Turbopack ever renames the chunk, this
  // line quietly does nothing and 491MB comes back with a green board. `scripts/build-fanout.test.ts`
  // is the thing that notices: it fails when any traced file matches /heic2any/i.
  outputFileTracingExcludes: {
    '/**': ['./public/tracks/**', './.next/server/chunks/**/*heic2any*'],
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
      // The Dispatches help article was the LAST member-visible URL still carrying the retired
      // noun (SCAN-204). Its body has said "Dispatches" since the rename; only the slug lagged,
      // and ADR-1020's own reasoning for /broadcast -> /nearby ("a URL is not internal") applies
      // here unchanged, so content/help/sharing/broadcasts.md is now dispatches.md.
      //
      // Permanent (308), same as /broadcast: the noun is retired, not under review, so the new
      // slug is final — and the old URL is genuinely in the wild. It is linked from support
      // replies, and a production sweep for the /broadcast rename found a `help_chunks` row
      // holding this exact path as text (noted in lib/layout/editable-content.ts, where it was
      // correctly ruled a false positive for THAT rename — it is a true positive for this one).
      // Rows and sent mail cannot be rewritten; the 308 is what keeps them landing.
      //
      // Shadows nothing: the source file is renamed, so /help/sharing/broadcasts no longer
      // resolves through the filesystem router at all.
      {
        source: '/help/sharing/broadcasts',
        destination: '/help/sharing/dispatches',
        permanent: true,
      },
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
      // /broadcast -> /nearby (ADR-1020). "Broadcast" was retired from member copy long ago
      // (NAMING.md §Dispatch) and the route was its last member-reachable survivor. The visible
      // label did not change: it was, and stays, "Around You".
      //
      // Permanent (308) is REQUIRED here, not cosmetic. Three classes of link already point at
      // the old URL and cannot be rewritten: notification emails that have already been sent,
      // member bookmarks, and one live operator menu_items row. The 308 also preserves the
      // request method, which a 301 would not. Query strings ride through automatically, so the
      // compose deep link (/broadcast?compose=true&scope=<id>) lands correctly too.
      //
      // The :path* pair covers the [id] Dispatch detail page. It also matches zero segments, but
      // the bare rule stays explicit to read like the retired routes above.
      { source: '/broadcast', destination: '/nearby', permanent: true },
      { source: '/broadcast/:path*', destination: '/nearby/:path*', permanent: true },
      // Funnels rename (ADR-1090): the sign-up feature is Funnels and its routes moved to /join.
      // Old links are IN THE WILD and cannot be rewritten — QR codes on posters, shared splash
      // links, and CTAs in sent emails all point at /beta/<slug> and /onboarding/beta — so all
      // three moves are permanent (308). Query strings ride through automatically, which is
      // load-bearing here: /onboarding/beta?seq=<slug>&persona=… must land on /join with the
      // same params or the audience funnel and persona pick are silently dropped.
      //
      // /beta itself (the "Join the Beta" marketing page) is NOT redirected — the beta program
      // is still real and that page still serves it. Only the per-audience splash slugs moved,
      // and the route they lived on (app/(marketing)/beta/[slug]) is deleted, so this rule
      // shadows nothing (the funnel-redirects guard would catch it if it did).
      { source: '/beta/:slug', destination: '/join/:slug', permanent: true },
      { source: '/onboarding/beta', destination: '/join', permanent: true },
      { source: '/onboarding/beta/:path*', destination: '/join/:path*', permanent: true },
      // Circles C3.3 (ADR-1091, LIVE-059): Space Communities is removed and a Space's community
      // is its Circles, which live on the Space's own page. The old Community tab URL carries to
      // the Space root. Permanent (308): the URL resolves for all 20 live Spaces, carries its own
      // canonical, and old notification emails already sent cannot be rewritten, so bookmarks and
      // indexed links should transfer their signals for good. Query strings ride through
      // automatically, same as the Funnels rules above.
      //
      // C3.3 shipped BEFORE C3.4 deleted app/(main)/spaces/[slug]/(profile)/community/page.tsx,
      // never with it, so there was no window where the URL 404d: while the route still existed,
      // this rule shadowed it, because redirects are checked before the filesystem router
      // (node_modules/next/dist/docs/.../next-config-js/redirects.md: "Redirects are checked
      // before the filesystem which includes pages and /public files" — the same mechanism
      // lib/marketing/funnel-redirects.test.ts guards against when it is unintended). Since C3.4
      // the rule shadows nothing; it is the only thing keeping the old URL alive. No :path* pair:
      // the community segment had no nested routes, and proxy.ts carries no carve-out for it.
      //
      // RE-POINTED 2026-08-21 (ADR-1094). The destination was the Space ROOT because in C3.3 there was
      // no circles surface to send anyone to; there is one now, and it is the page this URL always
      // meant. Still 308: the same bookmarks and the same already-sent notification emails, now
      // landing on the list of circles instead of one scroll away from a teaser.
      { source: '/spaces/:slug/community', destination: '/spaces/:slug/circles', permanent: true },
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
