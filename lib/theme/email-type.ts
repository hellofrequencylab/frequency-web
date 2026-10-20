// The design-keyed EMAIL TYPE AND DECOR: the faces, gradients, shadows and wordmark an email document
// sets, as literal strings (ADR-1800). Mail clients read no CSS variable and no next/font class, so the
// email shells cannot share lib/theme/design-fonts/* or app/themes/*. Colours stay in lib/theme/palette.ts
// (every value there is one hex); this file holds what is NOT a single hex: font stacks, the pastel action
// gradient, the page wash, the card shadow and the wordmark path. Pure module: no server-only, no React.
//
// Frequency's values are read off the member kit, design_handoff/frequency/templates/members/app/app.css
// (.btn.pa, .card, .soft, .k, .h1, .why) and tokens/themes.css (--pa, --pa-soft, --wash, --pa-glow).
import { SITE_DESIGN, type DesignId } from './design'

interface EmailType {
  /** Headlines, the wordmark, labels and numerals. */
  display: string
  /** Body copy, buttons, meta and the footer. */
  sans: string
  /** The accent face for one italic phrase (a "why" line, a sign-off). */
  serif: string
  /** A stylesheet URL for the web fonts, or null when the design uses system faces only. */
  stylesheet: string | null
  /** Display weight the design sets on titles. */
  displayWeight: number
  /** Letter-spacing on a headline. */
  displayTracking: string
  /** The primary action's fill, as a CSS background value (a gradient on Frequency). The solid fallback
   *  for clients that paint no gradient is palette.emailAction. */
  actionBackground: string
  /** The glow under the primary action, as a box-shadow value, or ''. */
  actionGlow: string
  /** The raised card's shadow, as a box-shadow value, or ''. */
  cardShadow: string
  /** The soft panel's fill (a callout, a note); palette.emailAccentSoft is its solid fallback. */
  softBackground: string
  /** The page wash behind the column, as a background-image value, or ''. */
  wash: string
  /** The wordmark image, as a path under the app origin, with its rendered width. */
  wordmark: { path: string; width: number; height: number }
  /** The STOCK HEROES: five photos of adults at play, each under the blue orb (bottom left) and the purple
   *  orb (top right) with the wordmark set in, as pre-composed images (mail clients paint no overlay
   *  reliably). One is picked at random per dispatch (pickStockHero) and crowns every platform-brand
   *  email; a Space's own logo header replaces it. null when the design has none (the wordmark shows). */
  hero: { paths: readonly string[]; width: number; height: number } | null
}

const SYSTEM = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`

export const EMAIL_TYPES: Record<DesignId, EmailType> = {
  dawn: {
    display: SYSTEM,
    sans: SYSTEM,
    serif: `Georgia,'Times New Roman',serif`,
    stylesheet: null,
    displayWeight: 800,
    displayTracking: '-0.02em',
    actionBackground: '',
    actionGlow: '',
    cardShadow: '',
    softBackground: '',
    wash: '',
    wordmark: { path: '/frequency-wordmark.png', width: 148, height: 20 },
    hero: null,
  },
  frequency: {
    display: `'Unbounded','Hanken Grotesk',Helvetica,Arial,sans-serif`,
    sans: `'Hanken Grotesk',Helvetica,Arial,sans-serif`,
    serif: `'Instrument Serif',Georgia,'Times New Roman',serif`,
    stylesheet:
      'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600&family=Hanken+Grotesk:wght@400;500;600&family=Instrument+Serif:ital@1&display=swap',
    displayWeight: 500,
    displayTracking: '-0.04em',
    // --pa, the pastel iridescent action (tokens/themes.css), ink text on it (.fq-pa).
    actionBackground: 'linear-gradient(120deg,#EEC1EC 0%,#C4B8FF 36%,#A3D4FF 68%,#8FE9FF 100%)', // token-ok: email decor, mirrors --pa: the pastel pill gradient
    actionGlow: '0 12px 28px -14px rgba(120,150,225,.55),inset 0 0 0 1px rgba(255,255,255,.5)', // token-ok: email decor, mirrors --pa-glow
    // .card in the member kit: raised white, soft warm shadow, hairline inset.
    cardShadow: '0 1px 2px rgba(60,40,20,.04),0 22px 50px -36px rgba(80,50,20,.34)', // token-ok: email decor, mirrors .card
    softBackground: 'linear-gradient(120deg,rgba(255,214,186,.24),rgba(238,193,236,.2) 34%,rgba(196,184,255,.2) 66%,rgba(143,233,255,.2))', // token-ok: email decor, mirrors --pa-soft
    wash: 'radial-gradient(60% 50% at 6% 0%,rgba(214,190,250,.24),transparent 70%),radial-gradient(50% 50% at 98% 14%,rgba(143,233,255,.28),transparent 70%),radial-gradient(55% 50% at 70% 100%,rgba(184,162,255,.18),transparent 70%)', // token-ok: email decor, mirrors --wash
    wordmark: { path: '/brand/frequency/frequency-wordmark.png', width: 178, height: 36 },
    // public/brand/frequency/email/hero-*.jpg, 1200x520 served at 600x260 (2x); scripts/email-hero.py
    // rebuilds them from public/brand/frequency/photos (the five picks are listed there).
    hero: { paths: [1, 2, 3, 4, 5].map((n) => `/brand/frequency/email/hero-${n}.jpg`), width: 600, height: 260 },
  },
}

/** The type this deploy's emails set (SITE_DESIGN is read once, at build). */
export const emailType: EmailType = EMAIL_TYPES[SITE_DESIGN]

/** One stock hero path for this dispatch, picked at random so a member's inbox does not repeat one photo,
 *  or by `pick` (a non-negative integer, wrapped) when a render must be reproducible. null without heroes. */
export function pickStockHero(pick?: number): { path: string; width: number; height: number } | null {
  const hero = emailType.hero
  if (!hero || hero.paths.length === 0) return null
  const i = pick === undefined ? Math.floor(Math.random() * hero.paths.length) : Math.abs(Math.trunc(pick)) % hero.paths.length
  return { path: hero.paths[i], width: hero.width, height: hero.height }
}
