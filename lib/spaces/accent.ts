// PER-SPACE ACCENT SCOPING (ENTITY-SPACES-BUILD §A — D4 "the accent is a guest", D6 "tokens only").
//
// A Space's `brand_accent` is a DAWN token NAME (one of components/spaces/space-form.tsx
// ACCENT_TOKENS, all of which are in lib/theme/validate.ts TOKEN_ALLOWLIST). On its own that name
// is inert: nothing in the profile reads `var(--color-broadcast)` — the CTAs, the active tab, the
// type badge, and the in-body accents all read the `--color-primary*` family. So to make a Space's
// accent actually paint, this maps the chosen accent FAMILY onto the `--color-primary*` slots as a
// scoped CSS-variable override the profile shell applies to a wrapper node (never the whole page —
// the canvas/surface tokens stay neutral, D4). The override is built ONLY from `var(<token>)`
// references to allowlisted tokens, so no hex literal is ever introduced (D6) and the values track
// the live palette (light/dark/skin) automatically.
//
// Why a registry and not a blind `--color-primary: var(<accent>)`: a complete remap needs the
// accent's -hover / -strong / -bg / text-on variants too (the primary BUTTON reads -hover and
// text-on-primary; the active tab + badge read -bg + -strong). Only `primary`, `signal`, and
// `broadcast` ship a full family in app/globals.css; the semantic-state tokens (`info`, `warning`,
// `success`, `danger`) ship only base + -bg. This registry fills the missing slots with the safest
// available token so EVERY allowlisted accent remaps cleanly and stays legible.

import { TOKEN_ALLOWLIST } from '@/lib/theme/validate'

/** The DAWN `--color-primary*` slots an accent override sets. Each value is a `var(--token)` string
 *  pointing at an allowlisted token (never a literal), so the live palette + dark mode resolve it. */
export interface AccentVars {
  '--color-primary': string
  '--color-primary-hover': string
  '--color-primary-strong': string
  '--color-primary-bg': string
  '--color-text-on-primary': string
}

/** One accent FAMILY: the four shade tokens + the readable text token, by name. The builder turns
 *  these into the `var()` override. A `null` shade/text means "this family has no such token in
 *  globals.css" — the builder falls back to the base shade (a safe, on-system substitute). */
interface AccentFamily {
  base: string
  hover: string | null
  strong: string | null
  bg: string | null
  textOn: string | null
}

// The families that back each allowlisted accent base token. `primary`, `signal`, and `broadcast`
// are complete; the semantic-state families carry only base + -bg, so their hover/strong fall back
// to the base shade and their text-on falls back to the global default (white) — both validated
// below to read legibly on the mid-tone state colors.
const FAMILIES: Record<string, AccentFamily> = {
  '--color-primary': {
    base: '--color-primary',
    hover: '--color-primary-hover',
    strong: '--color-primary-strong',
    bg: '--color-primary-bg',
    textOn: '--color-text-on-primary',
  },
  '--color-signal': {
    base: '--color-signal',
    hover: '--color-signal-strong', // signal has no -hover; the darker -strong reads as the pressed shade
    strong: '--color-signal-strong',
    bg: '--color-signal-bg',
    textOn: '--color-text-on-signal',
  },
  '--color-broadcast': {
    base: '--color-broadcast',
    hover: '--color-broadcast-strong',
    strong: '--color-broadcast-strong',
    bg: '--color-broadcast-bg',
    textOn: '--color-text-on-broadcast',
  },
  '--color-info': {
    base: '--color-info',
    hover: null,
    strong: null,
    bg: '--color-info-bg',
    textOn: null, // #2F6FB0 on white is 5.22:1 (AA) — the default white text-on-primary is fine
  },
  '--color-warning': {
    base: '--color-warning',
    hover: null,
    strong: null,
    bg: '--color-warning-bg',
    textOn: null, // #B07515 on white is 3.89:1 — passes the large-text/UI AA floor like the amber CTA
  },
  '--color-success': {
    base: '--color-success',
    hover: null,
    strong: null,
    bg: '--color-success-bg',
    textOn: null, // #11827A on white is 4.67:1 (AA)
  },
}

/** Build the scoped `--color-primary*` override for an accent base token, or null when the token is
 *  not allowlisted / has no family (the caller then keeps the inherited host accent). The `-strong`
 *  slot is used for the active tab text + type badge text + the in-body `text-primary-strong`, so it
 *  must stay dark-on-light: it falls back to the base only when the family has no darker shade. */
export function accentVars(token: string | null | undefined): AccentVars | null {
  if (!token) return null
  // Defence in depth: never build an override from a token the theme allowlist would reject (the
  // store already validates on write, but the accent is interpolated into inline style here).
  if (!TOKEN_ALLOWLIST.has(token)) return null
  const fam = FAMILIES[token]
  if (!fam) return null

  const ref = (name: string) => `var(${name})`
  return {
    '--color-primary': ref(fam.base),
    '--color-primary-hover': ref(fam.hover ?? fam.base),
    '--color-primary-strong': ref(fam.strong ?? fam.base),
    '--color-primary-bg': ref(fam.bg ?? fam.base),
    '--color-text-on-primary': ref(fam.textOn ?? '--color-text-on-primary'),
  }
}

/** Resolve the accent override for a Space: its own `brand_accent` when set + supported, else the
 *  per-role `defaultAccent` from the blueprint, else null (the host amber). So an un-customized
 *  profile still differs by role, and a customized one wins. */
export function resolveAccentVars(
  brandAccent: string | null | undefined,
  roleDefaultAccent: string | null | undefined,
): AccentVars | null {
  return accentVars(brandAccent) ?? accentVars(roleDefaultAccent)
}

/** The accent base tokens this module can fully remap (used by the blueprint default-accent guard +
 *  the test, so a role never declares a default the override can't paint). */
export const SUPPORTED_ACCENT_TOKENS: ReadonlySet<string> = new Set(Object.keys(FAMILIES))
