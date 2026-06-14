// Client-safe Theme Studio contract (no server imports). Shared between the admin
// server reads/actions (lib/theme/server/admin-themes.ts, app/(main)/admin/appearance/
// actions.ts) and the editor UI. A theme is a named set of DAWN token overrides — a
// `light` block, a `dark` block, and a `feel` block — that an operator edits as DATA
// (no code deploy), keyed off `data-skin`/`data-occasion`. These camelCase shapes mirror
// the snake_case `themes` table (supabase/migrations/20260625000000_themes.sql); the
// server layer maps the columns. Token names/values are always re-validated against the
// allowlist (lib/theme/validate.ts) before they are persisted or rendered.

/** 'skin' = a palette/feel theme bound to a data-skin value; 'occasion' = a seasonal
 *  overlay bound to a data-occasion value within an optional MM-DD calendar window. */
export type ThemeKind = 'skin' | 'occasion'

/** Lifecycle. Only 'active' themes are world-readable (RLS); 'draft'/'archived' stay hidden. */
export type ThemeStatus = 'draft' | 'active' | 'archived'

/** The token overrides, split by mode/axis. Each block maps an allowlisted DAWN custom
 *  property (e.g. `--color-primary`, `--radius-card`) to a sanitized value. */
export interface ThemeTokens {
  light: Record<string, string>
  dark: Record<string, string>
  feel: Record<string, string>
}

/** The editable fields of a theme (the editor's form payload). `windowStart`/`windowEnd`
 *  are inclusive MM-DD bounds for kind='occasion' (ignored for kind='skin'). */
export interface ThemeInput {
  slug: string
  name: string
  kind: ThemeKind
  tokens: ThemeTokens
  windowStart?: string | null
  windowEnd?: string | null
}

/** A persisted theme row, as read back for the admin list/editor. */
export interface ThemeRow extends ThemeInput {
  id: string
  status: ThemeStatus
  isDefault: boolean
  createdAt: string
  updatedAt: string
}
