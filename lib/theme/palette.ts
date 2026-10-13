// The design-keyed PALETTE for surfaces that cannot read a CSS variable (ADR-1737).
//
// Every in-app surface switches design through the CSS token cascade (<html data-design>, see
// lib/theme/design.ts). A few surfaces live OUTSIDE that cascade and need literal hex:
//
//   - OG / social cards (Satori renders to a raster; it has no stylesheet)
//   - transactional email HTML (mail clients do not resolve custom properties)
//   - third-party payloads with a literal colour field (the Google Wallet pass)
//
// They read their colours from HERE, so a deploy that sets NEXT_PUBLIC_SITE_DESIGN switches them with
// the rest of the platform instead of staying DAWN. Pure module: no server-only, no React, so a Satori
// route, an email builder and a client-side email preview can all import it.
//
// KEY NAMES. A key that mirrors a CSS token is named after it (`canvas` mirrors --color-canvas,
// `textMuted` mirrors --color-text-muted, `onPrimary` mirrors --color-text-on-primary).
// lib/theme/palette.test.ts holds the DAWN entry to the first `:root` block of app/globals.css for
// every such key, so the two cannot drift. Keys prefixed `email` / `og` / `wallet` have NO CSS token:
// they are the medium's own values (email's warmer cream ground and deep-amber link, the raster cards'
// accent, the wallet pass ground) and are pinned only by that test's hex-shape check.

import { SITE_DESIGN, type DesignId } from './design'

export interface Palette {
  // ── mirrors of app/globals.css :root tokens ───────────────────────────────────────────────
  /** --color-canvas */
  canvas: string
  /** --color-surface */
  surface: string
  /** --color-border */
  border: string
  /** --color-text */
  text: string
  /** --color-text-muted */
  textMuted: string
  /** --color-ink */
  ink: string
  /** --color-ink-elevated */
  inkElevated: string
  /** --color-on-ink */
  onInk: string
  /** --color-primary */
  primary: string
  /** --color-primary-bg */
  primaryBg: string
  /** --color-text-on-primary */
  onPrimary: string
  /** --color-signal (the nonprofit accent on raster cards) */
  signal: string
  /** --color-broadcast (the business accent on raster cards) */
  broadcast: string
  /** --color-danger */
  danger: string

  // ── email-only values (no CSS token) ──────────────────────────────────────────────────────
  /** The email body ground, a warmer cream than --color-canvas. */
  emailCanvas: string
  /** Callout / secondary-button panel inside an email card. */
  emailSurfaceElevated: string
  /** Hairline rules and card borders in email. */
  emailBorder: string
  /** The lifted-charcoal heading ink (Email Studio). */
  emailHeading: string
  /** Footer, eyebrow and meta text. */
  emailSubtle: string
  /** The postal-address line, the faintest text in an email. */
  emailFaint: string
  /** Deep amber: links, the wordmark and section eyebrows. */
  emailPrimaryStrong: string
  /** Email Studio's success block colour. */
  emailSuccess: string
  /** Email Studio's info block colour. */
  emailInfo: string
  /** The cancelled / problem eyebrow in transactional email. */
  emailAlert: string

  // ── raster-card values (no CSS token) ─────────────────────────────────────────────────────
  /** The accent bar and brand mark on the dark-ground OG cards. */
  ogAccent: string
  /** Text on the accent-tinted pill on those cards. */
  ogAccentSoft: string

  // ── third-party payloads ──────────────────────────────────────────────────────────────────
  /** Google Wallet pass `hexBackgroundColor`. */
  walletBackground: string
}

const DAWN: Palette = {
  canvas: '#FAF8F4', // token-ok: palette source, mirrors --color-canvas
  surface: '#FFFFFF', // token-ok: palette source, mirrors --color-surface
  border: '#EAE6DE', // token-ok: palette source, mirrors --color-border
  text: '#3D352A', // token-ok: palette source, mirrors --color-text
  textMuted: '#6B6253', // token-ok: palette source, mirrors --color-text-muted
  ink: '#141210', // token-ok: palette source, mirrors --color-ink
  inkElevated: '#211D17', // token-ok: palette source, mirrors --color-ink-elevated
  onInk: '#F3EEE3', // token-ok: palette source, mirrors --color-on-ink
  primary: '#E2912F', // token-ok: palette source, mirrors --color-primary
  primaryBg: '#FBEFD9', // token-ok: palette source, mirrors --color-primary-bg
  onPrimary: '#FFFFFF', // token-ok: palette source, mirrors --color-text-on-primary
  signal: '#0F8E78', // token-ok: palette source, mirrors --color-signal
  broadcast: '#1EB6C5', // token-ok: palette source, mirrors --color-broadcast
  danger: '#BA3B30', // token-ok: palette source, mirrors --color-danger

  emailCanvas: '#FBF8F1', // token-ok: palette source, email-only
  emailSurfaceElevated: '#FAF6EC', // token-ok: palette source, email-only
  emailBorder: '#E9E1D4', // token-ok: palette source, email-only
  emailHeading: '#4A4234', // token-ok: palette source, email-only
  emailSubtle: '#8F8675', // token-ok: palette source, email-only
  emailFaint: '#A89E8C', // token-ok: palette source, email-only
  emailPrimaryStrong: '#9A5E12', // token-ok: palette source, email-only
  emailSuccess: '#11827A', // token-ok: palette source, email-only (pre-ADR-1317 success)
  emailInfo: '#2F6FB0', // token-ok: palette source, email-only (pre-ADR-1317 info)
  emailAlert: '#b91c1c', // token-ok: palette source, email-only

  // DAWN's raster cards still carry the pre-DAWN events indigo; kept byte-identical here so a
  // Frequency deploy can replace it in one place.
  ogAccent: '#6366f1', // token-ok: palette source, raster cards
  ogAccentSoft: '#c7d2fe', // token-ok: palette source, raster cards

  walletBackground: '#0f172a', // token-ok: palette source, Google Wallet payload
}

export const PALETTES: Record<DesignId, Palette> = {
  dawn: DAWN,
  // A copy of DAWN until the Frequency export lands; its values arrive with app/themes/frequency.css.
  // Frequency's Commons values from the installed export (design_handoff/frequency/tokens, ADR-1740).
  // Email, share cards and the Wallet pass cannot read CSS, so these mirror the --fq- tokens by hand.
  frequency: {
    canvas: '#FBF7F0', // token-ok: palette source, mirrors the Frequency export
    surface: '#FFFFFF', // token-ok: palette source, mirrors the Frequency export
    border: '#E6E1DA', // token-ok: palette source, mirrors the Frequency export
    text: '#38322D', // token-ok: palette source, mirrors the Frequency export
    textMuted: '#675E56', // token-ok: palette source, mirrors the Frequency export
    ink: '#0A0612', // token-ok: palette source, mirrors the Frequency export
    inkElevated: '#140B22', // token-ok: palette source, mirrors the Frequency export
    onInk: '#F6F0FF', // token-ok: palette source, mirrors the Frequency export
    primary: '#5B3FD0', // token-ok: palette source, mirrors the Frequency export
    primaryBg: '#ECE6FF', // token-ok: palette source, mirrors the Frequency export
    onPrimary: '#FFFFFF', // token-ok: palette source, mirrors the Frequency export
    signal: '#17788A', // token-ok: palette source, mirrors the Frequency export
    broadcast: '#B0287F', // token-ok: palette source, mirrors the Frequency export
    danger: '#C2362B', // token-ok: palette source, mirrors the Frequency export
    emailCanvas: '#F3ECE1', // token-ok: palette source, mirrors the Frequency export
    emailSurfaceElevated: '#F3ECE1', // token-ok: palette source, mirrors the Frequency export
    emailBorder: '#E6E1DA', // token-ok: palette source, mirrors the Frequency export
    emailHeading: '#1E1B18', // token-ok: palette source, mirrors the Frequency export
    emailSubtle: '#675E56', // token-ok: palette source, mirrors the Frequency export
    emailFaint: '#8F857B', // token-ok: palette source, mirrors the Frequency export
    emailPrimaryStrong: '#4A31B8', // token-ok: palette source, mirrors the Frequency export
    emailSuccess: '#2F7F5A', // token-ok: palette source, mirrors the Frequency export
    emailInfo: '#2F6F8F', // token-ok: palette source, mirrors the Frequency export
    emailAlert: '#C2362B', // token-ok: palette source, mirrors the Frequency export
    ogAccent: '#8B5CFF', // token-ok: palette source, mirrors the Frequency export
    ogAccentSoft: '#ECE6FF', // token-ok: palette source, mirrors the Frequency export
    walletBackground: '#0A0612', // token-ok: palette source, mirrors the Frequency export
  },
}

/** The palette this deploy wears (SITE_DESIGN is read once, at build). */
export const palette: Palette = PALETTES[SITE_DESIGN]
