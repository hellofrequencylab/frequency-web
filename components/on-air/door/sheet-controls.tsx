'use client'

// The phone door's controls (LIVE-2406, the Claude Design timer of 2026-11-18, direction A): every
// choice is a row of pill chips under a small caps label, numbers that step are three tiles in a
// row, and everything past style and length (practice, sound, ambient, countdown, vibration) sits
// behind one "Practice, sound and options" link so the door opens on length and Start. Each control
// writes the same settings model as the web dialog; nothing here is a new setting. Tokens only.

import type { ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { AMBIENT_TRACKS, BELL_INTERVALS, BREATH_PATTERNS, CUSTOM_PHASE_MAX, CUSTOM_PHASE_MIN, WARMUP_PRESETS } from '@/lib/on-air'
import { STRENGTH_PRESETS, YOGA_PRESETS, clampRounds, clampSeconds, type MovementConfig, type StrengthPresetKind } from '@/lib/movement'
import type { TimerSettings, TimerSettingsPatch } from '@/lib/on-air/timer-settings'
import { Slider } from './door-section'
import { bellOptions, pct, pickBell, type CueScope, type DoorAudio } from './cue-sections'
import { NOTE_MAX, currentPattern } from './still-sections'
import { describePlan } from './move-sections'

type Set = (patch: TimerSettingsPatch) => void
export type ChipOption<V> = { value: V; label: string; aria?: string; disabled?: boolean }

const CHIP = 'flex h-11 shrink-0 items-center whitespace-nowrap rounded-pill px-3.5 text-body-sm font-medium tabular-nums transition-colors disabled:opacity-40'
const CHIP_ON = 'bg-text text-surface'
const CHIP_OFF = 'bg-surface/50 text-text ring-1 ring-inset ring-border-strong'

/** A labelled set of pill chips; `scroll` keeps them on one line that scrolls sideways (Style). */
export function ChipGroup<V extends string | number | null>({ label, caption = label, aside, value, options, onChange, scroll = false }: { label: string; caption?: string; aside?: ReactNode; value: V; options: readonly ChipOption<V>[]; onChange: (v: V) => void; scroll?: boolean }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow text-muted">{caption}</span>
        {aside}
      </div>
      <div role="group" aria-label={label} className={scroll ? '-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]' : 'flex flex-wrap gap-2'}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" aria-pressed={o.value === value} aria-label={o.aria} disabled={o.disabled} onClick={() => onChange(o.value)} className={`${CHIP} ${o.value === value ? CHIP_ON : CHIP_OFF}`}>
            {o.label}
          </button>
        ))}
      </div>
    </section>
  )
}

const onOff = [
  { value: true, label: 'On' },
  { value: false, label: 'Off' },
] as const

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <ChipGroup label={label} value={value ? 'on' : 'off'} options={onOff.map((o) => ({ value: o.value ? 'on' : 'off', label: o.label }))} onChange={(v) => onChange(v === 'on')} />
}

/** One stepping number: its label, the value, minus and plus. Three sit in a row. */
function StepTile({ label, value, onLess, onMore, lessDisabled, moreDisabled }: { label: string; value: string; onLess: () => void; onMore: () => void; lessDisabled?: boolean; moreDisabled?: boolean }) {
  const btn = 'flex h-11 flex-1 items-center justify-center text-text disabled:opacity-30'
  return (
    <div className="flex min-w-0 flex-col items-center rounded-[16px] bg-surface-elevated pt-3">
      <span className="text-meta font-medium text-muted">{label}</span>
      <span className="mt-1 font-display text-card-title font-medium tabular-nums text-text">{value}</span>
      <div className="flex w-full">
        <button type="button" aria-label={`${label} down`} disabled={lessDisabled} onClick={onLess} className={btn}>
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" aria-label={`${label} up`} disabled={moreDisabled} onClick={onMore} className={btn}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}

const Line = ({ children }: { children: ReactNode }) => <p className="serif m-0 text-body-lg leading-snug text-muted">{children}</p>

/** The controls the chosen style needs, straight under Length: the breath pattern, the Yoga or
 *  Strength plan, the Walk, Run or Stretch cue, and the note. */
export function StyleControls({
  settings,
  set,
  breath,
  note,
  onNote,
  config,
  onConfig,
  cue,
  locked,
}: {
  settings: TimerSettings
  set: Set
  /** Be Still on Breathe. */
  breath: boolean
  /** The note field shows for Journal and Just Log; null hides it. */
  note: string | null
  onNote: (v: string) => void
  /** The Get Moving plan, or null on Be Still. */
  config: MovementConfig | null
  onConfig: (next: MovementConfig) => void
  cue: CueScope['cue'] | undefined
  locked: boolean
}) {
  const still = settings.still
  const plan = config ? describePlan(config) : null
  const strengthKind = (config?.strengthKind ?? config?.workoutKind ?? 'tabata') as StrengthPresetKind
  const work = config?.workSec ?? 20
  const rest = config?.restSec ?? 0
  const rounds = config?.rounds ?? 8
  const custom = [
    { label: 'In', key: 'customIn' as const, min: CUSTOM_PHASE_MIN, value: still.customIn },
    { label: 'Hold', key: 'customHold' as const, min: 0, value: still.customHold },
    { label: 'Out', key: 'customOut' as const, min: CUSTOM_PHASE_MIN, value: still.customOut },
  ]
  return (
    <>
      {breath && (
        <>
          <ChipGroup label="Breath pattern" value={still.patternSlug} options={[...BREATH_PATTERNS.map((p) => ({ value: p.slug as string, label: p.name })), { value: 'custom', label: 'Custom' }]} onChange={(slug) => set({ still: { patternSlug: slug } })} />
          {still.patternSlug === 'custom' ? (
            <div className="grid grid-cols-3 gap-2">
              {custom.map((r) => (
                <StepTile key={r.key} label={r.label} value={r.key === 'customHold' && !r.value ? 'None' : `${r.value}s`} lessDisabled={r.value <= r.min} moreDisabled={r.value >= CUSTOM_PHASE_MAX} onLess={() => set({ still: { [r.key]: Math.max(r.min, r.value - 1) } })} onMore={() => set({ still: { [r.key]: Math.min(CUSTOM_PHASE_MAX, r.value + 1) } })} />
              ))}
            </div>
          ) : (
            <Line>{currentPattern(still).instructions}</Line>
          )}
          <Toggle label="Breath count" value={settings.cues.showBreathCount} onChange={(v) => set({ cues: { showBreathCount: v } })} />
        </>
      )}
      {config && plan && (
        <fieldset disabled={locked} className="flex min-w-0 flex-col gap-2.5 border-0 p-0 disabled:opacity-60">
          {config.mode === 'yoga' ? (
            <ChipGroup label="Plan" value={config.yogaKind ?? 'gentle'} options={YOGA_PRESETS.map((p) => ({ value: p.kind, label: p.label }))} onChange={(kind) => onConfig({ ...config, yogaKind: kind })} />
          ) : (
            <ChipGroup
              label="Plan"
              value={strengthKind}
              options={STRENGTH_PRESETS.map((p) => ({ value: p.kind, label: p.label }))}
              onChange={(kind) => {
                const p = STRENGTH_PRESETS.find((x) => x.kind === kind) ?? STRENGTH_PRESETS[0]
                onConfig({ ...config, strengthKind: kind, workoutKind: undefined, workSec: p.workSec, restSec: p.restSec, rounds: p.rounds })
              }}
            />
          )}
          {config.mode === 'strength' && (
            <div className="grid grid-cols-3 gap-2">
              <StepTile label="Work" value={`${work}s`} lessDisabled={work <= 5} moreDisabled={work >= 600} onLess={() => onConfig({ ...config, workSec: clampSeconds(work - 5, 5, 600) })} onMore={() => onConfig({ ...config, workSec: clampSeconds(work + 5, 5, 600) })} />
              <StepTile label="Rest" value={rest ? `${rest}s` : 'None'} lessDisabled={rest <= 0} moreDisabled={rest >= 600} onLess={() => onConfig({ ...config, restSec: Math.max(0, rest - 5) })} onMore={() => onConfig({ ...config, restSec: Math.min(600, rest + 5) })} />
              <StepTile label="Rounds" value={String(rounds)} lessDisabled={rounds <= 1} moreDisabled={rounds >= 99} onLess={() => onConfig({ ...config, rounds: clampRounds(rounds - 1) })} onMore={() => onConfig({ ...config, rounds: clampRounds(rounds + 1) })} />
            </div>
          )}
          <Line>{locked ? 'Set by your practice.' : `${plan.text}. ${plan.blurb}`}</Line>
        </fieldset>
      )}
      {cue && (
        <fieldset disabled={locked} className="min-w-0 border-0 p-0 disabled:opacity-60">
          <ChipGroup label={cue.label} value={cue.value} options={cue.options.map((o) => ({ value: o.value as number, label: o.value ? `Every ${o.value} min` : 'None' }))} onChange={cue.onChange} />
        </fieldset>
      )}
      {note !== null && (
        <section className="flex flex-col gap-2.5">
          <span className="eyebrow text-muted">Note</span>
          <Input variant="seamless" type="text" aria-label="Session note" placeholder="What happened? One line is plenty." maxLength={NOTE_MAX} value={note} onChange={(e) => onNote(e.target.value)} className="h-12 w-full rounded-[14px] border-0 bg-surface-elevated px-4 text-body text-text" />
        </section>
      )}
    </>
  )
}

/** Everything behind "Practice, sound and options". */
export function MoreOptions({ practices, settings, set, audio, scope }: { practices: readonly { id: string; label: string; on: boolean; pick: () => void }[]; settings: TimerSettings; set: Set; audio: DoorAudio; scope: CueScope }) {
  const cues = settings.cues
  const bellOn = cues[scope.flag]
  return (
    <>
      <ChipGroup caption="Practice" label="Your practices" value={practices.find((p) => p.on)?.id ?? ''} options={practices.map((p) => ({ value: p.id, label: p.label }))} onChange={(id) => practices.find((p) => p.id === id)?.pick()} />
      <ChipGroup label="Bell" value={bellOn ? cues.bellTone : 'off'} options={bellOptions()} onChange={(v) => pickBell(v, cues, scope, set, audio)} />
      {bellOn && <Slider label="Volume" min={0} max={100} value={Math.round(cues.bellVolume * 100)} text={pct(cues.bellVolume)} accent={scope.accent} onChange={(v) => set({ cues: { bellVolume: v / 100 } })} onCommit={(v) => audio.strike(cues.bellTone, v / 100)} />}
      {bellOn && scope.endBell && <Toggle label="End bell" value={cues.endBell} onChange={(v) => set({ cues: { endBell: v } })} />}
      {bellOn && scope.intervalBell && <ChipGroup label="Interval bell" value={cues.bellEveryMin} options={BELL_INTERVALS.map((iv) => ({ value: iv.value as number, label: iv.label }))} onChange={(v) => set({ cues: { bellEveryMin: v } })} />}
      {scope.ambient && (
        <>
          <ChipGroup
            label="Ambient"
            value={cues.ambientTrack}
            options={[{ value: null, label: 'Off' }, ...AMBIENT_TRACKS.map((t) => ({ value: t.slug as string | null, label: t.name }))]}
            onChange={(slug) => {
              set({ cues: { ambientTrack: slug } })
              audio.audition(slug, cues.ambientVolume)
            }}
          />
          {cues.ambientTrack && (
            <Slider
              label="Volume"
              min={0}
              max={100}
              value={Math.round(cues.ambientVolume * 100)}
              text={pct(cues.ambientVolume)}
              accent={scope.accent}
              onChange={(v) => {
                set({ cues: { ambientVolume: v / 100 } })
                audio.level(v / 100)
              }}
            />
          )}
        </>
      )}
      <ChipGroup label="Countdown" value={cues.warmupSec} options={WARMUP_PRESETS.map((w) => ({ value: w as number, label: `${w} sec` }))} onChange={(v) => set({ cues: { warmupSec: v } })} />
      <Toggle label="Vibration" value={cues.haptics} onChange={(v) => set({ cues: { haptics: v } })} />
    </>
  )
}
