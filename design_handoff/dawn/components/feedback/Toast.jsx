import React from 'react'

/**
 * Toast — a transient achievement / status notice (The Quest awards, "saved",
 * "you earned 5 zaps"). Soft elevated surface, amber accent rail, slide-up
 * entrance (`slideUp` keyframes). Tones tint the icon + rail.
 */
export function Toast({ icon, title, children, tone = 'primary', onClose, className = '', style }) {
  const railColor = {
    primary: 'var(--color-primary)',
    success: 'var(--color-success)',
    broadcast: 'var(--color-broadcast)',
    danger: 'var(--color-danger)',
  }[tone] || 'var(--color-primary)'
  return (
    <div
      className={className}
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '0.85rem',
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderLeft: `3px solid ${railColor}`,
        borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)',
        padding: '0.9rem 1rem', minWidth: '17rem', maxWidth: '22rem',
        animation: 'slideUp 280ms cubic-bezier(0.22,1,0.36,1)',
        ...style,
      }}
    >
      {icon && (
        <span style={{ color: railColor, display: 'inline-flex', marginTop: 1, flexShrink: 0 }}>{icon}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-body-sm)', fontWeight: 800, color: 'var(--color-text)' }}>{title}</div>
        {children && (
          <div style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.5 }}>{children}</div>
        )}
      </div>
      {onClose && (
        <button
          type="button" aria-label="Dismiss" onClick={onClose}
          style={{ appearance: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: 2, lineHeight: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}
    </div>
  )
}
