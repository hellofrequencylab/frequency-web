// THE SPACE MANAGE HUB sections (ADR-785). The /manage console is a category-navigated control hub: four
// member-facing CATEGORIES an operator browses (like the Classifieds category menu), plus a header-level
// Profile & Settings surface. This is a PURE grouping over the ONE module catalog (SPACE_MODULES) — NOT a
// parallel module list (MENU-CONTRACT/ADR-553 stays intact; `check:menu` only bans a `*_MODULES` catalog,
// and this declares none). Framework-free (data only), so it is trivially unit-testable.
//
// The four categories, in order (Resonance leads — the hub opens on it):
//   • Resonance — the space's people + communication: CRM (pipeline/contacts/cockpit), the space Inbox,
//     lead capture, and connections. "Manage members, connections, and communication."
//   • Marketing — reach + growth: Email (compose/design/style), QR codes + scans, automation/drip.
//   • Offerings & Money — everything the space sells: booking, memberships, donations, enrollment,
//     tickets, check-in, and the Shop.
//   • Content & Programs — what the space teaches + hosts: Practices, Journeys, Airwaves.
//
// Profile & Settings is NOT a category tab — it is the header-level settings surface (identity/brand/
// visibility + Team + Reviews + Plan & usage + Mode + Danger). The "Page" layout module is removed from the
// hub entirely (page editing lives on the admin rail now).

import { SPACE_MODULES, type SpaceModule } from './space-modules'
import { panelHrefForModule } from '@/lib/spaces/surface-hrefs'

/** A hub tab id. `settings` is the Profile & Settings tab (identity, team, reviews, plan & billing, danger). */
export type SpaceHubSection = 'resonance' | 'marketing' | 'offerings' | 'programs' | 'settings'

/** The hub tabs, in display order. Resonance leads (the default landing); Profile & Settings trails — it is
 *  a real tab now (ADR-788), NOT a header button, so Plan & Billing + Team + Reviews are one tap away. */
export const SPACE_HUB_SECTIONS: readonly { key: SpaceHubSection; label: string; blurb: string }[] = [
  { key: 'resonance', label: 'Resonance', blurb: 'Your people and every conversation: pipeline, contacts, the inbox, and connections.' },
  { key: 'marketing', label: 'Marketing', blurb: 'Reach and grow: email, QR codes, lead capture, and automation.' },
  { key: 'offerings', label: 'Offerings & Money', blurb: 'Everything your space sells: bookings, memberships, donations, tickets, and the shop.' },
  { key: 'programs', label: 'Content & Programs', blurb: 'What your space teaches and hosts: practices, journeys, and recordings.' },
  { key: 'settings', label: 'Profile & Settings', blurb: 'Your identity and brand, team and roles, reviews, plan and billing, and the danger zone.' },
]

/** The default landing tab (Resonance). */
export const DEFAULT_HUB_SECTION: SpaceHubSection = 'resonance'

/** Narrow an arbitrary `?section=` value to a known hub tab, defaulting to Resonance. PURE. */
export function asHubSection(raw: string | null | undefined): SpaceHubSection {
  return SPACE_HUB_SECTIONS.some((s) => s.key === raw) ? (raw as SpaceHubSection) : DEFAULT_HUB_SECTION
}

/** The module ids that belong to the Profile & Settings tab. Team, Reviews, Plan & Billing, and Danger
 *  join the identity/brand/visibility shell here (owner directive). */
const SETTINGS_MODULE_IDS = new Set<string>([
  'space.basics', // Profile and Settings (identity, brand, page theme, visibility)
  'space.people', // Team and members
  'space.reviews', // Reviews
  'space.billing', // Plan and usage
  'space.danger', // Danger zone
])

/** The module ids REMOVED from the hub entirely (page editing lives on the admin rail now, not the hub). */
const HUB_EXCLUDED_IDS = new Set<string>(['space.layout'])

/**
 * The hub category a module belongs to, or null when it is excluded from the hub (the Page layout module).
 * PURE. Drives which browse category a card renders under, and whether it is a header Profile & Settings row
 * instead of a browse card.
 */
export function sectionForModule(module: SpaceModule): SpaceHubSection | null {
  if (HUB_EXCLUDED_IDS.has(module.id)) return null
  if (SETTINGS_MODULE_IDS.has(module.id)) return 'settings'

  // Resonance — the CRM relationship + capture surfaces (people + communication).
  if (['space.crm', 'space.inbox', 'space.leads', 'space.doors', 'space.shared'].includes(module.id)) return 'resonance'

  // Marketing — outbound reach + growth (email trio, QR + scans, automation/drip).
  if (['space.comms', 'space.marketing', 'space.emailstyle', 'space.reach', 'space.insights', 'space.automation'].includes(module.id)) {
    return 'marketing'
  }

  // Content & Programs — the practitioner content + the space's media libraries (Airwaves + Loom Studio).
  if (['space.practices', 'space.journeys', 'space.airwaves', 'space.loom'].includes(module.id)) return 'programs'

  // Offerings & Money — everything else is a commerce/offering surface (booking, memberships, donations,
  // enrollment, tickets, check-in, shop). Falls through here by elimination.
  return 'offerings'
}

/** Whether a module renders on the header-level Profile & Settings surface (vs a browse category). PURE. */
export function isSettingsModule(module: SpaceModule): boolean {
  return sectionForModule(module) === 'settings'
}

/** The display name for each section (including the header-level Profile & Settings surface). */
export const SPACE_HUB_SECTION_LABEL: Record<SpaceHubSection, string> = {
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
