import type { CSSProperties } from 'react'
import { ROLES, roleOfType, type RoleId } from '@/lib/blocks/roles/roles'
import { websiteThemeVars } from '@/lib/sites/editor/theme'
import { siteCanvasVars } from '@/lib/sites/site-render-style'
import { SPACE_THEME_FONT_VARS, type SpaceThemeId } from '@/lib/theme/space-themes'
import type { Config, Data } from '@/lib/page-editor/types'

// SURFACE PARITY (BLD-215; spec docs/EDITOR-NEXT.md#bld-215, audit docs/design/frequency-builder-v3/v3-review-and-needs.md
// "Profile: render the 21 roles in the Frequency frame, no site theme" and "Spotlight: doors generated from the roles a
// Space has on"). Two pure readings of one document for the surfaces the builder shows beside the site and the email:
//   • THE PROFILE FRAME. The Space page inside Frequency wears the Space's own font set and accent and nothing else
//     (the theme fence, app/(main)/no-site-theme-in-member-area.test.ts): no site skin, no theme dial, no --nw-* token.
//     That is exactly the unskinned branch of siteCanvasVars, so the profile reads the same resolver with `skinned` off
//     and the editor's Frequency id (DAWN) as its theme. One resolver, so the profile the owner sees is the Space page.
//   • THE SPOTLIGHT DOORS. A Spotlight page is one column of doors; every role declares itself a door there
//     (role.json surfaces.spotlight, pinned by lib/blocks/roles/surfaces.test.ts). A door carries the role's glyph and
//     intent and the section's own heading, and opens the full section on the site. A block with no role has no door:
//     the surface switcher lists it as site-only (lib/builder/surfaces.ts).
// PURE: no React, no reads.

/** The site render the profile is derived from: the fields siteCanvasVars reads. */
type ProfileSource = Parameters<typeof siteCanvasVars>[0]

export interface ProfileFrame {
  /** The editor theme id the canvas wears: always Frequency's (DAWN). */
  theme: 'DAWN'
  /** The Space's font set (`data-space-theme`), or undefined when no style is stored. */
  fonts: SpaceThemeId | undefined
  /** The canvas variables: the house sheets, the Space's fonts and accent. Never a site skin. */
  vars: CSSProperties
}

/** The profile surface's frame for a page: the Space page's own resolver with the site skin switched off. With no
 *  stored style, the house theme with the brand accent. */
export function profileFrame(render: ProfileSource | null | undefined, accent: string | null | undefined, date = new Date()): ProfileFrame {
  // A font set the Space themes do not know (a stale or foreign id) falls back to the house theme rather than throwing.
  if (!render || !(render.fonts in SPACE_THEME_FONT_VARS)) return { theme: 'DAWN', fonts: undefined, vars: websiteThemeVars('DAWN', render?.accent ?? accent ?? null, date) }
  return { theme: 'DAWN', fonts: render.fonts, vars: siteCanvasVars({ ...render, skinned: false, editorTheme: 'DAWN' }, date) }
}

export interface SpotlightDoor {
  /** The section's id: the door selects it in the builder and anchors it on the site. */
  id: string
  type: string
  role: RoleId
  /** The section's own heading when it has one, else the role's intent ("Say who you are"). */
  title: string
  /** The role's intent, as the door's second line; the block label when the heading already is the intent. */
  meta: string
  /** The role's glyph (FqIcon name; check:roles proves it resolves). */
  icon: (typeof ROLES)[RoleId]['icon']
  /** Where the door opens: the page on the site, at the section. */
  href: string
}

const HEADING_SLOTS = ['title', 'heading', 'headline', 'name', 'eyebrow'] as const

function headingOf(props: Record<string, unknown>): string {
  for (const key of HEADING_SLOTS) {
    const value = props[key]
    if (typeof value === 'string' && value.trim()) return value.replace(/&#39;/g, "'").replace(/[*_]/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return ''
}

const pageHref = (base: string, slug: string) => (slug === 'home' ? base || '/' : `${base}/${slug}`)

/** The Spotlight doors for a page: one per role section, in page order; sections with no role make no door. */
export function spotlightDoors(doc: Data, config: Config, siteBase: string, pageSlug: string): SpotlightDoor[] {
  const doors: SpotlightDoor[] = []
  for (const section of doc.content) {
    const role = roleOfType(section.type)
    if (!role || ROLES[role].surfaces.spotlight !== 'door') continue
    const id = String(section.props?.id ?? '')
    const heading = headingOf((section.props ?? {}) as Record<string, unknown>)
    const def = ROLES[role]
    const label = (config.components as Record<string, { label?: string }>)[section.type]?.label ?? def.label
    doors.push({
      id, type: section.type, role, icon: def.icon,
      title: heading || def.intent,
      meta: heading ? def.intent : label,
      href: `${pageHref(siteBase, pageSlug)}#${id}`,
    })
  }
  return doors
}
