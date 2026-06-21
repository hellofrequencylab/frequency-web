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

// Discover dropdown — the live-community explore pages. This is the SHARED CORE:
// the same community surfaces a member uses in-app (Circles / Events / Interests),
// so the public "main menu" and the in-app nav stay in sync. Naming matches the
// in-app rail ("Interests", not "Topics").
export const DISCOVER_NAV: NavLink[] = [
  { label: "Discover", href: "/discover", desc: "Everything happening near you" },
  { label: "Circles", href: "/discover/circles", desc: "Small groups around an interest" },
  { label: "Events", href: "/discover/events", desc: "Gatherings you can show up to" },
  { label: "Journeys", href: "/discover/journeys", desc: "Guided practices for a season" },
  { label: "Interests", href: "/discover/topics", desc: "Browse by what you practice" },
];

// The mission / splash pages — shown as flat tabs beside the Discover dropdown,
// to VISITORS only. These are marketing/educational surfaces (how it works, the
// space, the story, membership); they are deliberately NOT shown in-app, so the
// feed nav isn't cluttered with splash. Demo was merged into How it works.
export const SITE_NAV: NavLink[] = [
  { label: "The Lab", href: "/the-lab" },
  { label: "The Community", href: "/the-community" },
  { label: "The Quest", href: "/the-quest" },
  { label: "About", href: "/about" },
];

// Members in-app get NO splash tabs — only the shared community core (the Discover
// dropdown). Splash stays on the public site; the left rail owns in-app nav. This
// is what keeps the "main menu" and the "feed menu" in sync, minus splash.
export const SITE_NAV_MEMBER: NavLink[] = [
  { label: "The Lab", href: "/the-lab" },
  { label: "The Community", href: "/the-community" },
  { label: "The Quest", href: "/the-quest" },
  { label: "About", href: "/about" },
];

// ── The public mega menu (the best-practice header nav) ───────────────────────
// The header's flat tabs + thin Discover dropdown collapse into a couple of grouped
// MEGA panels: fewer triggers (no overflow), each opening a multi-column panel with a
// one-line description per item. Data-driven so the growing set of public pages is a
// data edit, never a header edit. The shapes mirror MegaMenu's props structurally, so
// this stays a plain (no-React) data module. Copy carries no em or en dashes.
export type MegaNavItem = { label: string; href: string; desc?: string };
export type MegaNavGroup = { heading?: string; items: MegaNavItem[] };
export type MegaNavFeatured = { title: string; desc: string; href: string; cta?: string };
export type PublicMegaMenu = {
  label: string;
  sections: MegaNavGroup[];
  featured?: MegaNavFeatured;
};

export const PUBLIC_MEGA_NAV: PublicMegaMenu[] = [
  {
    label: "Discover",
    sections: [
      {
        heading: "Explore the community",
        items: DISCOVER_NAV,
      },
    ],
    featured: {
      title: "Find your first circle",
      desc: "Tell us what you're into and we'll point you at your people.",
      href: "/discover/circles",
      cta: "Start exploring",
    },
  },
  {
    label: "Explore Frequency",
    sections: [
      {
        heading: "What this is",
        items: [
          { label: "The Lab", href: "/the-lab", desc: "The ideas and research behind Frequency" },
          { label: "The Community", href: "/the-community", desc: "Who's here and how it all works" },
          { label: "The Quest", href: "/the-quest", desc: "The practice game: streaks, zaps, and rewards" },
          { label: "About", href: "/about", desc: "The mission and the people building it" },
        ],
      },
    ],
  },
];

// Flat list for the marketing footer (every public page, no grouping).
export const MARKETING_NAV: NavLink[] = [
  { label: "The Lab", href: "/the-lab" },
  { label: "The Community", href: "/the-community" },
  { label: "The Quest", href: "/the-quest" },
  { label: "Discover", href: "/discover" },
  { label: "Partners", href: "/discover/partners" },
  { label: "About", href: "/about" },
];

// Primary acquisition CTA. The beta is OPEN — clicking "Join the Beta" opens the
// beta induction SEQUENCE directly (/onboarding/beta). Signed-out visitors get the
// sequence's cinematic welcome with sign-in embedded (app/onboarding/beta/welcome.tsx),
// not a cold sign-in form; after auth the route renders the full induction. The /beta
// marketing + waitlist page (BetaForm → requestBetaAccess) is kept intact for the
// future gated weekly-cohort phase, when AI-driven admission re-introduces the lead
// capture.
export const BETA_CTA_LABEL = "Join the Beta";
export const BETA_CTA_HREF = "/onboarding/beta";

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
