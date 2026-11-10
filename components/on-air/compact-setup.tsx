'use client'

// THE MINDLESS DOOR (LIVE-2241): one screen, two levels. The primary stack is Mode, What (a
// practice), How (a sub-mode), How long, Go. Under it, the sub-menus expand in place (Breath,
// Sound, Ambient, Feel) and a read-only Session footer. Nothing the sit engine can do sits
// behind a second screen any more; every setting is written to the one timer settings model
// (lib/on-air/timer-settings.ts) so the engine mounts with it. Get Moving keeps "More settings"
// until LIVE-2242 brings its Plan and Cues rows here. The look is the compact door the owner kept
// (2026-11-09); the new design drops onto the same props.

import { useId, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { useDialogFocusTrap } from '@/components/ui/use-dialog-focus-trap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { chipClasses } from '@/components/ui/chip'
import {
  BREATH_DURATION_PRESETS,
  DURATION_PRESETS,
  SESSION_MODE_META,
  SESSION_MODE_ORDER,
  engineForMode,
  modeForMindless,
  type OnAirPrefs,
  type SessionMode,
} from '@/lib/on-air'
import { isValidMemberMinutes, mergeTimerSettings, type TimerSettings, type TimerSettingsPatch } from '@/lib/on-air/timer-settings'
import { useTimerSettings } from './use-timer-settings'
import { StillSections } from './door/still-sections'
import { MindlessMasthead } from './mode-toggle'
import type { TimerMode } from './mindless'
import type { OnAirPractice } from './session'

export type SetupChoice = {
  practiceId: string
  mode: TimerMode
  minutesOverride?: number
  /** The Be Still sub-mode and breath pattern the member set on the door (LIVE-2241). */
  stillMode?: SessionMode
  patternSlug?: string
}

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

/** The Be Still sub-mode a practice opens on: Just Log for a log-only practice, its authored flavour,
 *  else Meditate (owner directive: a generic open never lands on Just Log). */
function stillModeFor(p: OnAirPractice | undefined, explicit: boolean): SessionMode {
  if (!p) return 'timer'
  if (p.timerKind === 'none') return explicit ? 'log' : 'timer'
  const resolved = modeForMindless(p.mindlessMode, 'timer')
  return resolved === 'log' && !explicit ? 'timer' : resolved
}

const MOVE_PRESETS = [3, 5, 10, 20] as const

/** Shared route/overlay setup. The existing engines own running, recovery, sound and logging. */
export function CompactSetup({
  practices,
  initialMode = 'still',
  initialPracticeId,
  explicitPracticeId,
  prefs,
  journeyLegs = [],
  practicedToday = 0,
  onStart,
  onAdvanced,
  onClose,
}: {
  practices: OnAirPractice[]
  initialMode?: TimerMode
  initialPracticeId?: string
  /** The practice this open explicitly asked for (a practice button), so a log-only one opens on Just Log. */
  explicitPracticeId?: string
  /** The member's server prefs; the settings model lays the local copy over them. */
  prefs?: Partial<OnAirPrefs> | null
  journeyLegs?: { planId: string; title: string; week: number | null; weeks: number }[]
  practicedToday?: number
  onStart: (choice: SetupChoice) => void
  onAdvanced: (choice: SetupChoice) => void
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const howId = useId()
  useDialogFocusTrap(true, panel)
  const { initial, save } = useTimerSettings(prefs)
  const [settings, setSettings] = useState<TimerSettings>(initial)
  const set = (patch: TimerSettingsPatch) => {
    setSettings((s) => mergeTimerSettings(s, patch))
    save(patch)
  }
  const [mode, setMode] = useState(initialMode)
  const [pickedId, setPickedId] = useState(initialPracticeId)
  const [custom, setCustom] = useState<number | null>(null)
  const available = setupPractices(practices, mode)
  const practice = available.find((p) => p.id === pickedId) ?? available.find((p) => p.logsAs) ?? available[0]
  const [stillPick, setStillPick] = useState<SessionMode | null>(null)
  const stillMode: SessionMode = stillPick ?? stillModeFor(practice, practice?.id === explicitPracticeId)
  const movementMode = practice?.movementConfig?.mode ?? 'walk'
  const structured = mode === 'move' && !['walk', 'run', 'stretch'].includes(movementMode)
  const logOnly = mode === 'still' ? stillMode === 'log' : practice?.timerKind === 'none'
  const locked = (!!practice?.durationLocked && (practice?.durationMin ?? 0) > 0) || structured || logOnly
  const configuredMinutes =
    practice?.durationMin ??
    (mode === 'move'
      ? movementMode === 'run'
        ? practice?.movementConfig?.runMinutes
        : movementMode === 'stretch'
          ? practice?.movementConfig?.stretchMinutes
          : practice?.movementConfig?.walkMinutes
      : null)
  const minutes = custom ?? configuredMinutes ?? (mode === 'move' ? 20 : settings.still.minutes)
  const valid = isValidMemberMinutes(minutes)
  const presets: readonly number[] = mode === 'move' ? MOVE_PRESETS : stillMode === 'breath' ? BREATH_DURATION_PRESETS : DURATION_PRESETS
  const stillExtras = mode === 'still' ? { stillMode, patternSlug: settings.still.patternSlug } : {}
  const choice = (p = practice): SetupChoice => ({
    practiceId: p!.id,
    mode,
    ...(!locked && p === practice && valid ? { minutesOverride: minutes } : {}),
    ...stillExtras,
  })
  const pickLength = (m: number) => {
    setCustom(m)
    // The open length is the member's own number: remembered the moment they choose it, never an
    // authored length (configuredMinutes) and never a locked one.
    if (mode === 'still' && !locked && configuredMinutes == null && isValidMemberMinutes(m)) set({ still: { minutes: m } })
  }
  const goLabel = logOnly ? 'Open practice' : 'Start timer'
  const runPractice = practice && !practice.logsAs ? practice : null
  return (
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1} className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div>
          <MindlessMasthead
            mode={mode}
            onModeChange={(next) => {
              setMode(next)
              setPickedId(undefined)
              setStillPick(null)
            }}
            onClose={onClose}
          />
        </div>
        <div className="flex items-center gap-5">
          <span className="fq-breathe h-16 w-16 shrink-0 rounded-pill bg-primary-bg motion-reduce:animate-none" aria-hidden style={{ background: 'var(--design-practice-orb)' }} />
          <div>
            <h1 id={headingId} className="text-display-card font-semibold text-text">{mode === 'move' ? 'Get Moving' : 'Tune out'}</h1>
            <p className="mt-1 text-body-sm text-muted">Your practice. A little room to begin.</p>
          </div>
        </div>
        <section aria-label="Your practices" className="space-y-2">
          <h2 className="text-body-sm font-semibold text-text">Quick start a practice</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {available.map((p) => (
              <Button
                variant={p.id === practice?.id ? 'primarySoft' : 'secondary'}
                key={p.id}
                type="button"
                aria-label={`Start ${p.title}`}
                aria-pressed={p.id === practice?.id}
                className={`min-h-11 shrink-0 flex-col items-start rounded-control border px-3 py-2 text-left text-body-sm ${p.id === practice?.id ? 'border-primary text-text' : 'border-border text-muted'}`}
                onClick={() => onStart({ practiceId: p.id, mode, ...(mode === 'still' ? { stillMode: stillModeFor(p, p.id === explicitPracticeId), patternSlug: settings.still.patternSlug } : {}) })}
              >
                <span className="block font-semibold">{p.title}</span>
                <span className="block text-meta">{[p.durationMin ? `${p.durationMin} min` : null, p.loggedToday ? 'Done today · Start again' : null].filter(Boolean).join(' · ') || 'Start now'}</span>
              </Button>
            ))}
          </div>
        </section>
        {mode === 'still' && (
          <section aria-labelledby={howId} className="space-y-2">
            <h2 id={howId} className="text-body-sm font-semibold text-text">How</h2>
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Sub-mode">
              {SESSION_MODE_ORDER.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={m === stillMode}
                  disabled={practice?.timerKind === 'none' && m !== 'log'}
                  onClick={() => {
                    setStillPick(m)
                  }}
                  className={chipClasses(m === stillMode, 'min-h-11 shrink-0 disabled:opacity-50')}
                >
                  {SESSION_MODE_META[m].label}
                </button>
              ))}
            </div>
            <p className="text-meta text-muted">{SESSION_MODE_META[stillMode].subline}</p>
          </section>
        )}
        <section className="space-y-3" aria-label="Custom timer">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-body-sm font-semibold text-text">{practice?.title ?? 'Custom timer'}</h2>
            <span className="text-meta text-muted">{logOnly ? 'Just Log' : structured ? 'Authored sequence' : locked ? 'Fixed duration' : 'Timer length'}</span>
          </div>
          {!logOnly && !structured && (
            <>
              <div className={`grid gap-2 ${presets.length === 3 ? 'grid-cols-3' : presets.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
                {presets.map((m) => (
                  <button key={m} type="button" disabled={locked} aria-pressed={m === minutes} onClick={() => pickLength(m)} className="min-h-11 rounded-control border border-border px-2 text-body-sm text-text disabled:opacity-50">
                    {m} min
                  </button>
                ))}
              </div>
              <label className="flex items-center justify-between gap-3 text-body-sm text-text">
                Custom minutes
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  step={1}
                  disabled={locked}
                  value={Number.isFinite(minutes) ? minutes : ''}
                  onChange={(e) => pickLength(e.target.value === '' ? NaN : Number(e.target.value))}
                  className="min-h-11 max-w-24 text-body"
                />
              </label>
              {!valid && <p role="alert" className="text-meta text-muted">Choose 1 to 120 minutes.</p>}
            </>
          )}
          {(logOnly || structured) && (
            <p className="text-body-sm text-muted">{logOnly ? 'Opens your practice note. Logging stays your choice.' : movementMode === 'play' ? 'An open count-up. Move until you stop.' : 'Keeps your practice’s rounds and intervals. Adjust them in More settings.'}</p>
          )}
        </section>
        {mode === 'still' && stillMode !== 'log' && (
          <StillSections settings={settings} set={set} breathMode={stillMode === 'breath'} timerMode={engineForMode(stillMode) === 'timer'} />
        )}
        {(runPractice || practicedToday >= 3) && (
          <section aria-label="Session" className="space-y-1 text-meta text-muted">
            {runPractice && journeyLegs.length > 0 && (
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-primary/30 bg-primary-bg/20 px-2.5 py-0.5 text-meta font-semibold text-primary-strong">
                <span className="truncate">
                  {journeyLegs[0].week != null ? `Week ${journeyLegs[0].week} of ${journeyLegs[0].weeks} · ${journeyLegs[0].title}` : `${journeyLegs[0].title} · all weeks open`}
                  {journeyLegs.length > 1 ? ` +${journeyLegs.length - 1} more` : ''}
                </span>
              </p>
            )}
            {runPractice && (
              <p className="flex min-w-0 items-center gap-1.5 text-body-sm text-text">
                <span className="shrink-0 text-subtle">Logs as</span>
                <span className="truncate font-semibold">{runPractice.title}</span>
                {runPractice.loggedToday && <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />}
              </p>
            )}
            {runPractice?.loggedToday && <p>Already counted today. This one is extra.</p>}
            {practicedToday >= 3 && <p>{practicedToday} members practiced today.</p>}
          </section>
        )}
        <div className="mt-auto space-y-2 pt-2">
          <Button type="button" disabled={!practice || (!locked && !valid)} className="min-h-11 w-full rounded-control px-4 py-3 text-body-sm font-semibold disabled:opacity-50" onClick={() => onStart(choice())}>
            {goLabel}
          </Button>
          {mode === 'move' && (
            <Button type="button" variant="ghost" disabled={!practice} className="w-full" onClick={() => onAdvanced(choice())}>
              More settings
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
