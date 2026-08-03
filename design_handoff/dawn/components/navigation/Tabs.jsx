import React from 'react'

/**
 * Tabs — the in-app DetailTemplate tab row (a circle's About/Feed/Events, a
 * profile's tabs). Underline-style, amber active marker, hairline base rule.
 * Controlled via `value` + `onChange`, or uncontrolled with `defaultValue`.
 */
export function Tabs({ tabs = [], value, defaultValue, onChange, className = '', style }) {
  const [internal, setInternal] = React.useState(defaultValue ?? (tabs[0] && (tabs[0].value ?? tabs[0])))
  const active = value !== undefined ? value : internal
  const norm = tabs.map((t) => (typeof t === 'string' ? { value: t, label: t } : t))
  const pick = (v) => { if (value === undefined) setInternal(v); onChange && onChange(v) }
  return (
    <div className={className} role="tablist" style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--color-border)', ...style }}>
      {norm.map((t) => {
        const on = t.value === active
        return (
          <button
            key={t.value} role="tab" aria-selected={on} onClick={() => pick(t.value)}
            style={{
              appearance: 'none', background: 'none', border: 'none', cursor: 'pointer',
              padding: '0 0 0.75rem', margin: 0,
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-sm)', fontWeight: 700,
              color: on ? 'var(--color-text)' : 'var(--color-text-subtle)',
              borderBottom: `2px solid ${on ? 'var(--color-primary)' : 'transparent'}`,
              marginBottom: -1, transition: 'color 140ms ease, border-color 140ms ease',
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            }}
          >
            {t.icon}
            {t.label}
            {t.count != null && (
              <span style={{ fontSize: 'var(--text-meta)', fontWeight: 700, color: on ? 'var(--color-primary-strong)' : 'var(--color-text-subtle)' }}>
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
