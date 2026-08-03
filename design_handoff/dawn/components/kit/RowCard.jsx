import React from 'react'
import { Glyph } from '../core/Glyph.jsx'

/**
 * RowCard — one item in a list. Borderless by default: a leading glyph or date
 * square, a title, a meta line, an optional trailing value, separated from its
 * neighbours by a hairline. This is what a list uses instead of a card each.
 */
export function RowCard({ icon, date, avatar, title, meta, trailing, accent = 'primary', divider = true, onClick, className = '', style }) {
  const [hover, setHover] = React.useState(false)
  const toneStrong = `var(--color-${accent}-strong)`
  const toneBg = `var(--color-${accent}-bg)`
  return (
    <div className={className} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.6rem 0.5rem',
        boxSizing: 'border-box', width: '100%', borderRadius: 'var(--radius-control)',
        borderBottom: divider ? '1px solid var(--color-border)' : 'none',
        background: hover && onClick ? 'var(--color-surface)' : 'transparent',
        cursor: onClick ? 'pointer' : 'default', transition: 'background var(--motion-fast) ease', ...style }}>
      {date ? (
        <div style={{ width: 44, flexShrink: 0, textAlign: 'center', borderRadius: 'var(--radius-control)', background: toneBg, padding: '4px 0' }}>
          <div className="eyebrow" style={{ fontSize: 'var(--text-3xs)', color: toneStrong }}>{date.mon}</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.1, color: toneStrong }}>{date.day}</div>
        </div>
      ) : avatar ? avatar : icon ? (
        <span style={{ width: 32, height: 32, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-control)', background: toneBg, color: toneStrong }}>
          <Glyph name={icon} size={16} />
        </span>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 600, letterSpacing: 'var(--tracking-tight)', color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {meta ? <div style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>{meta}</div> : null}
      </div>
      {trailing ? <div style={{ flexShrink: 0, fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>{trailing}</div> : null}
    </div>
  )
}
