import React from 'react'
import { Glyph } from '../core/Glyph.jsx'

// The four honest states for something that exists but is not on yet. Every one
// says what is true, and none of them pretend the thing is missing or broken.
const KINDS = {
  preview: { icon: 'eye', tone: 'broadcast', label: 'Preview' },
  gated:   { icon: 'clock', tone: 'primary',   label: 'Not on yet' },
  dormant: { icon: 'moon', tone: 'signal',    label: 'Built, waiting' },
  hold:    { icon: 'pause', tone: 'primary',  label: 'On hold' },
}

/**
 * GateNotice — how the product tells the truth about a dormant capability.
 * Billing is off in the beta, AI fails closed, SMS waits on registration: those
 * are states, not errors. The pattern: name the state, say what happens when it
 * turns on, and leave the surface browsable underneath.
 */
export function GateNotice({ kind = 'gated', title, children, action, inline = false, className = '', style }) {
  const k = KINDS[kind] || KINDS.gated
  const tone = `var(--color-${k.tone})`
  const bg = `var(--color-${k.tone}-bg)`
  const strong = `var(--color-${k.tone}-strong)`
  if (inline) {
    return (
      <span className={className} title={typeof children === 'string' ? children : undefined}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 'var(--radius-pill)',
          background: bg, color: strong, fontSize: 'var(--text-2xs)', fontWeight: 700, ...style }}>
        <Glyph name={k.icon} size={12} />{title || k.label}
      </span>
    )
  }
  return (
    <div className={className}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: bg, borderRadius: 'var(--radius-card)',
        padding: '0.95rem 1.1rem', ...style }}>
      <span style={{ width: 30, height: 30, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-control)',
        background: 'var(--color-surface)', color: strong }}>
        <Glyph name={k.icon} size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.98rem', fontWeight: 'var(--weight-heading)', letterSpacing: 'var(--tracking-tight)' }}>{title || k.label}</span>
          <span className="eyebrow" style={{ fontSize: 'var(--text-3xs)', color: strong }}>{k.label}</span>
        </div>
        {children ? (
          <p style={{ margin: '3px 0 0', fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--color-text-muted)', textWrap: 'pretty' }}>{children}</p>
        ) : null}
        {action ? <div style={{ marginTop: 11 }}>{action}</div> : null}
      </div>
    </div>
  )
}
