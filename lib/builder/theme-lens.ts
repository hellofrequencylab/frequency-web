import { ROLES, roleOfType, roleVariant, type RoleId } from '@/lib/blocks/roles/roles'
import { presentationDefault } from '@/components/sites/presentation'
import { resetDocumentPlacements } from '@/lib/sites/editor/layout'
import { draftDials, draftLook } from '@/lib/sites/editor/theme-drafts'
import type { WebsiteSnapshot, WebsiteTheme } from '@/lib/sites/editor/state'
import { EDITOR_THEME_OF } from '@/lib/sites/site-render-style'
import { foreignBlocksFor } from '@/lib/sites/skin-family'
import { SITE_THEMES, SITE_THEME_DEFS, type SiteStyle, type SiteThemeId } from '@/lib/theme/site-style'
import type { Data } from '@/lib/page-editor/types'

// THE THEME LENS (BLD-303; spec docs/EDITOR-NEXT.md#bld-303, move 06 "themes tried on over real content"). Hovering a
// theme card wears that theme on the canvas: the static theme tokens and `data-website-theme` swap in one React commit
// (the canvas already does this for Try it on, LIVE-1863), the contract skin module is prefetched on hover, and nothing
// asks the server for the document again: the draft in memory is the document. Committing a theme is one edit of the
// draft, so one undo step takes it back. Sections whose layout the owner pinned (`variantSet`, BLD-203) keep it; the
// rest follow the new theme's default for their role (components/sites/presentation). PURE: no React, no I/O.

/** The site theme an editor theme stands for: the inverse of EDITOR_THEME_OF. A retired theme reads as Frequency. */
export function siteThemeOf(theme: WebsiteTheme): SiteThemeId {
  return ((Object.keys(EDITOR_THEME_OF) as SiteThemeId[]).find((id) => EDITOR_THEME_OF[id] === theme) ?? 'frequency')
}

const BLANK_LOOK: SiteStyle['look'] = { corners: null, spacing: null, header: null, footer: null }

/** The style the canvas wears: the draft's theme and global styles over the live style (what visitors see now changes
 *  only on publish), or, while a theme is tried on, that theme with its own fonts and no stored style. */
export function lensStyle(live: SiteStyle, draft: Pick<WebsiteSnapshot, 'theme' | 'look'>, trying: SiteThemeId | null): SiteStyle {
  if (trying) {
    const def = SITE_THEME_DEFS.find((t) => t.id === trying)
    return { ...live, theme: trying, fonts: def?.defaultFonts ?? live.fonts, look: BLANK_LOOK, dials: undefined, pages: undefined }
  }
  const theme = siteThemeOf(draft.theme)
  const same = theme === live.theme
  const own = draftLook(draft.look) as SiteStyle['look'] | undefined
  const dials = draftDials(draft.look) ?? (same ? live.dials : undefined)
  return { ...live, theme, fonts: same ? live.fonts : SITE_THEME_DEFS.find((t) => t.id === theme)?.defaultFonts ?? live.fonts, look: own ?? (same ? live.look : BLANK_LOOK), dials }
}

/** Wear a theme in the draft: one edit, so one undo step. The live site keeps its theme until the draft is published.
 *  Stored styles go back to the theme's own; grid placements, which belong to a theme's columns, are reset; every block
 *  keeps its props, so a pinned layout stays pinned. The same theme returns the same draft object. */
export function commitTheme(draft: WebsiteSnapshot, id: SiteThemeId): WebsiteSnapshot {
  const theme = EDITOR_THEME_OF[id]
  if (theme === draft.theme) return draft
  return { ...draft, theme, look: undefined, pages: draft.pages.map((page) => ({ ...page, doc: resetDocumentPlacements(page.doc) })) }
}

interface ThemeCard {
  id: SiteThemeId
  theme: WebsiteTheme
  label: string
  description: string
  current: boolean
  /** Blocks drawn for another theme-named family: they keep their shape and wear this theme through the contract skin. */
  foreign: number
}

/** Every theme the picker offers, as a card, with the count of legacy blocks this draft would dress through the skin. */
export function themeCards(draft: Pick<WebsiteSnapshot, 'theme' | 'pages'>): ThemeCard[] {
  const docs = draft.pages.map((p) => p.doc)
  return SITE_THEMES.map((t) => ({
    id: t.id, theme: EDITOR_THEME_OF[t.id], label: t.label, description: t.description, current: EDITOR_THEME_OF[t.id] === draft.theme,
    foreign: foreignBlocksFor(docs, t.id).reduce((n, f) => n + f.count, 0),
  }))
}

interface SectionLayout {
  id: string
  role: RoleId
  /** The layout the section draws on this theme. */
  variant: string
  /** The owner picked it (BLD-203), so a theme switch never changes it. */
  pinned: boolean
}

/** The layout every role section draws on a theme: the one rule, roleVariant(), over the owner's pick and the theme's default. */
export function sectionLayouts(doc: Data, theme: WebsiteTheme): SectionLayout[] {
  const out: SectionLayout[] = []
  for (const section of doc.content) {
    const role = roleOfType(section.type)
    if (!role) continue
    const props = (section.props ?? {}) as Record<string, unknown>
    const pinned = props.variantSet === true && typeof props.variant === 'string' && props.variant in ROLES[role].variants
    out.push({ id: String(props.id ?? ''), role, variant: roleVariant(role, pinned ? props.variant : '', presentationDefault(theme, role)), pinned })
  }
  return out
}
