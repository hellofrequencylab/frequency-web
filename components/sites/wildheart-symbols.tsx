import { WILDHEART_GLYPHS, MOON_PHASES, moonPhasePath } from '@/lib/theme/wildheart-symbols'

// THE WILDHEART SYMBOL FAMILY, drawn (lib/theme/wildheart-symbols.ts is the data). Server Components: a glyph
// is text in the symbol face and the one violet ink, through the ink-bleed filter WildheartInkDefs puts in
// the page once; a moon is an SVG of its phase. Colours and faces are tokens (components/sites/wildheart-css.ts).

/** One glyph from the library (a sign, an element, the star, the spark), in the symbol ink. */
export function WhGlyph({ name, size = 20, halo = false, watermark = false, label }: { name: string; size?: number; halo?: boolean; watermark?: boolean; label?: string }) {
  const ch = WILDHEART_GLYPHS[name] ?? name
  const cls = `wh-glyph${halo ? ' wh-glyph-halo' : ''}${watermark ? ' wh-glyph-watermark' : ''}`
  const style = halo ? { width: size * 2, height: size * 2, fontSize: size } : { fontSize: size }
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

/** The ink-bleed filter every glyph reads (`filter:url(#wh-ink-fine)`): a little turbulence displaces the
 *  outline so the symbol sits in the paper like a stamp. Rendered once per Wildheart page. */
export function WildheartInkDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <defs>
        <filter id="wh-ink-fine" x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="0.22" result="b" />
          <feComponentTransfer in="b">
            <feFuncA type="table" tableValues="0 .15 .85 1 1" />
          </feComponentTransfer>
        </filter>
      </defs>
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
