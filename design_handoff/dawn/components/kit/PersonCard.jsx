import React from 'react'

/**
 * PersonCard — a member as an object: avatar, name, role chip, the one line that
 * says who they are, and an action. Role chips appear only where they carry
 * signal (leadership and the system voice), never for member or crew.
 */
export function PersonCard({ avatar, name, handle, role, line, rank, action, className = '', style }) {
  const signal = role === 'Host' || role === 'Guide' || role === 'Mentor'
  return (
    <div className={className}
      style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--color-surface)',
        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '0.8rem 0.9rem', ...style }}>
      {avatar}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.98rem', fontWeight: 'var(--weight-heading)', letterSpacing: 'var(--tracking-tight)' }}>{name}</span>
          {role ? (
            <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '1px 8px', borderRadius: 'var(--radius-pill)',
              background: signal ? 'var(--color-signal-bg)' : 'var(--color-surface-elevated)',
              color: signal ? 'var(--color-signal-strong)' : 'var(--color-text-muted)',
              border: `1px solid ${signal ? 'color-mix(in srgb, var(--color-signal) 26%, transparent)' : 'var(--color-border)'}` }}>{role}</span>
          ) : null}
          {rank}
        </div>
        {(handle || line) ? (
          <div style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {handle ? `@${handle}` : ''}{handle && line ? ' · ' : ''}{line}
          </div>
        ) : null}
      </div>
      {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
    </div>
  )
}
