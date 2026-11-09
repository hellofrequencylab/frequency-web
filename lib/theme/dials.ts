import REGISTRY from './dials.json' with { type: 'json' }

// THE DIAL REGISTRY (LIVE-1997, docs/design-systems/services/). Every owner-facing control a theme can offer is one
// entry of dials.json: its tier, its options, what it drives and where it is stored. The editor renders from this
// file plus a theme's manifest and never branches on a theme. Pure: no imports from site-style, which reads it.
//
// Four dials already existed (corners, spacing, header, footer) and keep their storage. Five are new and sparse
// (register, type, motion, hero, image) and one is the accent. `kit` is applied through the starter-kit flow and the
// Look a person picked is derived from the dial values (matchLook), so neither is stored.

type DialTier = 'simple' | 'advanced' | 'block' | 'theme'
type Option = readonly [string, string]
interface RawDial {
  id: string
  tier: DialTier
  group?: string
  label: string
  kind: string
  drives: string
  options: readonly Option[] | string
  stored: string
  existing?: boolean
  note?: string
  invariants?: readonly string[]
}

/** A dial as the editor draws it: a registry entry whose options are a concrete list. */
export interface Dial {
  id: string
  tier: DialTier
  group: string | null
  label: string
  options: readonly { id: string; label: string }[]
  /** Set on a dial a theme adds (tier `theme`): the theme's name, shown in Advanced. */
  fromTheme?: string
  note?: string
}

/** What a theme says about a dial: `fixed` hides it, `supported` shows it with the registry default. */
type DialSupport = 'supported' | 'fixed' | { supported: boolean; default?: string }
export interface LookPreset { id: string; label: string; dials: Record<string, string> }
/** The `editor` block of a schema 2 manifest: only these three keys are read here. */
export interface ThemeEditorDecl {
  dials?: Record<string, DialSupport>
  themeDials?: readonly { id: string; label: string; group?: string; options: readonly Option[]; default?: string; note?: string }[]
  looks?: readonly LookPreset[]
}

/** Kit is applied through the starter-kit flow, section order is the layers panel and a block's variant lives on the block. */
const ELSEWHERE = new Set(['kit', 'order', 'variant'])
const RAW = (REGISTRY.dials as unknown as RawDial[]).filter((d) => !ELSEWHERE.has(d.id))

// Every option in the registry is storable: the house header draws `centered` (components/sites/site-look-css.ts, LIVE-2031).
const toOptions = (options: readonly Option[] | string) => (typeof options === 'string' ? [] : options).map(([v, label]) => ({ id: v, label }))

/** The enumerated core dials, in registry order, each with its option list. `accent` has none (a named swatch or a hex). */
const CORE: readonly Dial[] = RAW.map((d) => ({ id: d.id, tier: d.tier, group: d.group ?? null, label: d.label, options: toOptions(d.options), ...(d.note ? { note: d.note } : {}) }))

/** The five new enumerated dials a site style stores sparsely. */
export const SITE_DIAL_KEYS = ['register', 'type', 'motion', 'hero', 'image'] as const
export type SiteDialKey = (typeof SITE_DIAL_KEYS)[number]
export const SITE_DIAL_OPTIONS = Object.fromEntries(SITE_DIAL_KEYS.map((k) => [k, CORE.find((d) => d.id === k)!.options])) as Record<SiteDialKey, readonly { id: string; label: string }[]>

export const isSiteDialValue = (key: SiteDialKey, v: unknown): v is string => SITE_DIAL_OPTIONS[key].some((o) => o.id === v)

/** An accent is a named swatch of the theme (a short slug) or a custom #rrggbb. */
export const isDialAccent = (v: unknown): v is string => typeof v === 'string' && (/^#[0-9a-fA-F]{6}$/.test(v) || /^[a-z][a-z0-9-]{0,31}$/.test(v))

const LEGACY = new Set(['corners', 'spacing', 'header', 'footer'])

const supportOf = (s: DialSupport | undefined): { supported: boolean; default?: string } =>
  s === 'supported' ? { supported: true } : s && typeof s === 'object' ? { supported: s.supported === true, default: s.default } : { supported: false }

/** The dials a theme shows. A schema 1 manifest (no `editor.dials`) shows the four dials it always had and hides the
 *  rest, so an unconverted theme's editor does not change. Fixed dials are left out entirely, never drawn disabled. */
export function dialsFor(decl: ThemeEditorDecl | null | undefined, themeName = ''): Dial[] {
  const declared = decl?.dials
  const core = CORE.filter((d) => (declared ? supportOf(declared[d.id]).supported : LEGACY.has(d.id)))
  const extra = (decl?.themeDials ?? []).map<Dial>((d) => ({ id: d.id, tier: 'theme', group: d.group ?? null, label: d.label, options: d.options.map(([id, label]) => ({ id, label })), fromTheme: themeName, ...(d.note ? { note: d.note } : {}) }))
  return [...core, ...extra]
}

/** True when a theme shows any control beyond the four legacy dials: the only case the new panel appears. */
export const hasNewDials = (dials: readonly Dial[]): boolean => dials.some((d) => !LEGACY.has(d.id))

/** The theme's own value for a dial: its declared default, else the fallback the caller resolved. */
export const declaredDefault = (decl: ThemeEditorDecl | null | undefined, id: string): string | undefined => supportOf(decl?.dials?.[id]).default


/** The Looks a theme ships, "Theme's own" always first. Entries naming an unknown dial or value are dropped. */
export function looksFor(decl: ThemeEditorDecl | null | undefined, dials: readonly Dial[]): LookPreset[] {
  const known = new Map(dials.map((d) => [d.id, new Set(d.options.map((o) => o.id))]))
  const clean = (decl?.looks ?? []).filter((l) => l.id !== 'own').map((l) => ({ ...l, dials: Object.fromEntries(Object.entries(l.dials).filter(([k, v]) => known.get(k)?.has(v))) }))
  return clean.length ? [{ id: 'own', label: "Theme's own", dials: {} }, ...clean.slice(0, 5)] : []
}

/** The Look whose every dial equals the current values (a Look sets only the dials it names; the rest are the theme's own).
 *  `edited` when none match; the theme's own when nothing differs from the defaults. */
export function matchLook(looks: readonly LookPreset[], current: Record<string, string>, own: Record<string, string>): string | 'edited' | null {
  if (!looks.length) return null
  const fits = (l: LookPreset) => Object.keys({ ...own, ...l.dials }).every((k) => (l.dials[k] ?? own[k]) === current[k])
  return looks.find(fits)?.id ?? 'edited'
}
