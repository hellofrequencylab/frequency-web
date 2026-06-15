// The SKIN registry — the single typed place a "skin" (a token-set / palette + feel
// applied via [data-skin]) is declared, so the core never edits to add one
// (ADR-249/250, docs/SPACES.md, docs/EXPANSION-FRAMEWORK.md). A skin is the lateral
// (white-label) axis of a Space: orthogonal to the light/dark MODE (.dark on <html>),
// it selects the palette + feel for the in-app subtree via [data-skin] on the shell root.
//
// This registry is the typed mirror of the CSS: every id here MUST have matching
// `[data-skin="<id>"]` and `.dark [data-skin="<id>"]` blocks in app/globals.css (the
// `default` skin inherits :root/.dark and needs no overrides). The guardrail test in
// skins.test.ts reads globals.css from disk and enforces that pairing forever, so the
// CSS and the registry can never quietly drift apart.
//
// Imported statically (no runtime registration), so the registry is deterministic
// regardless of import order — same pattern as lib/verticals/registry.ts.

/** The set of authored skin ids. Add a skin = author its CSS blocks AND extend this union. */
export type SkinId = 'default' | 'midnight'

/** The full declaration of a skin — its id plus its human-readable, naming-canon copy. */
export interface SkinDef {
  /** Stable id, the `[data-skin]` value and the `spaces.skin` column value. */
  id: SkinId
  /** Short, brand-appropriate label (docs/NAMING.md, docs/CONTENT-VOICE.md). */
  label: string
  /** One plain sentence on the feel (voice: plain, no em dashes). */
  description: string
}

/** Every registered skin. `default` (DAWN) is first; it is the fallback everywhere. */
export const SKINS: readonly SkinDef[] = [
  {
    id: 'default',
    label: 'Dawn',
    description: 'The signature Frequency look: a warm cream canvas with amber light.',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'A cooler, deeper take: cool slate surfaces with the warm amber accent kept.',
  },
]

/** The fallback skin id. An unknown or missing `spaces.skin` value resolves to this. */
export const DEFAULT_SKIN: SkinId = 'default'

/** Type guard: is this raw string a known skin id? */
export function isSkinId(id: string): id is SkinId {
  return SKINS.some((s) => s.id === id)
}

/**
 * Turn a raw `spaces.skin` string (or null/undefined) into a safe SkinId. Returns the
 * id when known, else DEFAULT_SKIN. This is the one function callers use to map the DB
 * value to a `[data-skin]` value, so an unrecognized/legacy skin never breaks the shell.
 */
export function resolveSkin(id: string | null | undefined): SkinId {
  return id != null && isSkinId(id) ? id : DEFAULT_SKIN
}
