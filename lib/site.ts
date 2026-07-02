import { headerTriggers, marketingFooterLinks } from "@/lib/nav/registry";

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
// the same community surfaces a member uses in-app (Circles / Events / Channels),
// so the public "main menu" and the in-app nav stay in sync. Naming matches the
// in-app rail ("Channels", not "Topics" or "Interests").
export const DISCOVER_NAV: NavLink[] = [
  { label: "Discover", href: "/discover", desc: "Everything happening near you" },
  { label: "Circles", href: "/discover/circles", desc: "Small groups around an interest" },
  { label: "Events", href: "/discover/events", desc: "Gatherings you can show up to" },
  { label: "Journeys", href: "/discover/journeys", desc: "Guided practices for a season" },
  { label: "Channels", href: "/discover/topics", desc: "Browse by what you practice" },
];

// The six PRIMARY marketing pages, in nav order: Home, The Community, The Quest,
// The Lab, Spaces, About. DERIVED from the ONE nav registry (lib/nav) — the public
// header TRIGGER nodes, in order — so this list, the header tabs (PUBLIC_MEGA_NAV),
// and the footer (MARKETING_NAV) all project a single source and cannot drift. Build /
// Practice / Spread were FOLDED into these six (their routes 308-redirect here), and the
// SEO articles (loneliness, friendship-as-an-adult, …) + /help stay off the nav.
// Each trigger node's `href` is its canonical tab landing (the same page these six tabs
// have always pointed at), so the mapping is a straight projection.
export const PRIMARY_NAV: NavLink[] = headerTriggers().map(({ node }) => ({
  label: node.label,
  href: node.href,
}));

// The mission / splash pages — shown as flat tabs beside the Discover dropdown,
// to VISITORS only. These are marketing/educational surfaces (the story, the
// game, the space, the community); they are deliberately NOT shown in-app, so the
// feed nav isn't cluttered with splash.
export const SITE_NAV: NavLink[] = PRIMARY_NAV;

// Members in-app get NO splash tabs — only the shared community core (the Discover
// dropdown). Splash stays on the public site; the left rail owns in-app nav. This
// is what keeps the "main menu" and the "feed menu" in sync, minus splash.
export const SITE_NAV_MEMBER: NavLink[] = PRIMARY_NAV;

// ── The public mega menu (the header nav) ─────────────────────────────────────
// The header is a MEGA MENU: the six primary pages are the top-level triggers, and
// each can open a dropdown of sub-pages. A panel with `items` (one column of
// sub-pages) or `sections` (multi-column) renders as a disclosure trigger; a panel
// with only `href` renders as a plain link. Today Home and The Lab are plain links;
// The Community, The Quest, Spaces, and About open dropdowns. This is the FALLBACK
// for the DB-backed `header` surface (lib/menus): operators edit the LIVE menu in
// /admin/menu, adding pages and categories, and the live seed mirrors this shape.
// Copy carries no em or en dashes.
export type MegaNavItem = { label: string; href: string; desc?: string };
export type MegaNavGroup = { heading?: string; items: MegaNavItem[] };
export type MegaNavFeatured = { title: string; desc: string; href: string; cta?: string };
export type PublicMegaMenu = {
  label: string;
  /** A plain link (no dropdown). Used when the panel has no `items` and no `sections`. */
  href?: string;
  /** A single dropdown column of sub-pages. Renders the trigger as a disclosure. */
  items?: MegaNavItem[];
  /** Multi-column dropdown. Each group is one column (optional heading + items). */
  sections?: MegaNavGroup[];
  featured?: MegaNavFeatured;
};

// The six primaries as mega-menu triggers, in nav order. Home + The Lab are plain
// links; the rest open a dropdown of sub-pages. DERIVED from the ONE nav registry
// (lib/nav → surface:'header' nodes: each parentless trigger + its parented sub-links),
// so this fallback, the DB `header` seed, and the live menu all project a single source
// and cannot drift. A trigger with sub-links becomes a dropdown panel (its `items`); a
// trigger with none stays a plain link carrying its href. Operators grow this in
// /admin/menu (that edits the same registry via the DB override layer).
export const PUBLIC_MEGA_NAV: PublicMegaMenu[] = headerTriggers().map(({ node, items }) =>
  items.length > 0
    ? {
        label: node.label,
        items: items.map((it) => ({
          label: it.label,
          href: it.href,
          ...(it.blurb ? { desc: it.blurb } : {}),
        })),
      }
    : { label: node.label, href: node.href },
);

// Flat list for the marketing footer — DERIVED from the registry's FLAT marketing
// surface:'footer' nodes (the six primary pages, same order), so the footer projects one
// source. (The member sitemap footer is a separate, column-grouped set of footer nodes;
// marketingFooterLinks() scopes this to the parentless marketing pages only.)
export const MARKETING_NAV: NavLink[] = marketingFooterLinks().map((node) => ({
  label: node.label,
  href: node.href,
  ...(node.blurb ? { desc: node.blurb } : {}),
}));

// Primary acquisition CTA. The label is builder-framed ("Start a Circle") to speak
// to the Latent Leader, the reader the whole growth model runs on (CONTENT-VOICE
// §2b/§7b); the quiet secondary ("or just join as a member") is the lighter path
// for the Seeker. The beta is OPEN — clicking the primary opens the beta induction
// SEQUENCE directly (/onboarding/beta). Signed-out visitors get the sequence's
// cinematic welcome with sign-in embedded (app/onboarding/beta/welcome.tsx), not a
// cold sign-in form; after auth the route renders the full induction. The /beta
// marketing + waitlist page (BetaForm → requestBetaAccess) is kept intact for the
// future gated weekly-cohort phase, when AI-driven admission re-introduces the lead
// capture. NOTE: changing BETA_CTA_LABEL re-labels every shared CTA site-wide (nav,
// hero, mid-page, close); page templates that bake the literal into a published DB
// doc need a re-publish to pick it up (see docs/DOCS-PROTOCOL.md + page-editor).
export const BETA_CTA_LABEL = "Start a Circle";
export const BETA_CTA_HREF = "/onboarding/beta";

// The lighter secondary path, paired beside the primary as a quiet text link (never
// a second button). For the Seeker who is not ready to host; routes into the same
// open induction, which branches by intent.
export const BETA_CTA_SECONDARY_LABEL = "or just join as a member";
export const BETA_CTA_SECONDARY_HREF = BETA_CTA_HREF;

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
