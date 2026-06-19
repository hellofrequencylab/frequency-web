import type { NextConfig } from "next";

// Standalone, embeddable build.
//
// This is Next 16, which differs from older Next in non-obvious ways. Before
// adding real config (iframe embedding headers, YouTube thumbnail image domains,
// route handlers, etc.), read node_modules/next/dist/docs/ for the version's
// actual APIs rather than relying on memory. Real config lands with the build
// section that needs it.
const nextConfig: NextConfig = {};

export default nextConfig;
