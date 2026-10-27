// THE FLAT TOKEN SET OF EVERY MEGA THEME (LIVE-1521). Midnight and Designer keep theirs beside their palette
// (MIDNIGHT_SURFACE, DESIGNER_SURFACE); the other themes get theirs here, read from the one palette module each
// website already wears, so a token round is one edit and no surface keeps a copy. The Spotlight presets read
// these values today. Email will read the same literals (a mail client cannot resolve a CSS variable) once the
// pin in spaces/email-colors.test.ts that holds every theme but Midnight on the house palette is rewritten
// (it needs the owner's exact words; see LIVE-1521).
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
import { TEMPLE_ACCENT, TEMPLE_PALETTE as T } from '@/lib/theme/temple'
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

/** Every Mega Theme that owns a flat token set. Frequency does not: the house look is the default. */
export const MEGA_SURFACES: Partial<Record<MegaThemeId, ThemeSurface>> = {
  bold: BOLD,
  wildheart: WILDHEART,
  network: NETWORK,
  temple: TEMPLE,
  midnight: MIDNIGHT_SURFACE,
  designer: DESIGNER_SURFACE,
}
