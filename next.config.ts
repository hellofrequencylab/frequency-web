import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Serve modern, smaller formats when the browser supports them.
    formats: ["image/avif", "image/webp"],
    // Avatars and post media live in public Supabase Storage buckets, served
    // from `https://<project-ref>.supabase.co/storage/v1/object/public/...`.
    // This is the only remote host `avatar_url` / `media_urls` ever point at
    // (uploads go through the `avatars` and `posts` buckets), so we scope the
    // optimizer to exactly that path to avoid acting as an open image proxy.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  compiler: {
    // Strip console.* from production bundles, but keep error/warn so real
    // problems still surface in the browser console and Vercel logs.
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
};

export default nextConfig;
