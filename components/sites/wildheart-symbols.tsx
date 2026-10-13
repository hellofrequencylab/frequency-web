import { useId } from 'react'
import { WILDHEART_GLYPHS, MOON_PHASES, moonPhasePath } from '@/lib/theme/wildheart-symbols'
import { WILDHEART_LOGO_PATHS, WILDHEART_LOGO_VIEWBOX, wordmarkLines } from '@/lib/theme/wildheart-logo'
import { WILDHEART_CONSTELLATIONS } from '@/lib/theme/wildheart-constellations'

// THE WILDHEART SYMBOL FAMILY, drawn (lib/theme/wildheart-symbols.ts is the data). Server Components: a glyph
// is text in the symbol face and the one violet ink, through the ink-bleed filter WildheartInkDefs puts in
// the page once; a moon is an SVG of its phase. Colours and faces are tokens (components/sites/wildheart-css.ts).

/** One glyph from the library (a sign, an element, the star, the spark), in the symbol ink. */
export function WhGlyph({ name, size = 20, halo = false, watermark = false, label }: { name: string; size?: number; halo?: boolean; watermark?: boolean; label?: string }) {
  const ch = WILDHEART_GLYPHS[name] ?? name
  const cls = `wh-glyph${halo ? ' wh-glyph-halo' : ''}${watermark ? ' wh-glyph-watermark' : ''}`
  // A watermark is positioned and faint inline too, so a surface without the skin (the editor canvas, the
  // Space page) never shows a 300px glyph in the flow.
  const style = halo ? { width: size * 2, height: size * 2, fontSize: size } : watermark ? { fontSize: size, position: 'absolute' as const, opacity: 0.07, pointerEvents: 'none' as const, lineHeight: 1 } : { fontSize: size }
  return (
    <span className={cls} style={style} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined}>
      {ch}
    </span>
  )
}

/** The moon at a phase (0 new to 7 balsamic), as an SVG: a lavender disc, the lit part in vellum, a ring in
 *  the symbol ink. */
export function WhMoon({ phase, size = 16, label }: { phase: number; size?: number; label?: string }) {
  const r = 10
  const lit = moonPhasePath(phase, r - 0.75, r, r)
  const name = label ?? MOON_PHASES[((phase % 8) + 8) % 8]
  return (
    <svg className="wh-moon" width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={name}>
      <circle className="wh-moon-dark" cx={r} cy={r} r={r - 0.75} />
      {lit && <path className="wh-moon-lit" d={lit} />}
      <circle className="wh-moon-ring" cx={r} cy={r} r={r - 0.75} />
    </svg>
  )
}

/** One ink-bleed filter: a little turbulence displaces the outline so the symbol sits in the paper like a
 *  stamp. Three grades (the handoff's ink.js): fine for glyphs and seals, base for mid-size marks, rough
 *  for watermarks. */
function InkFilter({ id, freq, scale, blur }: { id: string; freq: number; scale: number; blur: number }) {
  return (
    <filter id={id} x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves="2" seed="7" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale={scale} xChannelSelector="R" yChannelSelector="G" result="d" />
      <feGaussianBlur in="d" stdDeviation={blur} result="b" />
      <feComponentTransfer in="b">
        <feFuncA type="table" tableValues="0 .15 .85 1 1" />
      </feComponentTransfer>
    </filter>
  )
}

const VB = WILDHEART_LOGO_VIEWBOX

/** The page's one set of symbol definitions: the three ink-bleed filters every glyph reads
 *  (`filter:url(#wh-ink-fine)`), the feather a large logo wears, and the figure of the mark as a symbol
 *  every WhLogoMark lockup references. Rendered once per Wildheart page. */
export function WildheartInkDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <defs>
        <InkFilter id="wh-ink-fine" freq={1.3} scale={0.9} blur={0.22} />
        <InkFilter id="wh-ink" freq={0.9} scale={1.5} blur={0.3} />
        <InkFilter id="wh-ink-rough" freq={0.6} scale={2.6} blur={0.35} />
        <filter id="wh-logo-soft" x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="bleed" />
          <feMerge>
            <feMergeNode in="bleed" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <symbol id="wh-logo-figure" viewBox={`${VB.x} ${VB.y} ${VB.width} ${VB.height}`}>
          {WILDHEART_LOGO_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </symbol>
      </defs>
    </svg>
  )
}

/** The lockups' coordinate spaces (x y width height), the handoff's own. */
const LOCKUPS = {
  stacked: [380, 40, 1240, 1920],
  figure: [380, 40, 1240, 1920],
  horizontal: [380, 40, 2780, 1920],
  wordmark: [0, 0, 1420, 600],
} as const

/** The tones: one gradient over the whole mark, every stop a token. */
const TONES: Record<string, [string, number][]> = {
  nightshade: [['var(--wh-nightshade-top)', 0], ['var(--wh-nightshade)', 1]],
  twilight: [['var(--wh-violet-top)', 0], ['var(--wh-violet)', 0.45], ['var(--wh-madder)', 1]],
  violet: [['var(--wh-violet-top)', 0], ['var(--wh-violet-pressed)', 1]],
  ink: [['var(--wh-ink)', 0], ['var(--wh-ink)', 1]],
  vellum: [['var(--wh-vellum)', 0], ['var(--wh-aged)', 1]],
}

/** The mark (the handoff's LogoMark): the figure and the WILD / HEART wordmark in one fill, in four lockups
 *  and five tones. The figure is the page's one symbol (WildheartInkDefs); the wordmark is the Space's own
 *  name, broken by wordmarkLines, set in the display face with the second line italic. Horizontal and
 *  wordmark lockups and anything under 200px render crisp; a large mark wears a light feather. */
export function WhLogoMark({ name, size = 240, lockup = 'stacked', tone = 'nightshade', className }: {
  name: string; size?: number; lockup?: keyof typeof LOCKUPS; tone?: keyof typeof TONES; className?: string
}) {
  const id = useId().replace(/:/g, '')
  const vb = LOCKUPS[lockup]
  const h = lockup === 'wordmark' ? (size * vb[3]) / vb[2] : size
  const w = (h * vb[2]) / vb[3]
  const stops = TONES[tone] ?? TONES.nightshade
  const soft = lockup !== 'horizontal' && lockup !== 'wordmark' && size >= 200
  const lines = wordmarkLines(name)
  const word = (x: number, y: number, fs: number, lh: number) => (
    <text x={x} y={y} className="wh-logo-word" fontSize={fs}>
      <tspan x={x} y={y}>{lines[0].toUpperCase()}</tspan>
      {lines[1] && <tspan x={x} y={y + lh} fontStyle="italic">{lines[1].toUpperCase()}</tspan>}
    </text>
  )
  return (
    <svg
      role="img"
      aria-label={name}
      className={`wh-logo${className ? ` ${className}` : ''}`}
      viewBox={vb.join(' ')}
      width={w}
      height={h}
      style={{ width: w, height: h, flex: 'none', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`${id}g`} gradientUnits="userSpaceOnUse" x1={vb[0]} y1={vb[1]} x2={vb[0] + vb[2] * 0.3} y2={vb[1] + vb[3]}>
          {stops.map(([c, o], i) => (
            <stop key={i} offset={o} style={{ stopColor: c }} />
          ))}
        </linearGradient>
      </defs>
      <g fill={`url(#${id}g)`} filter={soft ? 'url(#wh-logo-soft)' : undefined}>
        {lockup !== 'wordmark' && <use href="#wh-logo-figure" x={VB.x} y={VB.y} width={VB.width} height={VB.height} />}
        {lockup === 'stacked' && word(410, 1645, 190, 160)}
        {lockup === 'horizontal' && word(1720, 930, 330, 290)}
        {lockup === 'wordmark' && word(10, 260, 300, 270)}
      </g>
    </svg>
  )
}

/** A sign's stars (the handoff's Constellation): the stylised asterism in the symbol ink, each star a soft
 *  halo, a dot and a vellum core, linked by a dotted line. `ink={false}` drops the filter for a large or an
 *  animated use. */
export function WhConstellation({ sign = 'scorpio', size = 120, lines = true, ink = true }: { sign?: string; size?: number; lines?: boolean; ink?: boolean }) {
  const id = useId().replace(/:/g, '')
  const [stars, links] = WILDHEART_CONSTELLATIONS[sign] ?? WILDHEART_CONSTELLATIONS.scorpio
  const mags = [0, 2.4, 1.9, 1.4, 1]
  return (
    <svg role="img" aria-label={`${sign} constellation`} className="wh-constellation" viewBox="0 0 100 100" width={size} height={size} style={{ display: 'block', overflow: 'visible', filter: ink ? 'url(#wh-ink-fine)' : undefined }}>
      <defs>
        <radialGradient id={id}>
          <stop offset="0" className="wh-constellation-core" />
          <stop offset=".45" className="wh-constellation-halo" />
          <stop offset="1" className="wh-constellation-fade" />
        </radialGradient>
      </defs>
      {lines && links.map(([a, b], i) => (
        <line key={i} className="wh-constellation-line" x1={stars[a][0]} y1={stars[a][1]} x2={stars[b][0]} y2={stars[b][1]} strokeWidth={150 / size} strokeDasharray="1.2 .9" strokeLinecap="round" />
      ))}
      {stars.map(([x, y, m], i) => {
        const r = mags[m] ?? 1
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={r * 2.6} fill={`url(#${id})`} opacity=".55" />
            <circle cx={x} cy={y} r={r * 0.55} className="wh-constellation-dot" />
            <circle cx={x} cy={y} r={r * 0.25} className="wh-constellation-spark" />
          </g>
        )
      })}
    </svg>
  )
}

/** The ornament rule (the handoff's Ornament): a hairline fading in from each side to a dot and a short
 *  dash, with the mark in the middle. `moons` is the default (a moon, a spark, a waning moon), `star` the
 *  festival star, `phases` three small moons. `bridge` is the Home page's "enter the year" bridge: a
 *  vertical fading hairline down to a new moon and the label under it. */
export function WhOrnament({ variant = 'moons', label }: { variant?: 'moons' | 'star' | 'phases' | 'bridge'; label?: string }) {
  if (variant === 'bridge') {
    return (
      <div className="wh-bridge" aria-hidden="true">
        <span className="wh-bridge-line" />
        <WhMoon phase={0} size={22} />
        {label && <span className="wh-bridge-label">{label}</span>}
      </div>
    )
  }
  const mid =
    variant === 'star' ? (
      <WhGlyph name="star" size={16} />
    ) : variant === 'phases' ? (
      <span className="wh-ornament-mid">
        <WhMoon phase={1} size={10} />
        <WhMoon phase={4} size={14} />
        <WhMoon phase={7} size={10} />
      </span>
    ) : (
      <span className="wh-ornament-mid">
        <WhGlyph name="moon" size={15} />
        <WhGlyph name="spark" size={10} />
        <WhGlyph name="waning" size={15} />
      </span>
    )
  return (
    <div className="wh-ornament" role="separator">
      <span className="wh-ornament-line" />
      {mid}
      <span className="wh-ornament-line wh-ornament-line-r" />
    </div>
  )
}

/** A seal: a glyph on a lavender disc inside a dotted ring, a hairline ring and four compass dots, in the
 *  symbol ink. Circles are for people, moons and seals only. */
export function WhSeal({ name, size = 72, label }: { name: string; size?: number; label?: string }) {
  return (
    <span className="wh-seal-wrap">
      <span className="wh-seal" style={{ width: size, height: size }} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined}>
        <span className="wh-seal-dot wh-seal-dot-n" />
        <span className="wh-seal-dot wh-seal-dot-s" />
        <span className="wh-seal-dot wh-seal-dot-w" />
        <span className="wh-seal-dot wh-seal-dot-e" />
        <span className="wh-seal-glyph" style={{ fontSize: size * 0.4 }}>{WILDHEART_GLYPHS[name] ?? name}</span>
      </span>
      {label && <span className="wh-seal-label">{label}</span>}
    </span>
  )
}

/** A row of `total` moons, the first `done` of them full, the rest new: a fullness bar (a circle's twelve
 *  seats, a journey's weeks). The label sits after the moons. */
export function WhMoonPhases({ total, done = 0, size = 12, label }: { total: number; done?: number; size?: number; label?: string | false }) {
  const n = Math.max(1, Math.min(24, Math.round(total)))
  const d = Math.max(0, Math.min(n, Math.round(done)))
  return (
    <span className="wh-moonphases" role="img" aria-label={`${d} of ${n}${label ? `, ${label}` : ''}`}>
      {Array.from({ length: n }, (_, i) => (
        <WhMoon key={i} phase={i < d ? 4 : 0} size={size} label={i < d ? 'Full' : 'New'} />
      ))}
      {label && <span className="wh-moonphases-label">{label}</span>}
    </span>
  )
}
