import React from 'react'

/**
 * EmptyState — a warm, encouraging empty surface (no circles yet, no events
 * near you). Icon chip + title + one line of guidance + optional CTA. Never a
 * cold "No data"; always points to the next human action.
 */
export function EmptyState({ icon, title, children, action, className = '', style }) {
  return (
    <div
      className={className}
      style={{
        textAlign: 'center', padding: '3rem 1.5rem', maxWidth: '26rem',
        marginInline: 'auto', ...style,
      }}
    >
      {icon && (
        <div
          style={{
            width: 56, height: 56, borderRadius: 'var(--radius-xl)',
            background: 'var(--color-primary-bg)', color: 'var(--color-primary-strong)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '1.1rem',
          }}
        >
          {icon}
        </div>
      )}
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text)' }}>
        {title}
      </h3>
      {children && (
        <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          {children}
        </p>
      )}
      {action && <div style={{ marginTop: '1.4rem' }}>{action}</div>}
    </div>
  )
}
