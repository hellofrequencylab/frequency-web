// THE THEME LIBRARY CATALOG (ADR-1910). What each Mega Theme is, in the words a visitor reads, and the slots
// its pictures fill. The index (/themes) and every kit page (/themes/[theme]) read this one file, plus
// SITE_THEMES (label, feel) and KIT_INDEX (the niche kits), so neither page can drift from the editor.
//
// HONEST BY CONSTRUCTION. `surfaces` says what a theme dresses TODAY: 'ready' is shipped, 'soon' is not.
// Nothing on a public page may say a surface carries the theme when this file says 'soon'. The survey in
// the project folder (themes/THEME-LIBRARY-SURVEY.md) is the source for the statuses.
//
// THEME FENCE (ADR-1906): a website theme styles Spotlight, the website and email. The Space page wears the
// Space's own font set and accent only and stays the Frequency member portal; this page says so in words.
// PURE data: no React, no Supabase.

import type { MegaThemeId } from '@/lib/theme/mega-theme'

type SurfaceId = 'spotlight' | 'website' | 'email' | 'space'
type SurfaceStatus = 'ready' | 'soon'

interface ThemeSurface {
  id: SurfaceId
  name: string
  status: SurfaceStatus
  /** What the visitor gets, in plain words. */
  carries: string
}

interface ThemeLibraryEntry {
  id: MegaThemeId
  /** One line, 70 characters or less. */
  tagline: string
  /** Who it suits, finishing "Made for ...". */
  madeFor: string
  /** The faces and the one accent, as words. */
  signature: string
  surfaces: ThemeSurface[]
}

const SPACE_SURFACE: ThemeSurface = {
  id: 'space',
  name: 'Space page',
  status: 'ready',
  carries: 'Your fonts, your accent and your offers. It stays the Frequency page people already know.',
}

const surfaces = (spotlight: SurfaceStatus, email: SurfaceStatus): ThemeSurface[] => [
  {
    id: 'spotlight',
    name: 'Spotlight',
    status: spotlight,
    carries: 'Your link-in-bio page in the full look: ground, type, cards and one main button.',
  },
  { id: 'website', name: 'Website', status: 'ready', carries: 'Every page, header, footer and block in the full look, on your own domain.' },
  {
    id: 'email',
    name: 'Email',
    status: email,
    carries: 'Receipts, reminders and newsletters in the same ground, type and button.',
  },
  SPACE_SURFACE,
]

export const THEME_LIBRARY: readonly ThemeLibraryEntry[] = [
  {
    id: 'frequency',
    tagline: 'Warm, bright and easy. The house look.',
    madeFor: 'anyone who wants a friendly site with nothing to fight',
    signature: 'Soft cards, a frosted menu bar, Unbounded headlines and Instrument Serif italics.',
    surfaces: surfaces('soon', 'soon'),
  },
  {
    id: 'bold',
    tagline: 'Dark, graphic and direct. Say it loud.',
    madeFor: 'training, men’s work, fitness and anyone who runs a tough room',
    signature: 'Charcoal ground, one bright accent, angled cuts and heavy uppercase headlines.',
    surfaces: surfaces('soon', 'soon'),
  },
  {
    id: 'wildheart',
    tagline: 'Parchment, violet and a sky that turns with the year.',
    madeFor: 'astrology, ritual, retreats and slow, seasonal work',
    signature: 'Light parchment, violet, petal corners, and a live sky map and year journey.',
    surfaces: surfaces('soon', 'soon'),
  },
  {
    id: 'network-kit',
    tagline: 'Paper, ink and one solid color. Thirteen ways in.',
    madeFor: 'networking groups, clubs, hosts, studios, schools and anyone who brings people together',
    signature: 'Paper, card tint and deep ink, one hero color in four schemes, pill buttons, with Bricolage Grotesque and Outfit.',
    surfaces: surfaces('soon', 'ready'),
  },
  {
    // The Temple Theme Kit, shown as Temple (code id `temple-kit`). The earlier `temple` theme is Royal Temple's: it stays
    // resolvable by id and is offered nowhere. Spotlight and email are both shipped.
    id: 'temple-kit',
    tagline: 'A lime-washed house. Warm and unhurried.',
    madeFor: 'temples, studios, retreats, clubs, markets and anyone who brings people together',
    signature: 'Plaster and umber, one clay color, arches and soft corners, with Marcellus, Jost, Branch and Cormorant.',
    surfaces: surfaces('ready', 'ready'),
  },
  {
    id: 'midnight',
    tagline: 'After dark. One violet light on true black.',
    madeFor: 'guides, teachers and healers who work in the evening',
    signature: 'Deep night grounds, bone type, square frames, with Bodoni Moda, Marcellus and Geist.',
    surfaces: surfaces('ready', 'ready'),
  },
  {
    id: 'designer',
    tagline: 'Limewash and daylight, with one ochre accent.',
    madeFor: 'designers, builders, makers and anyone selling craft',
    signature: 'Plaster grounds, charcoal type, arched photos, with Cormorant and Jost.',
    surfaces: surfaces('ready', 'soon'),
  },
]

/** The path segment a theme's page lives at. Three ids are named differently from their address; each keeps its id,
 *  editor value and every saved site style, and only the address visitors see differs:
 *   · Nocturne is the Midnight theme under its new name (/themes/midnight redirects).
 *   · The Network Theme Kit (`network-kit`) takes /themes/network, the address Daniel named for it
 *     (/themes/network-kit redirects, next.config.ts). The earlier `network` theme has no page: it is not offered.
 *   · The Temple Theme Kit (`temple-kit`) takes /themes/temple (/themes/temple-kit redirects). The earlier `temple`
 *     theme (Royal Temple's) has no page of its own any more. */
const THEME_SLUGS: Readonly<Record<string, string>> = { midnight: 'nocturne', 'network-kit': 'network', 'temple-kit': 'temple' }
export const themeSlug = (id: string): string => THEME_SLUGS[id] ?? id

/** The theme id a /themes/[theme] address stands for (the inverse of themeSlug), or null. */
export function themeIdFromSlug(slug: string): string | null {
  const renamed = Object.entries(THEME_SLUGS).find(([, s]) => s === slug)
  if (renamed) return renamed[0]
  // An id that has a different address (midnight, network-kit, temple-kit) is not reachable under its id.
  return slug in THEME_SLUGS ? null : slug
}

/** The address of a theme's page. */
export const themePagePath = (id: string): string => `/themes/${themeSlug(id)}`

export function themeLibraryEntry(id: string): ThemeLibraryEntry | null {
  return THEME_LIBRARY.find((t) => t.id === id) ?? null
}

/** Tools a Space can switch on, in plain words. Every theme carries all of them; a kit starts with two or
 *  three and the owner turns on the rest. Mirrors the Menu and features switches (lib/spaces/functions.ts). */
export const THEME_TOOLS: readonly { name: string; body: string }[] = [
  { name: 'Booking', body: 'Availability, deposits and reminders from one button.' },
  { name: 'Calendar and gatherings', body: 'What is on, how to join, and who is coming.' },
  { name: 'Memberships', body: 'Plans people can join in a minute, and pause any time.' },
  { name: 'Donations', body: 'A plain way to say yes to the work.' },
  { name: 'Shop', body: 'Sell what you make, with the same look as the rest.' },
  { name: 'Journeys and practices', body: 'Guided paths and routines people come back to.' },
  { name: 'Circles', body: 'A small group that keeps meeting.' },
  { name: 'Reviews', body: 'Kind words, shown where people decide.' },
  { name: 'QR codes', body: 'A door from the real room to your page.' },
  { name: 'Email and contacts', body: 'Your list, your newsletters, your receipts.' },
]

/** The look controls an owner can change on any theme. Labels match SITE_LOOK_OPTIONS. */
export const THEME_LOOK_CONTROLS: readonly { name: string; options: string }[] = [
  { name: 'Corners', options: 'Soft, subtle or square' },
  { name: 'Spacing', options: 'Airy, balanced or compact' },
  { name: 'Header', options: 'Floating pill or full-width bar' },
  { name: 'Footer', options: 'Full or minimal' },
  { name: 'Fonts', options: 'Seven font sets' },
  { name: 'Accent', options: 'Your own brand color' },
]

/** The pictures a theme needs, and their exact sizes. `slot` is the file name under public/themes/<id>/. */
export const THEME_ASSET_SLOTS = [
  { slot: 'kit', label: 'Full kit', size: '2400 x 1800', note: 'Website on a laptop, Spotlight on a phone and an email, in one frame. The index card and the kit page hero.' },
  { slot: 'website', label: 'Website', size: '2000 x 1250', note: 'Home page, desktop, no browser frame.' },
  { slot: 'spotlight', label: 'Spotlight', size: '1170 x 2532', note: 'Phone, no device frame.' },
  { slot: 'email', label: 'Email', size: '1200 x 1800', note: 'A booking confirmation, 600 wide at 2x.' },
  { slot: 'space', label: 'Space page', size: '2000 x 1250', note: 'The Frequency Space page wearing this theme’s fonts and accent.' },
  { slot: 'share', label: 'Share card', size: '1200 x 630', note: 'Link preview for this theme’s page.' },
] as const

export type ThemeAssetSlot = (typeof THEME_ASSET_SLOTS)[number]['slot']

export function themeAssetPath(id: string, slot: ThemeAssetSlot): string {
  return `/themes/${id}/${slot}.webp`
}
