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
    ],
  },
};

export default nextConfig;
