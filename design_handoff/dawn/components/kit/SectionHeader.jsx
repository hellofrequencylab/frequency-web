import React from 'react'

/**
 * SectionHeader — how a group of things gets a name. This is the "group, don't
 * box" primitive: a title, an optional count and action, and spacing. No card,
 * no all-caps micro-label.
 */
export function SectionHeader({ title, count, action, onAction, className = '', style }) {
  return (
    <div className={className}
      style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.7rem', ...style }}>
      <h2 style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 8, fontSize: '1.05rem', fontWeight: 'var(--weight-heading)', letterSpacing: 'var(--tracking-tight)' }}>
        {title}
        {count != null ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--color-text-subtle)' }}>{count}</span> : null}
      </h2>
      {action ? (
        <button onClick={onAction} style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 'var(--text-meta)', fontWeight: 700, color: 'var(--color-primary-strong)', padding: 0 }}>{action}</button>
      ) : null}
    </div>
  )
}
