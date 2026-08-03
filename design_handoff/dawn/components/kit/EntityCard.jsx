import React from 'react'
import { Glyph } from '../core/Glyph.jsx'

/**
 * EntityCard — a card because it IS a distinct object: a Circle, an event, a
 * Journey, a Space. Optional cover, an eyebrow, a title, a line of meta, and a
 * footer slot. Never use it for a row in a list.
 */
export function EntityCard({ cover, icon, eyebrow, title, meta, children, footer, accent = 'primary', hover = true, className = '', style }) {
  const [lift, setLift] = React.useState(false)
  const tone = `var(--color-${accent})`
  const toneStrong = `var(--color-${accent}-strong)`
  const toneBg = `var(--color-${accent}-bg)`
  return (
    <article className={className}
      onMouseEnter={() => hover && setLift(true)} onMouseLeave={() => setLift(false)}
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: lift ? 'var(--shadow-md)' : 'var(--shadow-2xs)',
        transition: 'box-shadow var(--motion-base) ease', ...style }}>
      {cover ? (
        <div style={{ height: 132, position: 'relative', flexShrink: 0 }}>
          <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      ) : null}
      <div style={{ padding: '0.95rem 1rem 1rem', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {icon ? (
            <span style={{ width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-control)', background: toneBg, color: toneStrong }}>
              <Glyph name={icon} size={17} />
            </span>
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            {eyebrow ? <p className="eyebrow" style={{ margin: '0 0 2px', fontSize: 'var(--text-2xs)', color: toneStrong }}>{eyebrow}</p> : null}
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'var(--weight-heading)', letterSpacing: 'var(--tracking-tight)', lineHeight: 1.25 }}>{title}</h3>
            {meta ? <p style={{ margin: '2px 0 0', fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>{meta}</p> : null}
          </div>
        </div>
        {children ? <div style={{ marginTop: 10, fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--color-text-muted)', textWrap: 'pretty' }}>{children}</div> : null}
        {footer ? (
          <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>{footer}</div>
        ) : null}
      </div>
    </article>
  )
}
