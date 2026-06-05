import type { NextConfig } from "next";

// Baseline security headers applied to every route. A strict Content-Security-
// Policy is intentionally omitted for now: the inline theme script and JSON-LD
// need nonces first (tracked on the hardening backlog). X-Frame-Options is
// SAMEORIGIN (not DENY) so the Puck editor's same-origin preview iframe keeps
// working while cross-origin clickjacking is still blocked.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Map uses the Geolocation API; camera/microphone are never used.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
]

const nextConfig: NextConfig = {
  // Keep the wasm rasterizer (styled QR PNG export, lib/qr/raster.ts) external so the
  // bundler doesn't try to bundle its .wasm — it's loaded from node_modules at runtime.
  serverExternalPackages: ['@resvg/resvg-wasm'],
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
    '/admin/ai': ['./content/help/**/*'],
    '/**': ['./content/help/**/*'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
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

export default nextConfig;
