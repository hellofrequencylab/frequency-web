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
import frequency from './manifests/frequency.manifest.json'
import bold from './manifests/bold.manifest.json'
import wildheart from './manifests/wildheart.manifest.json'
import networkKit from './manifests/network-kit.manifest.json'
import templeKit from './manifests/temple-kit.manifest.json'
import midnight from './manifests/midnight.manifest.json'
import designer from './manifests/designer.manifest.json'

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

// THE WORDS LIVE IN THE MANIFESTS (LIVE-1866, ADR-1923). Each theme's tagline, "made for", signature and four surface
// lines are the `library` section of lib/themes/manifests/<id>.manifest.json, the one record the catalog, the picker,
// Try it on and the editor all read. Edit them there. This file only says which themes the catalog offers and in what
// order, so a theme with no `library` section (Royal Temple, the older Network, Free Human) is offered nowhere.
const MANIFESTS = { frequency, bold, wildheart, 'network-kit': networkKit, 'temple-kit': templeKit, midnight, designer } as const
const OFFER_ORDER = ['frequency', 'bold', 'wildheart', 'network-kit', 'temple-kit', 'midnight', 'designer'] as const

export const THEME_LIBRARY: readonly ThemeLibraryEntry[] = OFFER_ORDER.map((id) => {
  const words = MANIFESTS[id].library
  return { id, tagline: words.tagline, madeFor: words.madeFor, signature: words.signature, surfaces: words.surfaces as ThemeSurface[] }
})

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

/** Tools a Space can switch on, in plain words. Tools belong to your Space, not your theme, so switching themes never turns one off; a kit starts with two or
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
