// The admin IA — the grouped catalog of every admin surface, the role each one needs,
// and where it lives. The admin nav (sub-nav.tsx), the domain dashboards
// (programs/operations/growth), the Home overview (page.tsx), and the in-context console
// (admin-console.tsx) all render from this, so a feature is declared in exactly ONE place
// and can never be orphaned again.
//
// STRANGLER-FIG (NAV-SYSTEM-REDESIGN §5b, §8, phase 2): this catalog is now a THIN
// DERIVATION of the ONE Studio sub-tree (lib/nav/studio.ts). ADMIN_GROUPS is built from
// ADMIN_GROUP_SPECS (the seven dashboard sections, the same seven as the operator console,
// ADR-1746) + STUDIO_LEAVES (the operator destinations, declared ONCE). Every EXPORT SIGNATURE — the AdminGroup /
// AdminLink / DomainKey / AdminDestination types, ADMIN_GROUPS, ADMIN_HOME,
// adminDestinations, canUseLink, canSeeGroup, visibleGroups, visibleLinks, groupLinks,
// groupSections, domainForPath, relatedGroups, pageLabelForPath, backToDomainFor — is
// UNCHANGED, so the six components/admin/* consumers, app/(main)/admin/page.tsx, and
// operator-context.ts keep compiling and rendering identically.
//
// Every link keeps its EXACT current href, icon, and per-link role/staff gate (all now
// sourced from the leaf's StudioLeaf) — only the DECLARATION moved into the registry.

import {
  LayoutDashboard,
  UserPlus,
  CircleDot,
  Radio,
  CalendarDays,
  Megaphone,
  ClipboardList,
  BookOpen,
  Trophy,
  ShieldAlert,
  Building2,
  Network,
  Activity,
  Target,
  Sparkles,
  Telescope,
  PieChart,
  Bot,
  HelpCircle,
  Users,
  Shield,
  QrCode,
  Power,
  FileText,
  BadgeCheck,
  Lightbulb,
  ScrollText,
  LifeBuoy,
  ShoppingBag,
  Map,
  CreditCard,
  Gamepad2,
  SlidersHorizontal,
  TrendingUp,
  Rocket,
  Layers,
  Contact,
  Briefcase,
  Menu,
  GraduationCap,
  ToggleRight,
  Share2,
  Palette,
  LayoutPanelLeft,
  Workflow,
  Sprout,
  MessageSquare,
  LayoutGrid,
  Images,
  ClipboardPaste,
  Send,
  Inbox,
  MessagesSquare,
  ListTodo,
  Star,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { atLeastRole, isStaff, isJanitor, type CommunityRole, type WebRole } from '@/lib/core/roles'
import { staffCan, type StaffDomain, type StaffRole, type Access } from '@/lib/core/staff-roles'
import {
  ADMIN_GROUP_SPECS,
  studioLeaf,
  type AdminDomainKey,
  type AdminGroupSpec,
  type AdminGroupLinkRef,
} from '@/lib/nav/studio'

// lucide icon NAME → component. The Studio sub-tree stores icon names (framework-free);
// this catalog resolves them back to the components its consumers render.
const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, UserPlus, CircleDot, Radio, CalendarDays, Megaphone, ClipboardList, BookOpen,
  Trophy, ShieldAlert, Building2, Network, Activity, Target, Sparkles, Telescope, PieChart,
  Bot, HelpCircle, Users, Shield, QrCode, Power, FileText, BadgeCheck, Lightbulb, ScrollText,
  LifeBuoy, ShoppingBag, Map, CreditCard, Gamepad2, SlidersHorizontal, TrendingUp, Rocket,
  Layers, Contact, Briefcase, Menu, GraduationCap, ToggleRight, Share2, Palette,
  LayoutPanelLeft, Workflow, Sprout, Images, ClipboardPaste, Send, Inbox, MessagesSquare, ListTodo, Star,
  MessageSquare, LayoutGrid,
}
function icon(name: string): LucideIcon {
  return ICONS[name] ?? LayoutDashboard
}

export interface AdminLink {
  href: string
  label: string
  /** One-line purpose — shown on the dashboard area card. */
  desc: string
  Icon: LucideIcon
  /** Lowest role that may use this surface. TWO AXES (ADR-208): a community rung
   *  (host/guide/mentor) gates on the trust ladder; 'admin'/'janitor' gate on the
   *  STAFF axis (web_role) — 'admin' admits admin+janitor, 'janitor' admits janitor
   *  only. `linkMeetsMin` below resolves which axis applies. */
  min: CommunityRole
  /** Staff capability domain (ADR-127) that ALSO unlocks this surface — fail-closed:
   *  omit it and the link stays primary-axis-only (sensitive pages do this). */
  staffDomain?: StaffDomain
  /** Capability level the staff domain needs (default 'write'). Read-only surfaces
   *  (Insights) use 'read' so read-only roles (e.g. Analyst) can see them. */
  staffLevel?: Access
  /** Active only on an exact path match (a domain root). */
  exact?: boolean
  /** Titled sub-section a dashboard groups this card under (Operations uses this). */
  section?: string
}

// The operator domains. Each `key` doubles as its dashboard route slug
// ('programs' → /admin/programs). The broad Growth domain is a ROLL-UP whose links point
// into the three operational growth areas below it — Acquisition, CRM, Marketing — and the
// assistant pulls out of Operations into its own Vera AI area. Individual links keep their
// own (often stricter, janitor) gates. Now sourced from lib/nav/studio.ts::ADMIN_GROUP_SPECS.
export type DomainKey = AdminDomainKey

export interface AdminGroup {
  key: DomainKey
  label: string
  /** One-line framing for the domain — its dashboard header + the Home card. */
  blurb: string
  /** Where the domain dashboard lives. */
  href: string
  Icon: LucideIcon
  /** The domain dashboard's primary-axis floor (staff axis still admits per-link). */
  min: CommunityRole
  /** Optional staff capability domain that also clears the dashboard floor. */
  staffDomain?: StaffDomain
  /** Sibling areas worth a cross-link from this one's dashboard (the "Related" strip). */
  related?: readonly DomainKey[]
  /** Whether this domain is a PRIMARY left-nav entry. Sub-workspaces folded into a parent
   *  (Acquisition / CRM / Marketing → the Growth workspace tabs, ADR-264) set this false:
   *  they keep their group object (so the domain switcher + top sub-nav still resolve their
   *  routes) but drop out of the left rail, which lists only primary domains. Default true. */
  primary?: boolean
  links: readonly AdminLink[]
}

/** Resolve one link ref (a leaf id + the console group heading it sits under) into an AdminLink. */
function linkFromRef(ref: AdminGroupLinkRef): AdminLink | null {
  const leaf = studioLeaf(ref.leaf)
  if (!leaf) return null
  const link: AdminLink = { href: leaf.href, label: leaf.label, desc: leaf.desc, Icon: icon(leaf.icon), min: leaf.min }
  if (leaf.staffDomain) link.staffDomain = leaf.staffDomain
  if (leaf.staffLevel) link.staffLevel = leaf.staffLevel
  if (leaf.exact) link.exact = leaf.exact
  if (ref.section) link.section = ref.section
  return link
}

function groupFromSpec(spec: AdminGroupSpec): AdminGroup {
  const g: AdminGroup = {
    key: spec.key,
    label: spec.label,
    blurb: spec.blurb,
    href: spec.href,
    Icon: icon(spec.icon),
    min: spec.min,
    links: spec.links.map(linkFromRef).filter((l): l is AdminLink => !!l),
  }
  if (spec.staffDomain) g.staffDomain = spec.staffDomain
  if (spec.related) g.related = spec.related
  if (spec.primary === false) g.primary = false
  return g
}

export const ADMIN_GROUPS: readonly AdminGroup[] = ADMIN_GROUP_SPECS.map(groupFromSpec)

// ── Home pseudo-entry ─────────────────────────────────────────────────────────
// /admin is the exec dashboard (the Overview section) that fans out to the six others. It is not a
// domain (no area cards of its own), so it lives outside ADMIN_GROUPS but is part of
// the stable top switcher + the rail.

export interface AdminDestination {
  key: string
  label: string
  href: string
  Icon: LucideIcon
  /** Exact-match active rule (Home only). */
  exact?: boolean
}

export const ADMIN_HOME: AdminDestination = {
  key: 'home',
  label: 'Admin Dashboard',
  href: '/admin',
  Icon: LayoutDashboard,
  exact: true,
}

/** The domain sections other than Overview, whose landing IS the Home pseudo-entry (/admin). */
export const ADMIN_DOMAIN_GROUPS: readonly AdminGroup[] = ADMIN_GROUPS.filter((g) => g.href !== ADMIN_HOME.href)

/** The stable top-switcher / rail destinations: Home (the Overview section) + the six other sections. */
export function adminDestinations(): AdminDestination[] {
  return [
    ADMIN_HOME,
    ...ADMIN_DOMAIN_GROUPS.map((g) => ({ key: g.key, label: g.label, href: g.href, Icon: g.Icon })),
  ]
}

// ── Gating ────────────────────────────────────────────────────────────────────

/**
 * Does a link's `min` admit the viewer? TWO AXES (ADR-208): 'admin'/'janitor' read
 * the STAFF axis (web_role) — 'janitor' admits janitor only, 'admin' admits both;
 * every other rung reads the COMMUNITY trust ladder (community_role). Mirrors
 * `meetsMin` in lib/admin/guard.ts so nav visibility matches the page gate exactly.
 */
function linkMeetsMin(min: CommunityRole, role: CommunityRole, webRole: WebRole): boolean {
  if (min === 'janitor') return isJanitor(webRole)
  if (min === 'admin') return isStaff(webRole)
  return atLeastRole(role, min)
}

/** True if a viewer may use a link — its `min` axis (community ladder OR staff axis,
 *  ADR-208) grants it, OR (ADR-127) the team_members staff role holds its `staffDomain`. */
export function canUseLink(
  link: AdminLink,
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): boolean {
  return (
    linkMeetsMin(link.min, role, webRole) ||
    (!!link.staffDomain && staffCan(staffRole, link.staffDomain, link.staffLevel ?? 'write'))
  )
}

/** True if a viewer may enter a domain dashboard (primary-axis floor OR its staff domain). */
export function canSeeGroup(
  group: AdminGroup,
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): boolean {
  return (
    linkMeetsMin(group.min, role, webRole) ||
    (!!group.staffDomain && staffCan(staffRole, group.staffDomain, 'read'))
  )
}

/** The groups (with only the links a viewer may see). Empty groups drop out. */
export function visibleGroups(
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): AdminGroup[] {
  return ADMIN_GROUPS.map((g) => ({
    ...g,
    links: g.links.filter((l) => canUseLink(l, role, webRole, staffRole)),
  })).filter((g) => g.links.length > 0)
}

/** Flat list of links a viewer may see — handy for breadcrumb/title lookups + the
 *  in-context console (admin-console.tsx buckets these by href). */
export function visibleLinks(
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): AdminLink[] {
  return visibleGroups(role, webRole, staffRole).flatMap((g) => g.links)
}

/** The links of one domain a viewer may see, in declaration order (dashboard cards). */
export function groupLinks(
  key: DomainKey,
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): AdminLink[] {
  const g = ADMIN_GROUPS.find((x) => x.key === key)
  if (!g) return []
  return g.links.filter((l) => canUseLink(l, role, webRole, staffRole))
}

/** Operations-style grouping: a domain's role-visible links bucketed by their
 *  `section` (declaration order preserved within and across sections). Links with no
 *  `section` collapse into a single unlabeled bucket. */
export function groupSections(
  key: DomainKey,
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): { section: string; links: AdminLink[] }[] {
  const out: { section: string; links: AdminLink[] }[] = []
  for (const l of groupLinks(key, role, webRole, staffRole)) {
    const s = l.section ?? ''
    const last = out[out.length - 1]
    if (last && last.section === s) last.links.push(l)
    else out.push({ section: s, links: [l] })
  }
  return out
}

// ── Path → domain resolution (drives the stable top switcher's active state) ───

// Every domain-owned href (and external route) → its domain key, built once from
// ADMIN_GROUPS so the switcher highlights the right domain for any /admin/* page AND
// the external routes (/pages, …). Longest hrefs first so the most
// specific prefix wins.
// Overview's own href (/admin) is left out: it would prefix-match every admin path, and /admin itself
// resolves to Home (null) above.
const HREF_TO_DOMAIN: ReadonlyArray<{ href: string; key: DomainKey }> = ADMIN_GROUPS
  .flatMap((g) => g.links.map((l) => ({ href: l.href, key: g.key })))
  .concat(ADMIN_DOMAIN_GROUPS.map((g) => ({ href: g.href, key: g.key })))
  .sort((a, b) => b.href.length - a.href.length)

/** The domain a path belongs to, or null for Home (/admin) and anything unowned. */
export function domainForPath(pathname: string): AdminGroup | null {
  if (pathname === '/admin') return null
  // A group's OWN dashboard always belongs to that group — the Growth roll-up lists the
  // sibling homes (/admin/acquisition, /admin/crm, /admin/marketing) as links, but those
  // paths resolve to their own area, not Growth.
  const own = ADMIN_GROUPS.find((g) => g.href === pathname)
  if (own) return own
  for (const { href, key } of HREF_TO_DOMAIN) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      return ADMIN_GROUPS.find((g) => g.key === key) ?? null
    }
  }
  return null
}

/** The sibling areas worth a cross-link from `key`'s dashboard, filtered to the ones the
 *  viewer can enter (the "Related" strip). */
export function relatedGroups(
  key: DomainKey,
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): AdminGroup[] {
  const g = ADMIN_GROUPS.find((x) => x.key === key)
  if (!g?.related) return []
  return g.related
    .map((k) => ADMIN_GROUPS.find((x) => x.key === k))
    .filter((x): x is AdminGroup => !!x && canSeeGroup(x, role, webRole, staffRole))
}

/** The label of the current page within a domain (the breadcrumb tail), or null
 *  when the path is a domain root / unowned. */
export function pageLabelForPath(pathname: string): string | null {
  let best: { label: string; len: number } | null = null
  for (const g of ADMIN_GROUPS) {
    for (const l of g.links) {
      const match = l.href === pathname || pathname.startsWith(`${l.href}/`)
      if (match && (!best || l.href.length > best.len)) best = { label: l.label, len: l.href.length }
    }
  }
  return best?.label ?? null
}

/** The back-link a sub-page shows to its parent DOMAIN dashboard (or null on a domain
 *  root / unowned path), e.g. a Journeys editor links back to "Content", Funnels back to
 *  "Growth". A ?tab in a section href is stripped before the primary-section lookup. */
export function backToDomainFor(pathname: string): { href: string; label: string } | null {
  if (pathname === '/admin') return null
  const group = domainForPath(pathname)
  if (!group || pathname === group.href) return null
  const baseHref = group.href.split('?')[0]
  const primary = ADMIN_GROUPS.find((g) => g.href === baseHref && g.primary !== false) ?? group
  if (pathname === primary.href) return null
  return { href: primary.href, label: primary.label }
}
