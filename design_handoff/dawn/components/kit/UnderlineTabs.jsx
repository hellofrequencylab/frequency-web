import React from 'react'

/**
 * UnderlineTabs — the ONE tab vocabulary in the system. Pill tabs do not exist.
 * The active tab carries an amber underline that sits on the section hairline, so
 * the rule reads as one continuous line broken by the selection.
 */
export function UnderlineTabs({ tabs = [], value, onChange, className = '', style }) {
  return (
    <div className={className} role="tablist"
      style={{ display: 'flex', gap: '1.35rem', borderBottom: '1px solid var(--color-border)', ...style }}>
      {tabs.map((t) => {
        const id = typeof t === 'string' ? t : t.id
        const label = typeof t === 'string' ? t : t.label
        const count = typeof t === 'string' ? undefined : t.count
        const on = id === value
        return (
          <button key={id} role="tab" aria-selected={on} onClick={() => onChange && onChange(id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 0 0.7rem', border: 'none', background: 'none',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem', fontWeight: on ? 700 : 500,
              color: on ? 'var(--color-text)' : 'var(--color-text-muted)', boxShadow: on ? 'inset 0 -2px 0 var(--color-primary)' : 'none',
              marginBottom: -1, transition: 'color var(--motion-fast) ease' }}>
            {label}
            {count != null ? (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                background: on ? 'var(--color-primary-bg)' : 'var(--color-surface-elevated)',
                color: on ? 'var(--color-primary-strong)' : 'var(--color-text-muted)' }}>{count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
