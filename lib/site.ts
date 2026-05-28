// Canonical site URL. Override per-environment with NEXT_PUBLIC_SITE_URL
// (set it once a custom domain is live); falls back to the Vercel deployment.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://frequency-web-three.vercel.app";

export const SITE_NAME = "Frequency";
export const SITE_TAGLINE = "A place to be human";
export const SITE_DESCRIPTION =
  "Frequency connects neighborhoods into real-world community. Join local circles, show up for events near you, and build lasting friendships with people who live close by.";
