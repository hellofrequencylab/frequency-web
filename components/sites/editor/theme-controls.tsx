'use client'

import { useState } from 'react'
import { k, on } from './skin'
import { hasNewDials, matchLook, type Dial, type LookPreset } from '@/lib/theme/dials'

// THEME CONTROLS (LIVE-1997, docs/design-systems/services/). ONE component draws every theme's dials from the registry
// (lib/theme/dials.ts) and the theme's manifest: Simple (accent, register) always visible, Advanced (grouped, one Reset)
// one tap down, Looks as cards at the top of Advanced. It holds no theme-specific code: a theme that does not vary on a
// dial has it `fixed` and the row is not drawn. It only ever calls `onChange`, `onPreset` and `onReset`; the caller
// owns storage, undo and the live preview, so a dial change repaints by writing a value and nothing here reloads.
// Colours come from the editor's own tokens and from the swatch data the theme supplies, never a literal.
// Kit is applied through the starter-kit flow (KitLibrary), not here.

export interface AccentChoice { id: string; label: string; /** CSS colour of the swatch, from the theme's contract. */ swatch: string }

export interface ThemeControlsProps {
  /** The dials this theme varies on (dialsFor). The panel draws nothing when none is beyond the four legacy dials. */
  dials: readonly Dial[]
  /** The resolved value of each enumerated dial now. */
  values: Readonly<Record<string, string>>
  /** The theme's own value of each (what "Reset to theme" returns to). */
  own: Readonly<Record<string, string>>
  looks: readonly LookPreset[]
  /** The theme's named accents, and the accent now: an id, a #rrggbb, or null for the theme's own. */
  accents?: readonly AccentChoice[]
  accent: string | null
  /** A dial changed. `null` means "the theme's own" (the value equalled the default, so nothing is stored). */
  onChange: (id: string, value: string | null) => void
  /** Accent changed: a swatch id, a custom #rrggbb, or null for the theme's own. */
  onAccent: (value: string | null) => void
  /** A Look was picked: every dial it names changes in ONE step; the rest return to the theme's own. */
  onPreset: (look: LookPreset) => void
  onReset: () => void
  /** `bar` is the compact flush bar floated over the preview; `panel` is the Theme tab. */
  variant?: 'panel' | 'bar'
}

const GROUPS = ['Shape', 'Type', 'Motion', 'Layout', 'Order'] as const
const HEX = /^#[0-9a-fA-F]{6}$/

export function ThemeControls({ dials, values, own, looks, accents = [], accent, onChange, onAccent, onPreset, onReset, variant = 'panel' }: ThemeControlsProps) {
  const [open, setOpen] = useState(false)
  if (!hasNewDials(dials)) return null
  const has = (id: string) => dials.some((d) => d.id === id)
  const advanced = dials.filter((d) => d.tier === 'advanced' || d.tier === 'theme')
  const changed = advanced.some((d) => values[d.id] !== own[d.id]) || (has('register') && values.register !== own.register) || accent !== null
  const current = matchLook(looks, values, own)
  const bar = variant === 'bar'

  const choices = (d: Dial) => (
    <div key={d.id} className={k('we-field')}>
      <span title={d.note}>{d.label}{d.fromTheme ? <small> · {d.fromTheme}</small> : null}</span>
      <div className={k('we-choice-row')} role="radiogroup" aria-label={d.label}>
        {d.options.map((o) => {
          const checked = values[d.id] === o.id
          return <button type="button" role="radio" aria-checked={checked} key={o.id} className={k('we-action secondary') + on(checked)} onClick={() => onChange(d.id, o.id === own[d.id] ? null : o.id)}>{o.label}</button>
        })}
      </div>
    </div>
  )

  const register = dials.find((d) => d.id === 'register')
  return (
    <div className={k('we-theme-controls')} data-variant={variant}>
      {has('accent') && accents.length > 0 && (
        <>
          {!bar && <div className={k('we-caption')}>Accent</div>}
          <div className={k('we-swatch-list')} role="radiogroup" aria-label="Accent">
            <button type="button" role="radio" aria-checked={accent === null} aria-label="Theme accent" title="Theme accent" data-swatch="theme" className={k('we-swatch') + on(accent === null)} onClick={() => onAccent(null)} />
            {accents.map((a) => <button type="button" role="radio" aria-checked={accent === a.id} key={a.id} aria-label={`${a.label} accent`} title={a.label} className={k('we-swatch') + on(accent === a.id)} style={{ background: a.swatch }} onClick={() => onAccent(a.id)} />)}
            <label className={k('swatch-pick')} title="Pick a colour">
              <span className="sr-only">Pick a custom accent colour</span>
              {/* token-ok: a native colour input can only hold a hex value */}
              <input type="color" value={accent && HEX.test(accent) ? accent : '#808080'} onChange={(e) => onAccent(e.target.value)} />
            </label>
          </div>
        </>
      )}
      {register && (
        <>
          {!bar && <div className={k('we-caption')}>{register.label}</div>}
          <div className={k('we-choice-row')} role="radiogroup" aria-label={register.label}>
            {register.options.map((o) => {
              const checked = values.register === o.id
              return <button type="button" role="radio" aria-checked={checked} key={o.id} className={k('we-action secondary') + on(checked)} onClick={() => onChange('register', o.id === own.register ? null : o.id)}>{o.label}</button>
            })}
          </div>
        </>
      )}
      {advanced.length > 0 && (
        <>
          <button type="button" className={k('we-action secondary')} aria-expanded={open} onClick={() => setOpen(!open)}>
            More{changed && !open ? <i aria-label="Changed from the theme" data-changed /> : null}
          </button>
          {open && (
            <div role="dialog" aria-label="Advanced controls" className={k('we-theme-advanced')}>
              {looks.length > 0 && (
                <>
                  <div className={k('we-caption')}>Looks<small>{current === 'edited' ? ' · Edited' : ''}</small></div>
                  <div className={k('we-choice-row')} role="radiogroup" aria-label="Looks">
                    {looks.map((l) => <button type="button" role="radio" aria-checked={current === l.id} key={l.id} className={k('we-action secondary') + on(current === l.id)} onClick={() => onPreset(l)}>{l.label}</button>)}
                  </div>
                </>
              )}
              <div className={k('we-caption')}>Advanced{changed && <button type="button" onClick={onReset}>Reset to theme</button>}</div>
              {GROUPS.map((g) => {
                const rows = advanced.filter((d) => d.group === g)
                return rows.length ? <section key={g} aria-label={g}>{rows.map(choices)}</section> : null
              })}
              {advanced.filter((d) => d.group && !(GROUPS as readonly string[]).includes(d.group)).map(choices)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
