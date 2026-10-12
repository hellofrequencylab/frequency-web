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
