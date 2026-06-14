// Public entry for the theme system. Re-exports the three orthogonal axes (skin /
// generation / occasion) and the cookie helpers so callers can
// `import { resolveSkin, resolveGeneration, type ResolvedTheme } from '@/lib/theme'`
// without reaching into the individual files.
//
// CLIENT-SAFE: this barrel must stay importable from client components. It re-exports the
// `ResolvedTheme` TYPE only (a type-only re-export erases at build, so it pulls no runtime
// code) — the server resolver `resolveTheme` is NOT re-exported here because it imports
// next/headers + 'server-only'. Server callers import it directly from
// `@/lib/theme/server/resolve`.

export {
  type SkinId,
  type SkinDef,
  SKINS,
  DEFAULT_SKIN,
  isSkinId,
  resolveSkin,
} from './skins'

export {
  type GenerationId,
  type GenerationDef,
  GENERATIONS,
  DEFAULT_GENERATION,
  isGenerationId,
  resolveGeneration,
} from './generations'

export {
  type OccasionId,
  type OccasionDef,
  OCCASIONS,
  DEFAULT_OCCASION,
  isOccasionId,
  resolveOccasion,
  resolveOccasionForDate,
} from './occasions'

export {
  type ThemeCookie,
  THEME_COOKIE,
  THEME_COOKIE_ATTRS,
  parseThemeCookie,
  serializeThemeCookie,
} from './cookie'

// Type-only re-export (no runtime code pulled in — stays client-safe). Consumers that
// need to RESOLVE a theme import `resolveTheme` from `@/lib/theme/server/resolve` directly.
export type { ResolvedTheme } from './server/resolve'
