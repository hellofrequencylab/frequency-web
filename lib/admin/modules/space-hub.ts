// THE SPACE MANAGE HUB sections (ADR-785). The /manage console is a category-navigated control hub: four
// member-facing CATEGORIES an operator browses (like the Classifieds category menu), plus a header-level
// Profile & Settings surface. This is a PURE grouping over the ONE module catalog (SPACE_MODULES) — NOT a
// parallel module list (MENU-CONTRACT/ADR-553 stays intact; `check:menu` only bans a `*_MODULES` catalog,
// and this declares none). Framework-free (data only), so it is trivially unit-testable.
//
// The four categories, in order (Resonance leads — the hub opens on it). Each row DECLARES which one it is
// on, in `SpaceModule.hub` (ADR-1313); this list describes the shape, it does not decide it:
//   • Resonance — the space's people + communication: CRM (pipeline/contacts/cockpit), Conversations,
//     lead capture, connections, and the automation/drip that runs over those contacts.
//   • Marketing — outbound reach + growth: Email (compose/design/style), QR codes + scans.
//   • Offerings & Money — everything the space sells: booking, memberships, donations, Get paid, and the
//     Shop.
//   • Content & Programs — what the space teaches + hosts: Practices, Journeys, Circles, the Program,
//     Airwaves, Loom Studio, the Calendar, and Your reach.
//
// Profile & Settings is NOT a category tab — it is the header-level settings surface (identity/brand/
// visibility + Team + Reviews + Plan & usage + Mode + Danger). The "Page" layout module is removed from the
// hub entirely (page editing lives on the admin rail now).

import { SPACE_MODULES, type SpaceModule, type SpaceHubSection } from './space-modules'
import { panelHrefForModule } from '@/lib/spaces/surface-hrefs'

/** A hub tab id. `dashboard` is the command-center home (ADR-796); `settings` is the Profile & Settings tab
 *  (identity, team, reviews, plan & billing, danger).
 *
 *  The union itself now lives in `space-modules.ts` (ADR-1313), because a catalog row DECLARES its tab and
 *  this module already imports that one, so the type has to sit on the side without the import back. It is
 *  re-exported here so every importer keeps the path it had. */
export type { SpaceHubSection }

/** The hub tabs, in display order. Resonance leads (the default landing); Profile & Settings trails — it is
 *  a real tab now (ADR-788), NOT a header button, so Plan & Billing + Team + Reviews are one tap away. */
export const SPACE_HUB_SECTIONS: readonly { key: SpaceHubSection; label: string; blurb: string }[] = [
  { key: 'dashboard', label: 'Home', blurb: 'Your command center: revenue, members, what needs attention, and the latest activity.' },
  { key: 'resonance', label: 'Resonance', blurb: 'Your people and every conversation: pipeline, contacts, the inbox, and connections.' },
  { key: 'marketing', label: 'Marketing', blurb: 'Reach and grow: email, QR codes, lead capture, and automation.' },
  { key: 'offerings', label: 'Offerings & Money', blurb: 'Everything your space sells: bookings, memberships, donations, tickets, and the shop.' },
  { key: 'programs', label: 'Content & Programs', blurb: 'What your space teaches and hosts: practices, journeys, and recordings.' },
  { key: 'settings', label: 'Profile & Settings', blurb: 'Your identity and brand, team and roles, reviews, plan and billing, and the danger zone.' },
]

/** The default landing tab: the command-center Home (ADR-796). */
export const DEFAULT_HUB_SECTION: SpaceHubSection = 'dashboard'

/** Narrow an arbitrary `?section=` value to a known hub tab, defaulting to the command-center Home
 *  (`DEFAULT_HUB_SECTION`, ADR-796). PURE. */
export function asHubSection(raw: string | null | undefined): SpaceHubSection {
  return SPACE_HUB_SECTIONS.some((s) => s.key === raw) ? (raw as SpaceHubSection) : DEFAULT_HUB_SECTION
}

/**
 * The hub category a module belongs to, or null when it is excluded from the hub. PURE. Drives which browse
 * category a card renders under, and whether it is a header Profile & Settings row instead of a browse card.
 *
 * 🔴 THE TAB IS READ, NEVER GUESSED (ADR-1313). This function was four hard-coded id lists followed by a
 * bare `return 'offerings'`, so every catalog row added after it was written became a money feature unless
 * somebody remembered to edit a list — and three had, while `space.automation` sat in the marketing list
 * with its parent box in Resonance. The tab is a REQUIRED field on the catalog row now (`SpaceModule.hub`),
 * which makes an undeclared row a compile error instead of a silent default. Adding a module means adding
 * one field to its row; it never means editing this function.
 *
 * `'none'` is the declared EXCLUSION: Page (page editing lives on the admin rail, not the hub), the Content
 * box, and the Offerings and money box. The two boxes are excluded for the same reason — the hub's Content &
 * Programs and Offerings & Money TABS *are* those boxes, so a card linking back to the tab you are standing
 * on is a circular row. Their tools still render as cards there, so nothing inside either is lost.
 */
export function sectionForModule(module: SpaceModule): SpaceHubSection | null {
  return module.hub === 'none' ? null : module.hub
}

/** Whether a module renders on the header-level Profile & Settings surface (vs a browse category). PURE. */
export function isSettingsModule(module: SpaceModule): boolean {
  return sectionForModule(module) === 'settings'
}

/** The display name for each section (including the header-level Profile & Settings surface). */
export const SPACE_HUB_SECTION_LABEL: Record<SpaceHubSection, string> = {
  dashboard: 'Home',
  resonance: 'Resonance',
  marketing: 'Marketing',
  offerings: 'Offerings & Money',
  programs: 'Content & Programs',
  settings: 'Profile & Settings',
}

/** Every tool + setting in the hub as a flat search item (label · where it opens · its category), for the
 *  header finder. Built from the ONE catalog; excludes the removed Page module + Danger (not a destination).
 *  PURE. Gating is not applied here — each target self-gates — so the finder can surface anything by name. */
export function hubSearchItems(slug: string): { label: string; href: string; section: string }[] {
  const out: { label: string; href: string; section: string }[] = []
  for (const m of SPACE_MODULES) {
    if (m.id === 'space.danger') continue
    const sec = sectionForModule(m)
    if (!sec) continue
    const href = panelHrefForModule(m, slug)
    if (!href) continue
    out.push({ label: m.label, href, section: SPACE_HUB_SECTION_LABEL[sec] })
  }
  return out
}
