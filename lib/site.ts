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

// ── Unified site navigation ───────────────────────────────────────────────────
// One nav, used by every header (the in-app AppShell top bar, the marketing
// header, and the Discover/SiteHeader) via <PrimaryNav>. Two dropdowns:
//   • "Discover" — the live community (Circles / Events / Topics)
//   • "About"    — the mission + site pages (members get a mission-focused subset)
// `desc` powers the subtitle line in the dropdown panels.
export type NavLink = { label: string; href: string; desc?: string }

// Discover dropdown — the live-community explore pages.
export const DISCOVER_NAV: NavLink[] = [
  { label: "Discover", href: "/discover", desc: "Everything happening near you" },
  { label: "Circles", href: "/discover/circles", desc: "Small groups around an interest" },
  { label: "Events", href: "/discover/events", desc: "Gatherings you can show up to" },
  { label: "Topics", href: "/discover/topics", desc: "Browse by what you practice" },
];

// The mission / site pages — shown as flat tabs beside the Discover dropdown.
// Visitors get the full set (including the acquisition pages); members get a
// mission-focused subset, so the nonprofit stays present in the social area
// without pushing Pricing/Demo at them. Designed to grow — Mission / Impact /
// Donate slot straight in here as they ship.
export const SITE_NAV: NavLink[] = [
  { label: "How it works", href: "/how-it-works" },
  { label: "The Lab", href: "/the-lab" },
  { label: "Demo", href: "/demo" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
];

export const SITE_NAV_MEMBER: NavLink[] = [
  { label: "How it works", href: "/how-it-works" },
  { label: "The Lab", href: "/the-lab" },
  { label: "About", href: "/about" },
];

// Flat list for the marketing footer (every public page, no grouping).
export const MARKETING_NAV: NavLink[] = [
  { label: "How it works", href: "/how-it-works" },
  { label: "The Lab", href: "/the-lab" },
  { label: "Demo", href: "/demo" },
  { label: "Pricing", href: "/pricing" },
  { label: "Discover", href: "/discover" },
  { label: "About", href: "/about" },
];

// Primary acquisition CTA. The beta is OPEN — clicking "Join the Beta" drops the
// member straight into passwordless sign-in, which creates the account and routes
// them into the cinematic beta induction (/onboarding/beta). The /beta marketing +
// waitlist page (BetaForm → requestBetaAccess) is kept intact for the future gated
// weekly-cohort phase, when AI-driven admission re-introduces the lead capture.
export const BETA_CTA_LABEL = "Join the Beta";
export const BETA_CTA_HREF = "/sign-in";

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
