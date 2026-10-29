// THE FLAT TOKEN SET OF EVERY MEGA THEME (LIVE-1521). Midnight and Designer keep theirs beside their palette
// (MIDNIGHT_SURFACE, DESIGNER_SURFACE); the other themes get theirs here, read from the one palette module each
// website already wears, so a token round is one edit and no surface keeps a copy. The Spotlight presets read
// these values, and so does email (lib/theme/surface.ts emailSurface; a mail client cannot resolve a CSS
// variable, so it takes the literals). The email-colors pin was rewritten on the owner's words (LIVE-1521).
//
// NOT A PAGE GROUND. lib/theme/surface.ts decides which of these a Space page or event page may wear; today that
// is Midnight's alone (ADR-578, ADR-1906). A theme added here dresses email and Spotlight, and nothing else.
// Frequency (the default) has no entry: the house email palette and the plain Spotlight ARE its look.
//
// PURE: no React, no Supabase.

import type { ThemeSurface } from '@/lib/theme/surface-vars'
import { DESIGNER_SURFACE } from '@/lib/theme/designer'
import { MENSWORK_PALETTE as B } from '@/lib/theme/menswork'
import { MIDNIGHT_SURFACE } from '@/lib/theme/midnight'
import { NETWORK_SCHEMES } from '@/lib/theme/network'
import { NETWORK_KIT_SURFACE } from '@/lib/theme/network-kit'
import { TEMPLE_ACCENT, TEMPLE_PALETTE as T } from '@/lib/theme/temple'
import { TEMPLE_KIT_SURFACE } from '@/lib/theme/temple-kit'
import { FREE_HUMAN_SURFACE } from '@/lib/theme/free-human'
import { WILDHEART_PALETTE as W } from '@/lib/theme/wildheart'
import type { MegaThemeId } from '@/lib/theme/mega-theme'
import { palette } from '@/lib/theme/palette'

const NOTES = { success: palette.emailSuccess, info: palette.emailInfo, danger: palette.danger } as const
const NET = NETWORK_SCHEMES.marigold

/** Bold: charcoal grounds, one teal. Dark, so it reads its semantic notes from Midnight's dark-ground set. */
const BOLD: ThemeSurface = {
  dark: true, canvas: B.charcoal, raised: B.surface, elevated: B.raised, border: B.hairline,
  text: B.primary, muted: B.secondary, subtle: B.muted, solid: B.primary, onSolid: B.charcoal,
  accent: { accent: B.teal, text: B.tealText, on: B.charcoal, bg: B.raised },
  semantic: MIDNIGHT_SURFACE.semantic,
}

/** Wildheart: parchment and ink with one violet. */
const WILDHEART: ThemeSurface = {
  dark: false, canvas: W.parchment, raised: W.vellum, elevated: W.aged, border: W.hairline,
  text: W.ink, muted: W.secondary, subtle: W.muted, solid: W.ink, onSolid: W.vellum,
  accent: { accent: W.violet, text: W.violetText, on: W.vellum, bg: W.mist },
  semantic: NOTES,
}

/** Network: butter-cream and deep ink with the Marigold hero color (the default scheme). */
const NETWORK: ThemeSurface = {
  dark: false, canvas: NET.paper, raised: NET.surface, elevated: NET.fill, border: NET.line,
  text: NET.ink, muted: NET.muted, subtle: NET.subtle, solid: NET.ink, onSolid: NET.surface,
  accent: { accent: NET.accent, text: NET.accentText, on: NET.onAccent, bg: NET.fill },
  semantic: NOTES,
}

/** Temple: plaster and umber with one clay. */
const TEMPLE: ThemeSurface = {
  dark: false, canvas: T.plaster50, raised: T.card, elevated: T.plaster100, border: T.plaster300,
  text: T.umber900, muted: T.umber600, subtle: TEMPLE_ACCENT.mutedText, solid: T.umber900, onSolid: T.plaster50,
  accent: { accent: TEMPLE_ACCENT.accent, text: TEMPLE_ACCENT.text, on: TEMPLE_ACCENT.on, bg: T.clay100 },
  semantic: { success: T.olive600, info: T.aegean600, danger: T.danger },
}

/** Temple Kit: the kit's flat token set, with the solid button's label in plain white. The design's #FFF6EE on clay 500 is
 *  4.27:1, under the AA bar every surface here is held to (mega-surfaces.test.ts), and a mail client cannot adjust it.
 *  White is 4.56:1, the label the earlier Temple surface wears. The website keeps the design's value (pinned in
 *  temple-kit.test.ts) until the owner rules; this is the one place the kit's surfaces differ from the design. */
const TEMPLE_KIT: ThemeSurface = { ...TEMPLE_KIT_SURFACE, onSolid: '#FFFFFF' }

/** Every Mega Theme that owns a flat token set. Frequency does not: the house look is the default. */
export const MEGA_SURFACES: Partial<Record<MegaThemeId, ThemeSurface>> = {
  bold: BOLD,
  wildheart: WILDHEART,
  network: NETWORK,
  'network-kit': NETWORK_KIT_SURFACE,
  temple: TEMPLE,
  'temple-kit': TEMPLE_KIT,
  midnight: MIDNIGHT_SURFACE,
  designer: DESIGNER_SURFACE,
  'free-human': FREE_HUMAN_SURFACE,
}
