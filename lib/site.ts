// Canonical site URL. Override per-environment with NEXT_PUBLIC_SITE_URL;
// falls back to the production apex so canonical/sitemap/OG stay correct even if
// the env var is missing in a deploy.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://frequencylocal.com";

export const SITE_NAME = "Frequency";
export const SITE_TAGLINE = "A place to be human";
export const SITE_DESCRIPTION =
  "Frequency connects neighborhoods into real-world community. Join local circles, show up for events near you, and build lasting friendships with people who live close by.";

// ── Public marketing chrome ───────────────────────────────────────────────────
// Top-nav items shown on the public site (SiteHeader) + marketing footer.
// Keep these resolving — every href is a live route.
export const MARKETING_NAV: { label: string; href: string }[] = [
  { label: "How it works", href: "/how-it-works" },
  { label: "Demo", href: "/demo" },
  { label: "Pricing", href: "/pricing" },
  { label: "The Lab", href: "/the-lab" },
  { label: "Discover", href: "/discover" },
  { label: "About", href: "/about" },
];

// The public Discover/Explore nav — the "marketing" drill-in (public SEO pages),
// shown in the header bars (in-app top bar + marketing header), NOT the app's
// community sidebar. The sidebar is the in-product drilldown (circles, feed, etc.).
export const DISCOVER_NAV: { label: string; href: string }[] = [
  { label: "Discover", href: "/discover" },
  { label: "Circles", href: "/discover/circles" },
  { label: "Events", href: "/discover/events" },
  { label: "Topics", href: "/discover/topics" },
];

// Primary acquisition CTA — the Beta lead-capture (double opt-in). Open signup
// still lives at /sign-in; this featured path captures leads into the CRM.
export const BETA_CTA_LABEL = "Join the Beta";
export const BETA_CTA_HREF = "/beta";

// Org footer line. Donations / 501(c)(3) framework deferred — no fundraising
// language on the public site yet (see frequency-site-plan + org-status spec).
export const ORG_LEGAL_NAME = "Frequency Labs Holdings";
export const CONTACT_EMAIL = "hello@frequencylocal.com";

// Social-proof floor. Below this many members, public surfaces show qualitative
// "founding" framing instead of raw counts — a brand-new community showing
// "0 members" is actively anti-persuasive (STUDIO-REVIEW P0). Raise once real.
export const SOCIAL_PROOF_FLOOR = 25;
// Where the first community is taking root — used in founding-stage copy.
export const FOUNDING_PLACE = "North County San Diego";
