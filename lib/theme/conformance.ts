import { SITE_DIAL_OPTIONS } from '@/lib/theme/dials'

// THEME CONFORMANCE (LIVE-1998, docs/design-systems/services/). The ten invariants a theme must pass before an owner
// is given its dials, as PURE checks over data a test collects (resolved tokens, block source, measured heights, DOM
// snapshots). Each returns the list of failures, empty when the theme conforms, so one report names every break at
// once. Nothing here renders or measures: the Playwright run that does is a separate row (it needs a themed page).
// Thresholds are the handoff's (reference/Conformance.html): text 4.5:1, headline 3:1, height drift 8%, repaint 100ms.

export const INVARIANTS = ['contrast', 'no-literal-colours', 'type-height-stability', 'motion-additive', 'reduced-motion', 'empty-states', 'hidden-functions', 'reset-total', 'surface-parity', 'repaint-budget'] as const
export type Invariant = (typeof INVARIANTS)[number]

const THRESHOLD = { text: 4.5, headline: 3, heightDrift: 0.08, repaintMs: 100 } as const

// ── 1. contrast ────────────────────────────────────────────────────────────────────────────────────────────────
const HEX = /^#([0-9a-f]{6})$/i

function luminance(hex: string): number {
  const n = parseInt(HEX.exec(hex)![1], 16)
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/** WCAG contrast ratio of two #rrggbb colours (1 to 21). */
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

interface ResolvedTokens {
  bg: string
  text: string
  /** The display (headline) colour, when it differs from text. */
  display?: string
  accent: string
  accentText: string
  /** The label on a filled accent button. */
  onAccent: string
}

/** Text >= 4.5:1, headline >= 3:1, accent text >= 4.5:1 on the ground, and the label on a filled accent button >= 4.5:1.
 *  One call per register x accent; the caller names the case in `where`. */
export function contrast(t: ResolvedTokens, where = ''): string[] {
  const at = where ? ` (${where})` : ''
  const bad = Object.entries(t).filter(([, v]) => typeof v === 'string' && !HEX.test(v)).map(([k]) => `${k} is not a #rrggbb colour${at}`)
  if (bad.length) return bad
  const out: string[] = []
  const need = (name: string, fg: string, bg: string, min: number) => { const r = ratio(fg, bg); if (r < min) out.push(`${name} ${r.toFixed(2)}:1 is under ${min}:1${at}`) }
  need('text on ground', t.text, t.bg, THRESHOLD.text)
  if (t.display) need('headline on ground', t.display, t.bg, THRESHOLD.headline)
  need('accent text on ground', t.accentText, t.bg, THRESHOLD.text)
  need('button label on accent', t.onAccent, t.accent, THRESHOLD.text)
  return out
}

// ── 2. no literal colours in block source ───────────────────────────────────────────────────────────────────────
const LITERAL = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|\brgba?\(|\bhsla?\(/gi

/** Block source may reference tokens only. Returns each literal with its line. */
export function literalColours(source: string, file = 'block'): string[] {
  const out: string[] = []
  source.split('\n').forEach((line, i) => { for (const m of line.matchAll(LITERAL)) out.push(`${file}:${i + 1} names a colour (${m[0]})`) })
  return out
}

// ── 3. height stability across type voices ──────────────────────────────────────────────────────────────────────
/** Rendered height per voice for each block, at one viewport width. A block may not change by more than 8%. */
export function heightStability(heights: Record<string, Record<string, number>>, where = ''): string[] {
  const out: string[] = []
  for (const [block, byVoice] of Object.entries(heights)) {
    const v = Object.values(byVoice)
    if (v.length < 2) continue
    const drift = (Math.max(...v) - Math.min(...v)) / Math.min(...v)
    if (drift > THRESHOLD.heightDrift) out.push(`${block} moves ${(drift * 100).toFixed(1)}% between type voices${where ? ` (${where})` : ''}`)
  }
  return out
}

// ── 4. motion is additive, 5. reduced motion wins ───────────────────────────────────────────────────────────────
export interface Box { id: string; x: number; y: number; w: number; h: number; effect?: boolean }

/** With motion off, nothing but effect layers differs from full once animations settle: every non-effect box is
 *  where it was, and none appeared or vanished. */
export function motionAdditive(full: readonly Box[], off: readonly Box[]): string[] {
  const out: string[] = []
  const a = new Map(full.filter((b) => !b.effect).map((b) => [b.id, b]))
  const z = new Map(off.filter((b) => !b.effect).map((b) => [b.id, b]))
  for (const [id, b] of a) {
    const o = z.get(id)
    if (!o) out.push(`${id} disappears with motion off`)
    else if (b.x !== o.x || b.y !== o.y || b.w !== o.w || b.h !== o.h) out.push(`${id} moves or resizes with motion off`)
  }
  for (const id of z.keys()) if (!a.has(id)) out.push(`${id} only exists with motion off`)
  return out
}

/** Under prefers-reduced-motion: reduce no effect animates, whatever the motion dial says. */
export function reducedMotion(effects: readonly { id: string; animating: boolean }[]): string[] {
  return effects.filter((e) => e.animating).map((e) => `${e.id} still animates under reduced motion`)
}

// ── 6. empty states ─────────────────────────────────────────────────────────────────────────────────────────────
export interface Slot { id: string; kind: 'image' | 'list'; /** What was drawn with no content: a finished placeholder, a one-line empty state, or nothing. */ empty: 'placeholder' | 'line' | 'nothing' | 'blank' }

/** Every image slot draws a finished placeholder and every list block a one-line empty state. */
export function emptyStates(slots: readonly Slot[]): string[] {
  return slots.filter((s) => (s.kind === 'image' ? s.empty !== 'placeholder' : s.empty !== 'line')).map((s) => `${s.id} draws ${s.empty === 'nothing' ? 'nothing' : s.empty === 'blank' ? 'a blank box' : 'the wrong empty state'} with no content`)
}

// ── 7. hidden functions leave no gap ────────────────────────────────────────────────────────────────────────────
/** With one function off, no element naming it (`data-fn`) remains in the rendered surface. */
export function hiddenFunctions(html: string, off: string): string[] {
  const re = new RegExp(`data-fn=["']${off.replace(/[^a-z0-9-]/gi, '')}["']`)
  return re.test(html) ? [`${off} is off but still in the page`] : []
}

// ── 8. reset is total ───────────────────────────────────────────────────────────────────────────────────────────
/** After reset(), every resolved token and root attribute equals the theme's own. */
export function resetTotal(own: Record<string, string>, afterReset: Record<string, string>): string[] {
  return Object.keys({ ...own, ...afterReset }).filter((k) => own[k] !== afterReset[k]).map((k) => `${k} is ${afterReset[k] ?? 'unset'} after reset, the theme's own is ${own[k] ?? 'unset'}`)
}

// ── 9. surface parity ───────────────────────────────────────────────────────────────────────────────────────────
/** For one function, every surface shows the same rows (title, price, time) from one fixture. `null` is a surface the
 *  theme says it does not draw (a function with no email), which is a declaration, not a gap. */
export function surfaceParity(rows: Record<string, readonly string[] | null>, fn = ''): string[] {
  const drawn = Object.entries(rows).filter((e): e is [string, readonly string[]] => e[1] !== null)
  if (drawn.length < 2) return []
  const key = (r: readonly string[]) => JSON.stringify([...r].sort())
  const first = key(drawn[0][1])
  return drawn.slice(1).filter(([, r]) => key(r) !== first).map(([s]) => `${fn ? `${fn}: ` : ''}${s} shows different rows than ${drawn[0][0]}`)
}

// ── 10. repaint budget ──────────────────────────────────────────────────────────────────────────────────────────
/** A dial change repaints without a reload, in under 100ms. */
export function repaintBudget(ms: number, reloaded = false, where = ''): string[] {
  const at = where ? ` (${where})` : ''
  return [...(reloaded ? [`a dial change reloaded the page${at}`] : []), ...(ms >= THRESHOLD.repaintMs ? [`repaint took ${Math.round(ms)}ms, budget is ${THRESHOLD.repaintMs}ms${at}`] : [])]
}

// ── the matrix ──────────────────────────────────────────────────────────────────────────────────────────────────
interface MatrixCase { register: string; accent: string; type: string; hero: string; header: string; width: 1440 | 390 }

/** The dial combinations a run covers: registers x accents x type voices x (hero, header), at 1440 and 390 wide. The
 *  hero x header product is sampled by pairing them so the count stays small; every hero and every header appears. */
export function conformanceMatrix(accents: readonly string[], headers: readonly string[] = ['bar', 'pill']): MatrixCase[] {
  const heroes = SITE_DIAL_OPTIONS.hero.map((o) => o.id)
  const layouts = Array.from({ length: Math.max(heroes.length, headers.length) }, (_, i) => ({ hero: heroes[i % heroes.length], header: headers[i % headers.length] }))
  const out: MatrixCase[] = []
  for (const register of SITE_DIAL_OPTIONS.register.map((o) => o.id)) for (const accent of accents) for (const type of SITE_DIAL_OPTIONS.type.map((o) => o.id)) for (const l of layouts) for (const width of [1440, 390] as const) out.push({ register, accent, type, ...l, width })
  return out
}
