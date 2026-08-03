import React from 'react'

/**
 * PageHeading — the ONE header grammar. Every template opens with it, so no page
 * hand-rolls its own title block. Eyebrow rides the grotesk; the title is the
 * heading weight (700, tracked in), never extra-bold.
 */
export function PageHeading({ eyebrow, title, subtitle, actions, size = 'page', className = '', style }) {
  const fs = size === 'section' ? '1.35rem' : size === 'hero' ? '2.3rem' : '1.9rem'
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', ...style }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? <p className="eyebrow" style={{ margin: 0, color: 'var(--color-primary-strong)' }}>{eyebrow}</p> : null}
        <h1 style={{ margin: eyebrow ? '0.4rem 0 0' : 0, fontSize: fs, fontWeight: 'var(--weight-heading)', letterSpacing: 'var(--tracking-tight-display)', lineHeight: 1.15 }}>{title}</h1>
        {subtitle ? <p style={{ margin: '0.35rem 0 0', fontSize: '0.98rem', color: 'var(--color-text-muted)', maxWidth: '46rem', textWrap: 'pretty' }}>{subtitle}</p> : null}
      </div>
      {actions ? <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div> : null}
    </div>
  )
}
