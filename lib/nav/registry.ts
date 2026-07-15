// The canonical navigation registry (docs/NAV-SYSTEM-REDESIGN.md §3, §5) — the ONE
// place every destination is declared, and the ONE resolver every surface gates with.
//
// PHASE 1 (strangler-fig, backward-compatible): the registry is BUILT FROM the existing
// composed rail list (lib/nav-areas.ts::NAV_AREAS) so there is a SINGLE underlying source
// of truth and the site renders identically. Each current member rail area — base areas
// AND the vertical-contributed ones (Marketplace, Housing, Makers, Shop) — becomes one
// `mode: 'calm'` NavNode, preserving exact order, label, href, icon (the area key),
// section (as `parent`), and the exact two-axis gate. The Studio (operator) sub-tree
// that folds ADMIN_NAV + ADMIN_GROUPS comes in the NEXT stage; nothing here declares it.
//
// canSee() is the one gate resolver: it UNIONS the trust-ladder floor with the staff
// capability, mirroring lib/nav-areas.ts::meetsAccess + meetsStaff EXACTLY (nav gating
// is a READ-level unlock). Every surface collapses onto this single function.

import { NAV_AREAS, meetsAccess, meetsStaff, type NavArea } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/core/roles'
import { staffCan, type StaffRole, type StaffDomain } from '@/lib/core/staff-roles'
import type { MenuAccess } from '@/lib/menus/types'
import { STUDIO_WORLDS, STUDIO_LEAVES, type StudioWorld, type StudioLeaf } from './studio'
import type { NavNode, NavSurface, NavMode } from './types'

/** Project one existing rail area (calm spine) into its canonical NavNode. The area's
 *  `key` is the node id AND its icon key (AREA_ICONS is keyed by area key), its `section`
 *  becomes the node's `parent` (null section = the headerless home anchor, no parent), and
 *  its two-axis gate (defaultAccess + staffDomain) carries over UNCHANGED. `previewBelowAccess`
 *  areas (the Vault) project as `ghost` so the muted-preview intent survives the move. */
function nodeFromArea(area: NavArea): NavNode {
  return {
    id: area.key,
    label: area.label,
    href: area.href,
    icon: area.key,
    parent: area.section ?? undefined,
    mode: 'calm',
    // Member rail areas are the desktop rail / mobile bar spine, and every visible
    // destination is reachable from ⌘K — so calm spine nodes project onto both.
    surfaces: ['spine', 'palette'],
    // `defaultAccess` is NavAccess ('visitor' | CommunityRole) which is structurally the
    // MenuAccess enum; staffLevel is omitted so canSee defaults to 'read' (== meetsStaff).
    gate: {
      minAccess: area.defaultAccess as MenuAccess,
      ...(area.staffDomain ? { staffDomain: area.staffDomain } : {}),
      ...(area.requiresOperatedSpaces ? { requiresOperatedSpaces: true } : {}),
    },
    ...(area.previewBelowAccess ? { display: 'ghost' as const } : {}),
  }
}

// ── Studio (operator) sub-tree → mode:'studio' nodes (NAV-SYSTEM-REDESIGN §5b) ──────
// The five approved Studio worlds are the top-level (parentless) studio spine nodes; each
// §5b sub-page leaf projects as a studio node whose `parent` is its world's label. The
// two legacy admin catalogs (lib/admin/nav.ts, app/(main)/admin/sections.ts) derive from
// the SAME lib/nav/studio.ts source, so there is one operator IA and no drift.

/** A Studio world (Overview · Community · Growth · Content · Platform) as a top-level
 *  studio spine node — the left-rail category the sub-nav + dashboards hang off. */
function nodeFromWorld(world: StudioWorld): NavNode {
  return {
    id: `studio:${world.key}`,
    label: world.label,
    href: world.href,
    icon: world.icon,
    blurb: world.blurb,
    mode: 'studio',
    // Studio worlds are the operator spine; every operator destination is ⌘K-reachable.
    surfaces: ['spine', 'palette'],
    gate: {
      minAccess: world.min as MenuAccess,
      ...(world.staffDomain ? { staffDomain: world.staffDomain } : {}),
    },
  }
}

/** A Studio leaf that belongs to one of the five §5b worlds → a studio node parented on
 *  that world. Leaves without a `world` are legacy-only (they ride the derived admin
 *  catalogs, not the new five-world spine) and are NOT projected onto the registry. Its
 *  gate carries over UNCHANGED (min + staffDomain + staffLevel). */
function nodeFromLeaf(leaf: StudioLeaf, world: StudioWorld): NavNode {
  return {
    id: `studio:${leaf.id}`,
    label: leaf.worldLabel ?? leaf.label,
    href: leaf.href,
    icon: leaf.icon,
    blurb: leaf.desc,
    parent: world.label,
    mode: 'studio',
    surfaces: ['sub', 'palette'],
    gate: {
      minAccess: leaf.min as MenuAccess,
      ...(leaf.staffDomain ? { staffDomain: leaf.staffDomain } : {}),
      ...(leaf.staffLevel ? { staffLevel: leaf.staffLevel } : {}),
    },
  }
}

/** The Studio sub-tree as registry nodes: each world, immediately followed by its §5b
 *  sub-pages (in world order), so the registry reads top-to-bottom like the rail. */
function studioNodes(): NavNode[] {
  const worldByKey = new Map(STUDIO_WORLDS.map((w) => [w.key, w]))
  const out: NavNode[] = []
  for (const world of STUDIO_WORLDS) {
    out.push(nodeFromWorld(world))
    const leaves = STUDIO_LEAVES
      .filter((l) => l.world === world.key)
      .sort((a, b) => (a.worldOrder ?? 0) - (b.worldOrder ?? 0))
    for (const leaf of leaves) out.push(nodeFromLeaf(leaf, world))
  }
  // Defensive: a leaf naming an unknown world is skipped above (worldByKey guards intent).
  void worldByKey
  return out
}

// ── Marketing surfaces → header / footer / profile nodes (NAV-SYSTEM-REDESIGN §3) ────
// PHASE 5: the three remaining hand-maintained catalogs — the public mega header, the
// marketing footer, and the account (profile) menu — collapse into registry nodes so
// lib/menus/defaults.ts and lib/site.ts both project the ONE source. These are `calm`
// (a visitor context, not a member-rail spine) and do NOT carry `surface:'spine'`, so
// they never appear in the in-app rail — only on their tagged surface (+ palette where
// it makes sense). Order, labels, hrefs, descriptions, icons, and gates are preserved
// EXACTLY; the projections in defaults.ts / site.ts rebuild the old shapes byte-for-byte.

/** The six public marketing pages as `surface:'header'` TRIGGER nodes, in nav order.
 *  A trigger with sub-links (`items`) opens a dropdown — its sub-links are separate
 *  header nodes parented on the trigger's id; a trigger with no sub-links is a plain
 *  link. The trigger `label` is the tab name; `href` is the tab's CANONICAL landing
 *  (== the old PRIMARY_NAV href), carried even on dropdown triggers so PRIMARY_NAV /
 *  SITE_NAV derive from ONE source. `blurb` carries the sub-link description (`desc`).
 *  Visitor-gated (public marketing). Order + copy verbatim from the old PUBLIC_MEGA_NAV
 *  so the mega header renders identically. */
type HeaderTriggerSeed = {
  id: string
  label: string
  href: string
  items?: { label: string; href: string; desc?: string }[]
}

const HEADER_TRIGGER_SEEDS: readonly HeaderTriggerSeed[] = [
  { id: 'home', label: 'Home', href: '/' },
  {
    id: 'the-quest',
    label: 'The Quest',
    href: '/the-quest',
    items: [
      { label: 'The Quest', href: '/the-quest', desc: 'The practice game: streaks, Zaps, and the Vault' },
      { label: 'Journeys', href: '/discover/journeys', desc: 'Guided practices for a season' },
      { label: 'Practices', href: '/discover/practices', desc: 'Browse the practices you can run' },
      { label: 'Channels', href: '/discover/topics', desc: 'Browse by what you practice' },
    ],
  },
  { id: 'the-lab', label: 'The Lab', href: '/the-lab' },
  {
    id: 'about',
    label: 'About',
    href: '/about',
    items: [
      { label: 'What is Frequency', href: '/what-is-frequency', desc: 'The short version: what it is, how it works, why it exists' },
      { label: 'About', href: '/about', desc: 'The mission and the people building it' },
      { label: 'Help center', href: '/help', desc: 'Answers, guides, and support' },
      { label: 'Privacy', href: '/privacy', desc: 'How we handle your data' },
      { label: 'Terms', href: '/terms', desc: 'The rules of the road' },
    ],
  },
] as const

/** Project the header trigger seeds into registry nodes: each trigger, immediately
 *  followed by its sub-links (parented on the trigger id) so the registry reads in nav
 *  order. Pure marketing → `mode:'calm'`, `surface:'header'`, visitor gate. */
function headerNodes(): NavNode[] {
  const out: NavNode[] = []
  for (const t of HEADER_TRIGGER_SEEDS) {
    out.push({
      id: `header:${t.id}`,
      label: t.label,
      href: t.href,
      icon: 'globe',
      mode: 'calm',
      surfaces: ['header'],
      gate: { minAccess: 'visitor' },
    })
    for (const [i, it] of (t.items ?? []).entries()) {
      out.push({
        id: `header:${t.id}:${i}`,
        label: it.label,
        href: it.href,
        icon: 'globe',
        ...(it.desc ? { blurb: it.desc } : {}),
        parent: `header:${t.id}`,
        mode: 'calm',
        surfaces: ['header'],
        gate: { minAccess: 'visitor' },
      })
    }
  }
  return out
}

/** The marketing footer links as parentless `surface:'footer'` nodes — the six primary
 *  pages, in nav order, flat (no grouping). Labels + hrefs verbatim from the old
 *  MARKETING_NAV. These are the FLAT marketing footer (MARKETING_NAV + the DB footer
 *  seed read `marketingFooterNodes()`); the member sitemap footer below is a SEPARATE,
 *  column-grouped set of footer nodes and never appears in that flat list. */
const FOOTER_LINK_SEEDS: readonly { id: string; label: string; href: string }[] = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'the-community', label: 'The Community', href: '/the-community' },
  { id: 'the-quest', label: 'The Quest', href: '/the-quest' },
  { id: 'the-lab', label: 'The Lab', href: '/the-lab' },
  { id: 'spaces', label: 'Spaces', href: '/spaces' },
  { id: 'about', label: 'About', href: '/about' },
] as const

function marketingFooterNodes(): NavNode[] {
  return FOOTER_LINK_SEEDS.map((l) => ({
    id: `footer:${l.id}`,
    label: l.label,
    href: l.href,
    icon: 'globe',
    mode: 'calm' as const,
    surfaces: ['footer'] as NavSurface[],
    gate: { minAccess: 'visitor' as MenuAccess },
  }))
}

// ── Member sitemap footer → column-grouped `surface:'footer'` nodes ──────────────────
// The MEMBER footer (components/layout/member-footer.tsx) is a distinct surface from the
// flat marketing footer above: a rich, multi-column map of the community + wider site,
// rendered on member pages. It projects the SAME registry via its own column-grouped
// footer nodes so its sitemap comes from the one source. A link that mirrors a rail area
// carries that area's `navKey` (so the footer defers to the server access matrix exactly
// like the rail); a keyless link carries its own `gate` (== the old FootLink.access +
// staffDomain), gated by canSee. Order here IS the render order; each node's `parent` is
// its column title, and a `border-b`/`onClick` bug-report chrome row stays in the renderer
// (it is not a navigable destination, so it is not a registry node). Copy verbatim from the
// old COLUMNS so the member footer renders identically (drop-empty-column preserved).
type MemberFooterSeed = {
  id: string
  label: string
  href: string
  /** NAV_AREA key — the footer defers to the rail's access matrix for this link. */
  navKey?: string
  /** Ladder floor for a keyless link (default 'visitor'). */
  minAccess?: MenuAccess
  /** Staff capability that also unlocks a keyless link (unioned with the ladder). */
  staffDomain?: StaffDomain
}

const MEMBER_FOOTER_COLUMNS: readonly { title: string; links: readonly MemberFooterSeed[] }[] = [
  {
    title: 'Explore',
    links: [
      { id: 'feed', label: 'Feed', href: '/feed', navKey: 'feed' },
      { id: 'circles', label: 'Circles', href: '/circles', navKey: 'circles' },
      { id: 'channels', label: 'Channels', href: '/channels', navKey: 'channels' },
      { id: 'events', label: 'Events', href: '/events', navKey: 'events' },
      { id: 'market', label: 'Classifieds', href: '/classifieds', navKey: 'market' },
      { id: 'housing', label: 'Housing', href: '/marketplace/housing', navKey: 'housing' },
      { id: 'maker', label: 'Market', href: '/market', navKey: 'maker' },
      { id: 'shop', label: 'Frequency Store', href: '/store', navKey: 'shop' },
      { id: 'network', label: 'Community', href: '/network', navKey: 'people' },
    ],
  },
  {
    title: 'The Quest',
    links: [
      { id: 'quest', label: 'Dashboard', href: '/crew', navKey: 'quest' },
      { id: 'journeys', label: 'Journeys', href: '/journeys', navKey: 'journeys' },
      { id: 'practices', label: 'Practices', href: '/practices', navKey: 'practices' },
      { id: 'library', label: 'Library', href: '/library', navKey: 'library' },
      { id: 'leaderboard', label: 'Leaderboard', href: '/crew/leaderboard', minAccess: 'member' },
      { id: 'vault', label: 'The Vault', href: '/crew/store', navKey: 'vault' },
    ],
  },
  {
    title: 'Connect',
    links: [
      { id: 'people', label: 'People', href: '/people', minAccess: 'member' },
      { id: 'partners', label: 'Partners', href: '/partners', minAccess: 'member' },
      { id: 'message-boards', label: 'Message Boards', href: '/messages', navKey: 'messageBoards' },
    ],
  },
  {
    title: 'Support',
    links: [
      { id: 'help', label: 'Help', href: '/help' },
      { id: 'support', label: 'Support', href: '/support', minAccess: 'member' },
    ],
  },
  {
    title: 'Frequency',
    links: [
      { id: 'about', label: 'About', href: '/about' },
      { id: 'the-lab', label: 'The Lab', href: '/the-lab' },
      { id: 'the-community', label: 'The Community', href: '/the-community' },
      { id: 'the-quest', label: 'The Quest', href: '/the-quest' },
      { id: 'pricing', label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { id: 'privacy', label: 'Privacy', href: '/privacy' },
      { id: 'terms', label: 'Terms', href: '/terms' },
    ],
  },
] as const

function memberFooterNodes(): NavNode[] {
  const out: NavNode[] = []
  for (const col of MEMBER_FOOTER_COLUMNS) {
    for (const l of col.links) {
      out.push({
        id: `footer:member:${col.title}:${l.id}`,
        label: l.label,
        href: l.href,
        icon: 'globe',
        parent: col.title,
        mode: 'calm',
        surfaces: ['footer'],
        gate: {
          minAccess: (l.minAccess ?? 'visitor') as MenuAccess,
          ...(l.staffDomain ? { staffDomain: l.staffDomain } : {}),
        },
        ...(l.navKey ? { navKey: l.navKey } : {}),
      })
    }
  }
  return out
}

function footerNodes(): NavNode[] {
  return [...marketingFooterNodes(), ...memberFooterNodes()]
}

/** The account-dropdown links as `surface:'profile'` nodes. Each keeps its EXACT icon
 *  and `minAccess` (visitor / member / crew) from the old hardcoded profileMenu(). Order
 *  verbatim so the account menu renders identically; the renderer adds the Profile /
 *  Invite / theme / Sign-out chrome around this editable list.
 *
 *  Each link carries a `section` (its member-facing group label, NAMING.md governed): the
 *  five sections — You · Membership · Commerce · Community · Support — segment the account
 *  menu into a prioritized, grouped list (docs/MOBILE-NAV-PLAN.md §2). The seed order below
 *  IS both the section order AND the item order within each section, so `profileSections()`
 *  (and the derived `profileMenu()`) read top-to-bottom like the rendered menu. The renderer
 *  frames these editable links with fixed chrome woven into the matching groups — View
 *  profile + Appearance in You, Invite friends in Community, Report a bug in Support — plus
 *  Sign out at the foot. ("Community" over "Connect": the latter collides with the Zap
 *  Connect tile.)
 *
 *  Gated items are HIDDEN unless the viewer qualifies (canSeeMenuItem's role/staff union):
 *  Receive payments + My storefront ride `host` as the earner/seller proxy (the menu viewer
 *  carries no seller/payout capability, so the trust tier is the closest available gate),
 *  My orders is member+, Entry points is crew+. */
type ProfileSectionLabel = 'You' | 'Membership' | 'Commerce' | 'Community' | 'Support'

const PROFILE_LINK_SEEDS: readonly {
  id: string
  label: string
  href: string
  icon: string
  section: ProfileSectionLabel
  minAccess?: MenuAccess
}[] = [
  // You (View profile + Appearance are fixed chrome woven in by the renderer)
  { id: 'settings', label: 'Settings', href: '/settings', icon: 'SlidersHorizontal', section: 'You' },
  { id: 'notifications', label: 'Notifications', href: '/settings/notifications', icon: 'BellRing', section: 'You' },
  // Membership
  { id: 'billing', label: 'Billing & Plans', href: '/settings/billing', icon: 'CreditCard', section: 'Membership' },
  { id: 'payouts', label: 'Receive payments', href: '/settings/billing', icon: 'Banknote', section: 'Membership', minAccess: 'host' },
  // Commerce
  { id: 'orders', label: 'My orders', href: '/orders', icon: 'Receipt', section: 'Commerce', minAccess: 'member' },
  { id: 'storefront', label: 'My storefront', href: '/market/manage', icon: 'Store', section: 'Commerce', minAccess: 'host' },
  // Community (Invite friends is fixed chrome woven in by the renderer)
  { id: 'friends', label: 'Friends', href: '/network/friends', icon: 'UserPlus', section: 'Community' },
  { id: 'codes', label: 'My code', href: '/codes', icon: 'QrCode', section: 'Community' },
  { id: 'entry-points', label: 'Entry points', href: '/entry-points', icon: 'Megaphone', section: 'Community', minAccess: 'crew' },
  // Support (Report a bug is fixed chrome woven in by the renderer)
  { id: 'help', label: 'Help', href: '/help', icon: 'HelpCircle', section: 'Support' },
  { id: 'support', label: 'Support tickets', href: '/support', icon: 'LifeBuoy', section: 'Support' },
] as const

function profileNodes(): NavNode[] {
  return PROFILE_LINK_SEEDS.map((l) => ({
    id: `profile:${l.id}`,
    label: l.label,
    href: l.href,
    icon: l.icon,
    // The section label is the node's `parent`, so the account menu segments the SAME
    // way every other grouped surface does (childrenOf / the /admin/menu editor).
    parent: l.section,
    mode: 'calm' as const,
    surfaces: ['profile'] as NavSurface[],
    gate: { minAccess: (l.minAccess ?? 'visitor') as MenuAccess },
  }))
}

/** THE canonical registry: every current member rail destination as a calm-mode node
 *  (exact composed order: base spine + vertical placements), then the five-world Studio
 *  sub-tree as studio-mode nodes, then the marketing header / footer / profile surface
 *  nodes. Computed once at module load, like NAV_AREAS. */
export const NAV_REGISTRY: readonly NavNode[] = [
  ...NAV_AREAS.map(nodeFromArea),
  ...studioNodes(),
  ...headerNodes(),
  ...footerNodes(),
  ...profileNodes(),
]

/** The one viewer identity every surface gates against — the two axes (ADR-208): the
 *  community trust ladder (`role`) + the coarse/fine staff axis (`webRole` reserved for
 *  the Studio stage; `staffRole` is the capability axis meetsStaff reads). `webRole` is
 *  accepted now so callers keep a stable shape as the Studio nodes land. */
export type NavViewer = {
  role: CommunityRole | null
  /** The coarse web_role floor (reserved for Studio nodes; unused by calm gating today). */
  webRole?: 'none' | 'admin' | 'janitor' | null
  staffRole: StaffRole | null
  /** Does the viewer own/run at least one Space? Honored by a node that opts into
   *  gate.requiresOperatedSpaces (the operator "My Spaces" entry). Absent = treated as false. */
  operatesSpaces?: boolean
}

/**
 * THE gate resolver (NAV-SYSTEM-REDESIGN §3). A node shows if EITHER the trust-ladder
 * floor admits the viewer OR the staff capability grants the node's domain — the exact
 * union lib/nav-areas.ts applies (meetsAccess ∪ meetsStaff). Read-level is enough to
 * SURFACE nav (a leaf still gates its own writes); `staffLevel` (default 'read') lets a
 * future node demand write. Moving where a gate lives, never what it permits.
 */
export function canSee(node: NavNode, viewer: NavViewer): boolean {
  // DATA predicate first, as a hard veto: a node that requires an operated Space is hidden for a
  // viewer who runs none, before the role/staff axes below can reveal it.
  if (node.gate.requiresOperatedSpaces && viewer.operatesSpaces !== true) return false
  const floor = meetsAccess(node.gate.minAccess, viewer.role)
  const staff = meetsStaff(
    { staffDomain: node.gate.staffDomain },
    viewer.staffRole,
  )
  // meetsStaff checks 'read'; nav surfacing is read-level, matching nav-areas exactly.
  // A node that opts into staffLevel:'write' is stricter — honor it at write level. No
  // calm node uses this today; it keeps the resolver honest for future Studio nodes.
  if (node.gate.staffLevel === 'write' && node.gate.staffDomain) {
    return floor || (viewer.staffRole != null && staffCan(viewer.staffRole, node.gate.staffDomain, 'write'))
  }
  return floor || staff
}

// ── Projection helpers (§3: every surface is a filtered projection) ──────────────────

/** Nodes that project onto `surface`, in registry order. */
export function nodesForSurface(surface: NavSurface): NavNode[] {
  return NAV_REGISTRY.filter((n) => n.surfaces.includes(surface))
}

/** Direct children of a `parent` (section label), in registry order. A null/undefined
 *  parent returns the headerless home-anchor nodes (section-less spine). */
export function childrenOf(parent: string | null | undefined): NavNode[] {
  const key = parent ?? undefined
  return NAV_REGISTRY.filter((n) => n.parent === key)
}

// ── Palette projection (§5: the ⌘K cross-mode power-nav) ─────────────────────────────
// The command palette spans EVERY destination the viewer can reach, across BOTH spines
// (Calm + Studio), so an operator can jump straight to a Studio surface from a Calm page
// without a mode switch. It is the one `surface:'palette'` projection — the same registry,
// the same canSee gate every other surface uses — never a second, hand-maintained page
// list. Marketing header/footer/profile nodes are a visitor context (not palette-tagged),
// so they stay out of the in-app power-nav by construction.

/** One palette destination: a registry node flattened to what the ⌘K row renders. */
export type PaletteDestination = {
  /** The registry node id (stable key). */
  id: string
  label: string
  href: string
  /** Icon NAME (railIconFor resolves it to a lucide component). */
  icon: string
  /** Which spine it lives on — lets the palette badge a Studio jump from a Calm page. */
  mode: NavMode
  /** Section label (its `parent`), shown as the row subtitle. */
  group?: string
}

/** Every `surface:'palette'` node the viewer can see (canSee), across Calm AND Studio,
 *  optionally filtered + RANKED against `query` (startsWith on label beats a contains
 *  match — the exact order the admin command bar uses). Deduped by href so a destination
 *  is never listed twice. With no query, returns the full visible set in registry order
 *  (the palette's own idle "jump to" list). Client-safe: NAV_REGISTRY + canSee are
 *  framework-free, so the ⌘K overlay projects the registry directly. */
export function paletteDestinations(viewer: NavViewer, query = ''): PaletteDestination[] {
  const seen = new Set<string>()
  const visible: NavNode[] = []
  for (const node of nodesForSurface('palette')) {
    if (seen.has(node.href) || !canSee(node, viewer)) continue
    seen.add(node.href)
    visible.push(node)
  }

  const toDest = (n: NavNode): PaletteDestination => ({
    id: n.id,
    label: n.label,
    href: n.href,
    icon: n.icon,
    mode: n.mode,
    ...(n.parent ? { group: n.parent } : {}),
  })

  const t = query.trim().toLowerCase()
  if (!t) return visible.map(toDest)

  const starts: NavNode[] = []
  const contains: NavNode[] = []
  for (const n of visible) {
    const label = n.label.toLowerCase()
    if (label.startsWith(t)) starts.push(n)
    else if (label.includes(t) || (n.parent?.toLowerCase().includes(t) ?? false)) contains.push(n)
  }
  return [...starts, ...contains].map(toDest)
}

// ── Calm mobile spine (§5a: the five thumb-zone worlds + Zap center) ─────────────────
// The mobile tab bar is the five TOP-LEVEL calm worlds (Feed · Community · Events · The
// Quest · Marketplace), flanking the raised Zap center button (an ACTION, declared in the
// shell, not a registry node). The bar reads Menu · Feed · Community · [Zap] · Events · The
// Quest · Marketplace (slots 1-2 sit left of Zap, slots 3-5 right of it). Each spine slot is
// an EXISTING calm registry node — its href, gate, and icon key carry over verbatim (moving
// where the tab is declared, never what it permits); only the rendered TAB label is the §5a
// canon world name, distinct from the node's rail label (e.g. the `quest` rail reads "My
// Quest", the mobile tab reads "The Quest"; the `market` rail reads "Classifieds", the tab
// reads "Marketplace"). Deriving from NAV_REGISTRY keeps the bar in lockstep with the one
// source — no parallel hardcoded list — and gate-filters through the same canSee as every
// surface. Messages left the bar for the header (a badged top-right icon, DM convention);
// its rail/drawer entry is unchanged.

/** One mobile-bar tab: the §5a world name + the calm registry node it projects. */
export type SpineTab = {
  /** The §5a canonical world label rendered under the icon (canon-checked, NAMING.md). */
  label: string
  /** The calm registry node this tab lands on (href · gate · icon key). */
  node: NavNode
}

/** The five calm spine roots, in bar order: their registry node id → the §5a world label
 *  the tab renders. Ids are existing calm nodes (see nav-areas.ts BASE_NAV_AREAS + the
 *  `market` vertical). `market` is the marketplace root the registry exposes (Classifieds
 *  at /classifieds); the tab renders it as "Marketplace". */
const CALM_SPINE_ROOTS: readonly { id: string; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'circles', label: 'Community' },
  { id: 'events', label: 'Events' },
  { id: 'quest', label: 'The Quest' },
  { id: 'market', label: 'Market' },
] as const

/** The five calm mobile-spine tabs (§5a), in bar order, each pairing its §5a world label
 *  with its backing calm registry node. A root whose node is missing from the registry is
 *  skipped (defensive), so the bar can never reference a destination that no longer exists.
 *  The renderer gate-filters each tab's `node` through canSee and centers the Zap action. */
export function calmSpine(): SpineTab[] {
  const byId = new Map(NAV_REGISTRY.filter((n) => n.mode === 'calm').map((n) => [n.id, n]))
  const out: SpineTab[] = []
  for (const root of CALM_SPINE_ROOTS) {
    const node = byId.get(root.id)
    if (node) out.push({ label: root.label, node })
  }
  return out
}

// ── Header projection (§3: the public mega header) ───────────────────────────────────
// The header is a two-level tree: TRIGGER nodes (surface:'header', no parent) each with
// zero-or-more CHILD sub-links (surface:'header', parent = trigger id). This helper hands
// callers that shape so both lib/site.ts (PUBLIC_MEGA_NAV) and lib/menus/defaults.ts
// (headerMenu) rebuild from ONE source without re-walking the flat list.

/** One public header trigger + its dropdown sub-links (empty ⇒ a plain link). */
export type HeaderTrigger = {
  node: NavNode
  /** The dropdown sub-links; empty when the trigger is a plain link. */
  items: NavNode[]
}

/** The public mega header as an ordered list of triggers with their sub-links. Triggers
 *  are the parentless `surface:'header'` nodes, in registry order; each carries its
 *  children (also `surface:'header'`) in registry order. */
export function headerTriggers(): HeaderTrigger[] {
  const header = nodesForSurface('header')
  const triggers = header.filter((n) => !n.parent)
  return triggers.map((node) => ({
    node,
    items: header.filter((n) => n.parent === node.id),
  }))
}

// ── Footer projections (§3) ──────────────────────────────────────────────────────────
// TWO distinct footers share surface:'footer'. The FLAT marketing footer is the six
// parentless primary pages (MARKETING_NAV + the DB footer seed). The MEMBER sitemap
// footer is the column-grouped (parented) nodes rendered on member pages. Splitting on
// `parent` keeps each footer projecting only its own nodes — no cross-contamination.

/** The flat marketing footer links (the six primary pages), in registry order. The
 *  parentless `surface:'footer'` nodes only, so the member sitemap columns never leak
 *  into MARKETING_NAV or the DB footer seed. */
export function marketingFooterLinks(): NavNode[] {
  return nodesForSurface('footer').filter((n) => !n.parent)
}

/** One column of the member sitemap footer: its title + the links under it. */
export type FooterColumn = {
  title: string
  links: NavNode[]
}

/** The member sitemap footer as ordered columns. Columns are the distinct `parent`
 *  labels of the parented `surface:'footer'` nodes, in first-appearance order; each
 *  carries its links in registry order. The renderer gate-filters (canSee / the nav
 *  access matrix) and drops empty columns. */
export function footerColumns(): FooterColumn[] {
  const links = nodesForSurface('footer').filter((n) => n.parent)
  const order: string[] = []
  const byColumn = new Map<string, NavNode[]>()
  for (const node of links) {
    const title = node.parent as string
    if (!byColumn.has(title)) {
      byColumn.set(title, [])
      order.push(title)
    }
    byColumn.get(title)!.push(node)
  }
  return order.map((title) => ({ title, links: byColumn.get(title)! }))
}

// ── Profile projection (§3: the account / user menu, now segmented) ──────────────────
// The account menu is a two-level tree: SECTION labels (each a `parent`) each carrying
// the profile nodes under it. This helper hands callers that shape so lib/menus/defaults.ts
// (profileMenu) rebuilds a category per section from ONE source, and both account surfaces
// (the top-right dropdown + the bottom-left card) read the same grouping.

/** One labeled account-menu section: its label + the profile nodes under it, in order. */
export type ProfileSection = {
  label: string
  nodes: NavNode[]
}

/** The account menu as ordered, labeled sections. Sections are the distinct `parent`
 *  labels of the `surface:'profile'` nodes, in first-appearance (registry) order; each
 *  carries its nodes in registry order. Preserves BOTH the section order AND the item
 *  order within each section. The renderer gate-filters (canSee / canSeeMenuItem). */
export function profileSections(): ProfileSection[] {
  const nodes = nodesForSurface('profile')
  const order: string[] = []
  const bySection = new Map<string, NavNode[]>()
  for (const node of nodes) {
    const label = (node.parent ?? '') as string
    if (!bySection.has(label)) {
      bySection.set(label, [])
      order.push(label)
    }
    bySection.get(label)!.push(node)
  }
  return order.map((label) => ({ label, nodes: bySection.get(label)! }))
}
