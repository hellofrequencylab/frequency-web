'use client'

// The Get Moving sub-menus of the Mindless door (LIVE-2234): Plan (Yoga flow, Strength shape with
// work, rest and rounds), Cues (the Walk reminder, Run split or Stretch switch-sides chime), and the
// shared Sound and Feel rows. Every control exists in the movement engine; this is the same setting
// reached from the door, written to the one settings model and carried into the engine as its
// starting config.

import { Minus, Plus, Route, Timer } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'
import {
  RUN_INTERVAL_PRESETS,
  STRENGTH_PRESETS,
  STRETCH_INTERVAL_PRESETS,
  WALK_INTERVAL_PRESETS,
  YOGA_PRESETS,
  clampRounds,
  clampSeconds,
  type MovementConfig,
  type StrengthPresetKind,
} from '@/lib/movement'
import { bellToneBySlug } from '@/lib/on-air'
import { describeMoveCues, describeMovePlan, moveIntervalMin, withMoveIntervalMin, type TimerSettings, type TimerSettingsPatch } from '@/lib/on-air/timer-settings'
import { DoorSection, OptionRow, useDoorSections } from './door-section'
import { FeelSection, SoundSection, useDoorAudio } from './cue-sections'

export function MoveSections({
  config,
  onConfig,
  settings,
  set,
  locked,
}: {
  config: MovementConfig
  onConfig: (next: MovementConfig) => void
  settings: TimerSettings
  set: (patch: TimerSettingsPatch) => void
  /** The practice's author locked it: the plan and cues read only. */
  locked: boolean
}) {
  const { isOpen, toggle } = useDoorSections()
  const audio = useDoorAudio()
  const { cues } = settings
  const structured = config.mode === 'yoga' || config.mode === 'strength'
  const cued = config.mode === 'walk' || config.mode === 'run' || config.mode === 'stretch'
  const voice = bellToneBySlug(cues.bellTone).name
  const sound = cues.bell ? voice : 'Off'
  const feel = `${cues.warmupSec} s countdown, vibration ${cues.haptics ? 'on' : 'off'}`
  const intervals = config.mode === 'walk' ? WALK_INTERVAL_PRESETS : config.mode === 'run' ? RUN_INTERVAL_PRESETS : STRETCH_INTERVAL_PRESETS
  const cueLabel = config.mode === 'walk' ? 'Reminder' : config.mode === 'run' ? 'Split' : 'Switch sides'
  return (
    <div className="space-y-2" aria-label="Settings">
      {structured && (
        <DoorSection icon={<Route className="h-4 w-4" />} name="Plan" summary={describeMovePlan(config)} open={isOpen('plan')} onToggle={() => toggle('plan')}>
          <fieldset disabled={locked} className="min-w-0 space-y-3">
            {config.mode === 'yoga' && (
              <>
                <OptionRow label="Flow" columns={3} value={config.yogaKind ?? 'gentle'} options={YOGA_PRESETS.map((p) => ({ value: p.kind, label: p.label }))} onChange={(kind) => onConfig({ ...config, yogaKind: kind })} />
                <p className="text-meta text-muted">{YOGA_PRESETS.find((p) => p.kind === (config.yogaKind ?? 'gentle'))?.blurb}</p>
              </>
            )}
            {config.mode === 'strength' && (
              <>
                <OptionRow
                  label="Shape"
                  value={(config.strengthKind ?? config.workoutKind ?? 'tabata') as StrengthPresetKind}
                  options={STRENGTH_PRESETS.map((p) => ({ value: p.kind, label: p.label }))}
                  onChange={(kind) => {
                    const p = STRENGTH_PRESETS.find((x) => x.kind === kind) ?? STRENGTH_PRESETS[0]
                    onConfig({ ...config, strengthKind: kind, workoutKind: undefined, workSec: p.workSec, restSec: p.restSec, rounds: p.rounds })
                  }}
                />
                <p className="text-meta text-muted">{STRENGTH_PRESETS.find((p) => p.kind === (config.strengthKind ?? config.workoutKind))?.blurb}</p>
                <div className="grid grid-cols-3 gap-3">
                  <Tune label="Work" value={`${config.workSec ?? 20}s`} onLess={() => onConfig({ ...config, workSec: clampSeconds((config.workSec ?? 20) - 5) })} onMore={() => onConfig({ ...config, workSec: clampSeconds((config.workSec ?? 20) + 5) })} />
                  <Tune label="Rest" value={(config.restSec ?? 0) === 0 ? 'none' : `${config.restSec}s`} onLess={() => onConfig({ ...config, restSec: Math.max(0, (config.restSec ?? 0) - 5) })} onMore={() => onConfig({ ...config, restSec: Math.min(600, (config.restSec ?? 0) + 5) })} />
                  <Tune label="Rounds" value={String(config.rounds ?? 8)} onLess={() => onConfig({ ...config, rounds: clampRounds((config.rounds ?? 8) - 1) })} onMore={() => onConfig({ ...config, rounds: clampRounds((config.rounds ?? 8) + 1) })} />
                </div>
              </>
            )}
            {locked && <p className="text-meta text-muted">Set by the practice.</p>}
          </fieldset>
        </DoorSection>
      )}
      {cued && (
        <DoorSection icon={<Timer className="h-4 w-4" />} name="Cues" summary={describeMoveCues(config)} open={isOpen('cues')} onToggle={() => toggle('cues')}>
          <fieldset disabled={locked} className="min-w-0 space-y-3">
            <OptionRow label={cueLabel} columns={3} value={moveIntervalMin(config) ?? 0} options={intervals.map((iv) => ({ value: iv.value as number, label: iv.label }))} onChange={(v) => onConfig(withMoveIntervalMin(config, v))} />
            <p className="text-meta text-muted">{config.mode === 'walk' ? 'A gentle chime on the minute, if you want a nudge.' : config.mode === 'run' ? 'A split cue on the minute.' : 'A soft cue to switch sides.'}</p>
          </fieldset>
        </DoorSection>
      )}
      <SoundSection cues={cues} set={set} audio={audio} summary={sound} open={isOpen('sound')} onToggle={() => toggle('sound')} intervalBell={false} endBell={false} hint="Bells on phase changes, the 3-2-1 count and the end." />
      <FeelSection cues={cues} set={set} summary={feel} open={isOpen('feel')} onToggle={() => toggle('feel')} vibrationHint="A small tap on each phase change and the end, where the device supports it." />
    </div>
  )
}

function Tune({ label, value, onLess, onMore }: { label: string; value: string; onLess: () => void; onMore: () => void }) {
  return (
    <div className="rounded-card border border-border px-1.5 py-1.5 text-center">
      <p className="text-meta font-medium text-muted">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <IconButton label={`Less ${label.toLowerCase()}`} onClick={onLess}>
          <Minus className="h-3.5 w-3.5" />
        </IconButton>
        <span className="text-body-sm font-semibold tabular-nums text-text">{value}</span>
        <IconButton label={`More ${label.toLowerCase()}`} onClick={onMore}>
          <Plus className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  )
}
