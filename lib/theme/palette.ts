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
  /** Body copy ink in email (Commons text-body); headings use emailHeading. */
  emailBody: string
  /** The primary action's solid fill: the fallback under emailType.actionBackground where no gradient paints. */
  emailAction: string
  /** Text on the primary action. */
  emailActionInk: string
  /** The outlined secondary pill's border (--border-strong flattened). */
  emailBorderStrong: string
  /** The soft accent panel behind a callout (Commons accent-soft). */
  emailAccentSoft: string
  /** The night room an email dims to under prefers-color-scheme: dark. */
  emailNightCanvas: string
  emailNightSurface: string
  emailNightBorder: string
  emailNightStrong: string
  emailNightBody: string
  emailNightMuted: string
  emailNightAction: string
  emailNightOnAction: string
  emailNightLink: string

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
  emailBody: '#3D352A', // token-ok: palette source, email-only
  emailAction: '#E2912F', // token-ok: palette source, email-only, mirrors --color-primary
  emailActionInk: '#FFFFFF', // token-ok: palette source, email-only
  emailBorderStrong: '#D9D2C6', // token-ok: palette source, email-only
  emailAccentSoft: '#FBEFD9', // token-ok: palette source, email-only
  emailNightCanvas: '#17120B', // token-ok: palette source, email-only, mirrors .dark --color-canvas
  emailNightSurface: '#211A10', // token-ok: palette source, email-only, mirrors .dark --color-surface
  emailNightBorder: '#3C3220', // token-ok: palette source, email-only, mirrors .dark --color-border
  emailNightStrong: '#F3EEE3', // token-ok: palette source, email-only
  emailNightBody: '#EFE8DB', // token-ok: palette source, email-only, mirrors .dark --color-text
  emailNightMuted: '#A99C88', // token-ok: palette source, email-only, mirrors .dark --color-text-muted
  emailNightAction: '#E2912F', // token-ok: palette source, email-only
  emailNightOnAction: '#17120B', // token-ok: palette source, email-only
  emailNightLink: '#F0B468', // token-ok: palette source, email-only

  // DAWN's raster cards still carry the pre-DAWN events indigo; kept byte-identical here so a
  // Frequency deploy can replace it in one place.
  ogAccent: '#E2912F', // token-ok: palette source, raster cards
  ogAccentSoft: '#FBEFD9', // token-ok: palette source, raster cards

  walletBackground: '#0f172a', // token-ok: palette source, Google Wallet payload
}

export const PALETTES: Record<DesignId, Palette> = {
  dawn: DAWN,
  // A copy of DAWN until the Frequency export lands; its values arrive with app/themes/frequency.css.
  // Frequency's Commons values from the installed export (design_handoff/frequency/tokens, ADR-1740).
  // Email, share cards and the Wallet pass cannot read CSS, so these mirror the --fq- tokens by hand.
  frequency: {
    canvas: '#FAF4EA', // token-ok: palette source, mirrors the Frequency export
    surface: '#FFFEFC', // token-ok: palette source, mirrors the Frequency export
    border: '#E6E1DA', // token-ok: palette source, mirrors the Frequency export
    text: '#38322D', // token-ok: palette source, mirrors the Frequency export
    textMuted: '#675E56', // token-ok: palette source, mirrors the Frequency export
    ink: '#070B14', // token-ok: palette source, mirrors the Frequency export
    inkElevated: '#0C1424', // token-ok: palette source, mirrors the Frequency export
    onInk: '#F2F5FA', // token-ok: palette source, mirrors the Frequency export
    primary: '#1E1B18', // token-ok: palette source, the Commons ink; the solid violet was retired (LIVE-961)
    primaryBg: '#F2E9DC', // token-ok: palette source, the Commons sunken sand
    onPrimary: '#FAF4EA', // token-ok: palette source, the Commons canvas on ink
    signal: '#17788A', // token-ok: palette source, mirrors the Frequency export
    broadcast: '#B0287F', // token-ok: palette source, mirrors the Frequency export
    danger: '#C2362B', // token-ok: palette source, mirrors the Frequency export
    // Commons, read off the MEMBER KIT (design_handoff/frequency/templates/members/app/app.css) and
    // tokens/themes.css: the app body is the linen card colour with the wash over it, cards are raised
    // white with a hairline, links are ink, the one action is the pastel --pa pill with ink text.
    // The crossover violet is NOT used on any member surface, so it is not used here.
    emailCanvas: '#FFFEFC', // token-ok: palette source, mirrors --surface-card (the app body)
    emailSurfaceElevated: '#F4F2EF', // token-ok: palette source, rgba(30,27,24,.04) on white (.chip, .ic)
    emailBorder: '#EFEEEC', // token-ok: palette source, --border-hair flattened on white
    emailHeading: '#34312E', // token-ok: palette source, mirrors --text-strong
    emailSubtle: '#7C766F', // token-ok: palette source, mirrors --text-muted
    emailFaint: '#7C766F', // token-ok: palette source, the postal line stays readable (AA floor)
    emailPrimaryStrong: '#34312E', // token-ok: palette source, links are ink (app.css a{color:var(--text-strong)})
    emailSuccess: '#17788A', // token-ok: palette source, mirrors --presence (aqua deep)
    emailInfo: '#34312E', // token-ok: palette source, ink
    emailAlert: '#C2362B', // token-ok: palette source, mirrors --danger
    emailBody: '#4D4945', // token-ok: palette source, mirrors --text-body
    emailAction: '#C4B8FF', // token-ok: palette source, --pa: the pastel pill's lavender stop, the solid fallback
    emailActionInk: '#1E1B18', // token-ok: palette source, mirrors .fq-pa color
    emailBorderStrong: '#D2D0CD', // token-ok: palette source, --border-strong flattened on white
    emailAccentSoft: '#F4EFF8', // token-ok: palette source, --pa-soft flattened on white
    emailNightCanvas: '#0E0B09', // token-ok: palette source, mirrors Commons night --bg-canvas
    emailNightSurface: '#18120E', // token-ok: palette source, mirrors Commons night --surface-card
    emailNightBorder: '#2B221B', // token-ok: palette source, night --border-hair flattened
    emailNightStrong: '#FBF2E6', // token-ok: palette source, mirrors Commons night --text-strong
    emailNightBody: '#E3D6C6', // token-ok: palette source, mirrors Commons night --text-body
    emailNightMuted: '#B3A391', // token-ok: palette source, mirrors Commons night --text-muted
    emailNightAction: '#C4B8FF', // token-ok: palette source, --pa: the pastel pill's lavender stop, lifted
    emailNightOnAction: '#120C08', // token-ok: palette source, mirrors Commons night --action-primary-text
    emailNightLink: '#FBF2E6', // token-ok: palette source, links are ink at night too
    ogAccent: '#A3D4FF', // token-ok: palette source, the --fq-pa sky stop (LIVE-961)
    ogAccentSoft: '#E8F4FF', // token-ok: palette source, the sky stop lightened for text on the ink card
    walletBackground: '#070B14', // token-ok: palette source, mirrors the Frequency export
  },
}

/** The palette this deploy wears (SITE_DESIGN is read once, at build). */
export const palette: Palette = PALETTES[SITE_DESIGN]
