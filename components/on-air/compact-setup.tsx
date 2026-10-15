'use client'

import { useId, useRef, useState } from 'react'
import { useDialogFocusTrap } from '@/components/ui/use-dialog-focus-trap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { MindlessMasthead } from './mode-toggle'
import type { TimerMode } from './mindless'
import type { OnAirPractice } from './session'

export type SetupChoice = { practiceId: string; mode: TimerMode; minutesOverride?: number }
export function setupPractices(practices: OnAirPractice[], mode: TimerMode) {
  let free = false
  return practices.filter((p) => {
    if ((p.timerKind === 'movement') !== (mode === 'move')) return false
    if (!p.logsAs) return true
    if (free) return false
    free = true
    return true
  })
}

/** Shared route/overlay setup. The existing engines own running, recovery, sound and logging. */
export function CompactSetup({ practices, initialMode = 'still', initialPracticeId, rememberedMinutes = 10, onStart, onAdvanced, onClose }: {
  practices: OnAirPractice[]
  initialMode?: TimerMode
  initialPracticeId?: string
  rememberedMinutes?: number
  onStart: (choice: SetupChoice) => void
  onAdvanced: (choice: SetupChoice) => void
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const headingId = useId()
  useDialogFocusTrap(true, panel)
  const [mode, setMode] = useState(initialMode)
  const [pickedId, setPickedId] = useState(initialPracticeId)
  const [custom, setCustom] = useState<number | null>(null)
  const available = setupPractices(practices, mode)
  const practice = available.find((p) => p.id === pickedId) ?? available.find((p) => p.logsAs) ?? available[0]
  const movementMode = practice?.movementConfig?.mode ?? 'walk'
  const structured = mode === 'move' && !['walk', 'run', 'stretch'].includes(movementMode)
  const logOnly = practice?.timerKind === 'none' || practice?.mindlessMode === 'log'
  const locked = (!!practice?.durationLocked && (practice?.durationMin ?? 0) > 0) || structured || logOnly
  const configuredMinutes = practice?.durationMin ?? (mode === 'move' ? movementMode === 'run' ? practice?.movementConfig?.runMinutes : movementMode === 'stretch' ? practice?.movementConfig?.stretchMinutes : practice?.movementConfig?.walkMinutes : null)
  const minutes = custom ?? configuredMinutes ?? (mode === 'move' ? 20 : rememberedMinutes)
  const valid = Number.isInteger(minutes) && minutes >= 1 && minutes <= 120
  const choice = (p = practice): SetupChoice => ({ practiceId: p!.id, mode, ...(!locked && p === practice && valid ? { minutesOverride: minutes } : {}) })
  return (
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1} className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div><MindlessMasthead mode={mode} onModeChange={(next) => { setMode(next); setPickedId(undefined); setCustom(null) }} onClose={onClose} /></div>
        <div className="flex items-center gap-5">
          <span className="fq-breathe h-16 w-16 shrink-0 rounded-pill bg-primary-bg motion-reduce:animate-none" aria-hidden style={{ background: 'var(--fq-pa-orb)' }} />
          <div><h1 id={headingId} className="text-display-card font-semibold text-text">{mode === 'move' ? 'Get Moving' : 'Tune out'}</h1><p className="mt-1 text-body-sm text-muted">Your practice. A little room to begin.</p></div>
        </div>
        <section aria-label="Your practices" className="space-y-2">
          <h2 className="text-body-sm font-semibold text-text">Quick start a practice</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {available.map((p) => <Button variant={p.id === practice?.id ? 'primarySoft' : 'secondary'} key={p.id} type="button" aria-label={`Start ${p.title}`} aria-pressed={p.id === practice?.id} className={`min-h-11 shrink-0 flex-col items-start rounded-control border px-3 py-2 text-left text-body-sm ${p.id === practice?.id ? 'border-primary text-text' : 'border-border text-muted'}`} onClick={() => onStart({ practiceId: p.id, mode })}><span className="block font-semibold">{p.title}</span><span className="block text-meta">{[p.durationMin ? `${p.durationMin} min` : null, p.loggedToday ? 'Done today · Start again' : null].filter(Boolean).join(' · ') || 'Start now'}</span></Button>)}
          </div>
        </section>
        <section className="space-y-3" aria-label="Custom timer">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-body-sm font-semibold text-text">{practice?.title ?? 'Custom timer'}</h2><span className="text-meta text-muted">{logOnly ? 'Just Log' : structured ? 'Authored sequence' : locked ? 'Fixed duration' : 'Timer length'}</span></div>
          {!logOnly && !structured && <>
            <div className="grid grid-cols-4 gap-2">{[3, 5, 10, 20].map((m) => <button key={m} type="button" disabled={locked} aria-pressed={m === minutes} onClick={() => setCustom(m)} className="min-h-11 rounded-control border border-border px-2 text-body-sm text-text disabled:opacity-50">{m} min</button>)}</div>
            <label className="flex items-center justify-between gap-3 text-body-sm text-text">Custom minutes<Input type="number" inputMode="numeric" min={1} max={120} step={1} disabled={locked} value={Number.isFinite(minutes) ? minutes : ''} onChange={(e) => setCustom(e.target.value === '' ? NaN : Number(e.target.value))} className="min-h-11 max-w-24 text-body" /></label>
            {!valid && <p role="alert" className="text-meta text-muted">Choose 1 to 120 minutes.</p>}
          </>}
          {(logOnly || structured) && <p className="text-body-sm text-muted">{logOnly ? 'Opens your practice note. Logging stays your choice.' : 'Keeps your practice’s rounds and intervals. Adjust them in More settings.'}</p>}
        </section>
        <div className="mt-auto space-y-2 pt-2">
          <Button type="button" disabled={!practice || (!locked && !valid)} className="min-h-11 w-full rounded-control px-4 py-3 text-body-sm font-semibold disabled:opacity-50" onClick={() => onStart(choice())}>{logOnly ? 'Open practice' : 'Start timer'}</Button>
          <button type="button" disabled={!practice} className="min-h-11 w-full rounded-control text-body-sm text-muted" onClick={() => onAdvanced(choice())}>More settings</button>
        </div>
      </div>
    </div>
  )
}
