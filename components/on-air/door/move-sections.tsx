'use client'

// The Get Moving settings of the Mindless door (LIVE-2242, redesigned under LIVE-2245): Plan (the
// Yoga flow, or the Strength shape with its work, rest and rounds), Cues (the Walk reminder, Run
// split or Stretch switch-sides chime) and the shared Sound and Feel. On a phone they are
// disclosure rows; on the web Plan is a section of the main column and the cues live in "Sound and
// feel". Every control exists in the movement engine; this is the same setting reached from the
// door, carried into the engine as its starting config.

import { Dumbbell, Flower2 } from 'lucide-react'
import { DialIcon } from '@/components/on-air/icons'
import {
  RUN_INTERVAL_PRESETS,
  STRENGTH_PRESETS,
  STRETCH_INTERVAL_PRESETS,
  WALK_INTERVAL_PRESETS,
  YOGA_PRESETS,
  buildPlan,
  clampRounds,
  clampSeconds,
  totalSeconds,
  type MovementConfig,
  type StrengthPresetKind,
} from '@/lib/movement'
import { moveIntervalMin, withMoveIntervalMin, type TimerSettings, type TimerSettingsPatch } from '@/lib/on-air/timer-settings'
import { MenuRow, RowLabel, Segmented, Stepper, WebSection } from './door-section'
import { FeelSection, SoundSection, type CueScope, type DoorAudio } from './cue-sections'

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** The plan in the design's words: "Tabata, 8 rounds, 4:00" / "Vinyasa, 12 poses, 9:50"; `short`
 *  drops the time for the orb line. */
export function describePlan(c: MovementConfig): { short: string; text: string; total: number; blurb: string } | null {
  if (c.mode === 'yoga') {
    const p = YOGA_PRESETS.find((y) => y.kind === c.yogaKind) ?? YOGA_PRESETS[2]
    const total = totalSeconds(buildPlan(c)) ?? 0
    const short = `${p.label}, ${p.poses} poses`
    return { short, text: `${short}, ${clock(total)}`, total, blurb: p.blurb }
  }
  if (c.mode === 'strength') {
    const kind = (c.strengthKind ?? c.workoutKind ?? 'tabata') as StrengthPresetKind
    const p = STRENGTH_PRESETS.find((s) => s.kind === kind) ?? STRENGTH_PRESETS[0]
    const rounds = c.rounds ?? p.rounds
    const total = totalSeconds(buildPlan(c)) ?? 0
    const short = `${p.label}, ${rounds} rounds`
    return { short, text: `${short}, ${clock(total)}`, total, blurb: p.blurb }
  }
  return null
}

/** The minute cue for Walk, Run and Stretch, as the door's select / row needs it. */
export function moveCue(config: MovementConfig, onConfig: (next: MovementConfig) => void): CueScope['cue'] | undefined {
  if (config.mode !== 'walk' && config.mode !== 'run' && config.mode !== 'stretch') return undefined
  const options = config.mode === 'walk' ? WALK_INTERVAL_PRESETS : config.mode === 'run' ? RUN_INTERVAL_PRESETS : STRETCH_INTERVAL_PRESETS
  return {
    label: config.mode === 'walk' ? 'Reminder' : config.mode === 'run' ? 'Split' : 'Switch sides',
    value: moveIntervalMin(config) ?? 0,
    options,
    onChange: (v) => onConfig(withMoveIntervalMin(config, v)),
  }
}

function PlanControls({ config, onConfig, locked, web }: { config: MovementConfig; onConfig: (next: MovementConfig) => void; locked: boolean; web: boolean }) {
  const plan = describePlan(config)
  if (!plan) return null
  const strengthKind = (config.strengthKind ?? config.workoutKind ?? 'tabata') as StrengthPresetKind
  const work = config.workSec ?? 20
  const rest = config.restSec ?? 0
  const rounds = config.rounds ?? 8
  return (
    <fieldset disabled={locked} className="flex min-w-0 flex-col gap-2.5 border-0 p-0 disabled:opacity-60">
      {config.mode === 'yoga' ? (
        <Segmented label="Flow" size={web ? 'md' : 'sm'} value={config.yogaKind ?? 'gentle'} options={YOGA_PRESETS.map((p) => ({ value: p.kind, label: p.label }))} onChange={(kind) => onConfig({ ...config, yogaKind: kind })} />
      ) : (
        <Segmented
          label="Shape"
          size={web ? 'md' : 'sm'}
          value={strengthKind}
          options={STRENGTH_PRESETS.map((p) => ({ value: p.kind, label: p.label }))}
          onChange={(kind) => {
            const p = STRENGTH_PRESETS.find((x) => x.kind === kind) ?? STRENGTH_PRESETS[0]
            onConfig({ ...config, strengthKind: kind, workoutKind: undefined, workSec: p.workSec, restSec: p.restSec, rounds: p.rounds })
          }}
        />
      )}
      <span className="text-body-sm text-muted">{locked ? 'Set by your practice.' : plan.blurb}</span>
      {config.mode === 'strength' && (
        <div className={web ? 'grid grid-cols-3 gap-2.5' : 'flex flex-col'}>
          <Stepper field={web} label="Work" value={`${work} s`} lessDisabled={work <= 5} moreDisabled={work >= 600} onLess={() => onConfig({ ...config, workSec: clampSeconds(work - 5, 5, 600) })} onMore={() => onConfig({ ...config, workSec: clampSeconds(work + 5, 5, 600) })} />
          <Stepper field={web} label="Rest" value={rest ? `${rest} s` : 'None'} lessDisabled={rest <= 0} moreDisabled={rest >= 600} onLess={() => onConfig({ ...config, restSec: Math.max(0, rest - 5) })} onMore={() => onConfig({ ...config, restSec: Math.min(600, rest + 5) })} />
          <Stepper field={web} label="Rounds" value={String(rounds)} lessDisabled={rounds <= 1} moreDisabled={rounds >= 99} onLess={() => onConfig({ ...config, rounds: clampRounds(rounds - 1) })} onMore={() => onConfig({ ...config, rounds: clampRounds(rounds + 1) })} />
        </div>
      )}
    </fieldset>
  )
}

/** Web: the Plan section (Yoga and Strength). */
export function PlanWebSection({ config, onConfig, locked }: { config: MovementConfig; onConfig: (next: MovementConfig) => void; locked: boolean }) {
  const plan = describePlan(config)
  if (!plan) return null
  return (
    <WebSection label="Plan" aside={<span className="text-body-sm font-medium text-muted">{plan.text}</span>}>
      <PlanControls config={config} onConfig={onConfig} locked={locked} web />
    </WebSection>
  )
}

/** Mobile: every Get Moving row for the current style, one open at a time. */
export function MoveSections({
  config,
  onConfig,
  settings,
  set,
  audio,
  scope,
  locked,
  openRow,
  onToggleRow,
}: {
  config: MovementConfig
  onConfig: (next: MovementConfig) => void
  settings: TimerSettings
  set: (patch: TimerSettingsPatch) => void
  audio: DoorAudio
  scope: CueScope
  /** The practice's author locked it: the plan and cues read only. */
  locked: boolean
  openRow: string | null
  onToggleRow: (id: string) => void
}) {
  const plan = describePlan(config)
  const cue = moveCue(config, onConfig)
  return (
    <div className="overflow-hidden rounded-[20px] bg-surface ring-1 ring-inset ring-border lift-1" aria-label="Settings">
      {plan && (
        <MenuRow icon={config.mode === 'yoga' ? <Flower2 className="h-4.5 w-4.5" /> : <Dumbbell className="h-4.5 w-4.5" />} name="Plan" summary={plan.text} open={openRow === 'plan'} onToggle={() => onToggleRow('plan')}>
          <PlanControls config={config} onConfig={onConfig} locked={locked} web={false} />
        </MenuRow>
      )}
      {cue && (
        <MenuRow icon={<DialIcon className="h-4.5 w-4.5" />} name="Cues" summary={cue.value ? `${cue.label} every ${cue.value} min` : 'None'} open={openRow === 'cues'} onToggle={() => onToggleRow('cues')}>
          <fieldset disabled={locked} className="flex min-w-0 flex-col gap-1.5 border-0 p-0 disabled:opacity-60">
            <RowLabel>{cue.label}</RowLabel>
            <Segmented label={cue.label} size="sm" value={cue.value} options={cue.options.map((o) => ({ value: o.value as number, label: o.value ? `${o.value} min` : 'None' }))} onChange={cue.onChange} />
          </fieldset>
        </MenuRow>
      )}
      <SoundSection cues={settings.cues} set={set} audio={audio} scope={scope} open={openRow === 'sound'} onToggle={() => onToggleRow('sound')} />
      <FeelSection cues={settings.cues} set={set} open={openRow === 'feel'} onToggle={() => onToggleRow('feel')} />
    </div>
  )
}
