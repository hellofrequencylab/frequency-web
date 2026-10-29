import type { CSSProperties, ReactNode } from 'react'

// The Designer theme's small marks: Glyph (the geometric sigil set), Seal (the ochre-ringed disc that holds a numeral or a
// mark) and Ornament (a hairline divider with one quiet ochre "+"). Server-safe, tokens only. The looks are the `.dz-seal`
// and `.dz-orn` rules in components/sites/designer-blocks-css.ts; the design system's Glyph.jsx, Seal.jsx and Ornament.jsx
// are the source (docs/design-systems/designer/rules.json).

/** The sigil paths, 24-unit grid, drawn with the current colour. The design's plain geometric set. */
const SIGILS: Record<string, ReactNode> = {
  circle: <circle cx="12" cy="12" r="8" />,
  ring: (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>),
  target: (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".6" /></>),
  half: (<><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" /></>),
  arc: <path d="M4 18a8 8 0 0 1 16 0" />,
  triangle: <path d="M12 4 20 19H4z" />,
  diamond: <path d="M12 3 21 12 12 21 3 12z" />,
  square: <rect x="5" y="5" width="14" height="14" />,
  hexagon: <path d="M12 3 20 7.5v9L12 21 4 16.5v-9z" />,
  wave: <path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0" />,
  nodes: (<><circle cx="6" cy="7" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="12" cy="17" r="2" /><path d="M8 7h8M7 9l4 6M17 9l-4 6" /></>),
}

export function Glyph({ name = 'circle', size = 16, stroke = 1.25, className, style }: { name?: string; size?: number; stroke?: number; className?: string; style?: CSSProperties }) {
  const key = name.replace(/^sigil:/, '')
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      {SIGILS[key] ?? SIGILS.circle}
    </svg>
  )
}

/** The ochre-ringed disc: a numeral (pass `number`) or a mark (pass `icon`). Tone `accent` fills it, `dark` is for dark bands. */
export function Seal({ icon = 'circle', number, size, tone = 'subtle', label, className }: { icon?: string; number?: number | string; size?: number; tone?: 'subtle' | 'accent' | 'dark'; label?: string; className?: string }) {
  const disc = (
    <span className={['dz-seal', className].filter(Boolean).join(' ')} data-tone={tone === 'subtle' ? undefined : tone} style={size ? ({ '--dz-seal': `${size}px`, '--dz-seal-fs': `${Math.round(size * 0.44)}px` } as CSSProperties) : undefined} aria-hidden={label ? undefined : true}>
      {number != null ? number : <Glyph name={icon} size={Math.round((size ?? 48) * 0.38)} />}
    </span>
  )
  if (!label) return disc
  return <span className="dz-seal-set">{disc}<span className="dz-seal-label">{label}</span></span>
}

const ORNAMENT: Record<string, string[]> = { star: ['+'], moon: ['·', '●', '·'], dots: ['·', '·', '·'], eye: ['◯'], none: [] }

/** A fading hairline with one centred mark. The Designer signature is a quiet ochre "+", echoing "Build + Design". Once or twice a page. */
export function Ornament({ glyph = 'star', label, width = '100%', className }: { glyph?: keyof typeof ORNAMENT; label?: string; width?: string; className?: string }) {
  return (
    <div role="separator" className={['dz-orn', className].filter(Boolean).join(' ')} style={{ '--dz-orn-w': width } as CSSProperties}>
      <span className="dz-orn-line" />
      <span className="dz-orn-mark">
        {(ORNAMENT[glyph] ?? ORNAMENT.star).map((g, i) => <span key={i} data-g={g}>{g}</span>)}
        {label && <span className="dz-orn-label">{label}</span>}
      </span>
      <span className="dz-orn-line" data-end="" />
    </div>
  )
}
