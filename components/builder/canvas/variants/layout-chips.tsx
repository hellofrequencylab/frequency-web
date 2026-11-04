'use client'

// LAYOUT CHIPS (BLD-203; spec docs/design/frequency-builder-v3/block-editor-spec.md §3). The selected role section's layouts,
// each a chip with its sketch. The one in use is pressed. A chip whose needs the section does not meet stays visible,
// says why, and its button goes to the field that fills it instead of switching. Picking a chip pins it ("Keep this
// layout when the theme changes" turns on); turning that off hands the layout back to the theme. What the chips show
// comes from lib/builder/variants.ts, so this file never names a role.

import { Pin } from 'lucide-react'
import { layoutChips, pinLayout, unpinLayout } from '@/lib/builder/variants'
import { LayoutThumb } from './thumbs'
import styles from './layout-chips.module.css'

type Props = Record<string, unknown>

export function LayoutChips({ type, props, theme, onChange, onFill }: {
  type: string
  props: Props
  theme: unknown
  /** One patch, so a pick or an unpin is one undo step. */
  onChange: (patch: Props) => void
  /** Open the field a blocked chip needs. */
  onFill: (field: string) => void
}) {
  const model = layoutChips(type, props, theme)
  if (!model || model.chips.length < 2) return null
  const themeLabel = model.chips.find((c) => c.id === model.themeDefault)?.label ?? model.themeDefault
  return (
    <section className={styles.layout} aria-labelledby="builder-layout-head">
      <h3 id="builder-layout-head" className={styles.head}>Layout{model.pinned && <span className={styles.pin}><Pin size={12} aria-hidden />Kept</span>}</h3>
      <div className={styles.chips} role="group" aria-labelledby="builder-layout-head">
        {model.chips.map((chip) => (
          <button key={chip.id} type="button" className={styles.chip} data-chip={chip.id} aria-pressed={chip.current}
            aria-disabled={chip.blocked ? true : undefined}
            aria-label={`${chip.label}${chip.current ? ', in use' : ''}${chip.blocked ? `, ${chip.blocked.say}` : ''}`}
            onClick={() => (chip.blocked ? onFill(chip.blocked.field) : chip.current && model.pinned ? undefined : onChange(pinLayout(chip.id)))}>
            <LayoutThumb name={chip.thumb} />
            <span className={styles.label}>{chip.label}{chip.blocked && <small>{chip.blocked.say.charAt(0).toUpperCase() + chip.blocked.say.slice(1)}</small>}{chip.current && !chip.blocked && <small>In use</small>}</span>
          </button>
        ))}
      </div>
      <div className={styles.keep}>
        <button type="button" role="switch" aria-checked={model.pinned} aria-label="Keep this layout when the theme changes" className={styles.switch} onClick={() => onChange(model.pinned ? unpinLayout() : pinLayout(model.current))}><i aria-hidden /></button>
        <span aria-hidden>Keep this layout when the theme changes{!model.pinned && <small>Now following the theme: {themeLabel}</small>}</span>
      </div>
    </section>
  )
}
