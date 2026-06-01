// Canonical site URL. Override per-environment with NEXT_PUBLIC_SITE_URL
// (set it once a custom domain is live); falls back to the Vercel deployment.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://frequency-web-three.vercel.app";

export const SITE_NAME = "Frequency";
export const SITE_TAGLINE = "A place to be human";
export const SITE_DESCRIPTION =
  "Frequency connects neighborhoods into real-world community. Join local circles, show up for events near you, and build lasting friendships with people who live close by.";

// ── Public marketing chrome ───────────────────────────────────────────────────
// Top-nav items shown on the public site (SiteHeader) + marketing footer.
// Keep these resolving — every href is a live route.
export const MARKETING_NAV: { label: string; href: string }[] = [
  { label: "The Lab", href: "/the-lab" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Discover", href: "/discover" },
  { label: "About", href: "/about" },
];

// Primary acquisition CTA — the Beta lead-capture (double opt-in). Open signup
// still lives at /sign-in; this featured path captures leads into the CRM.
export const BETA_CTA_LABEL = "Join the Beta";
export const BETA_CTA_HREF = "/beta";

// Org footer line. Donations / 501(c)(3) framework deferred — no fundraising
// language on the public site yet (see frequency-site-plan + org-status spec).
export const ORG_LEGAL_NAME = "Frequency Labs Holdings";
export const CONTACT_EMAIL = "hello@frequencylocal.com";
