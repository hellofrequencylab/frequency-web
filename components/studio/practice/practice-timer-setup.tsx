'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import { Timer } from 'lucide-react'
import { StudioNote } from '../kit/studio-field'
import { Input, Textarea } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/checkbox'
import { capsLabel } from '@/components/ui/caps-label'
import { chipClasses } from '@/components/ui/chip'
import { choiceTileClasses } from '@/components/ui/choice-tile'
import type { PracticeEdit, TimerKind, MindlessMode } from '@/lib/practices'
import { TIER_FLOOR_MIN } from '@/lib/practices/tiers'
import { AUTHORED_WARMUP_PRESETS, BREATH_PATTERNS, WARMUP_MESSAGE_MAX } from '@/lib/on-air'
import {
  MOVEMENT_MODES, STRENGTH_PRESETS, YOGA_PRESETS,
  WALK_DURATION_PRESETS, RUN_DURATION_PRESETS, STRETCH_DURATION_PRESETS,
  WALK_INTERVAL_PRESETS, RUN_INTERVAL_PRESETS, STRETCH_INTERVAL_PRESETS,
  buildPlan, totalSeconds, clampSeconds, clampRounds,
  type MovementConfig, type MovementMode, type StrengthPresetKind, type YogaPresetKind,
} from '@/lib/movement'
import { describeTimer, type TimerSetupId, type TimerSignals, type TimerSuggestion } from '@/lib/practices/timer-setups'
import { TimerSuggestions, type SuggestTimer } from './timer-suggestions'

// THE TIMER SECTION OF THE PRACTICE EDITOR (LIVE-2396). Everything about how a Practice is timed,
// in one place near the top of the editor: suggested setups, the mode (Be Still, Get Moving or
// Log it), that mode's tuning, the length, the warm-up, and exactly what a member will see.
//
// These controls lived two thirds down the form, with the length in a different section and a
// second length inside Get Moving. They are the same controls writing the same columns; what
// changed is that they sit together, the length is asked once, and a setup is one tap.
//
// NAMING (docs/NAMING.md, owner 2026-08-11): the whole thing is the Mindless timer; Be Still and
// Get Moving are its two modes. The first tile used to read "Mindless", which named the timer as
// if it were one of its own modes.

/** The Be Still flavours a practice opens on. Value = practices.mindless_mode; leaving it unset
 *  lets the timer derive one from the Pillar. */
const BE_STILL_MODES: { value: MindlessMode; label: string; hint: string }[] = [
  { value: 'meditate', label: 'Meditate', hint: 'A quiet timed sit; the clock counts down.' },
  { value: 'breathe', label: 'Breathe', hint: 'A guided breathing pattern with rings to follow.' },
  { value: 'stillness', label: 'Stillness', hint: 'A longer, quieter sit with no cues.' },
  { value: 'ritual', label: 'Ritual', hint: 'The same set practice, same length each time.' },
  { value: 'journal', label: 'Journal', hint: 'A timed sit with a notes field to write in.' },
  { value: 'log', label: 'Just Log', hint: 'Skip the timer; mark it done, add a note.' },
]

const KINDS: { value: TimerKind; label: string; hint: string }[] = [
  { value: 'mindless', label: 'Be Still', hint: 'Sit, breathe or write' },
  { value: 'movement', label: 'Get Moving', hint: 'Walk, run, flow or train' },
  { value: 'none', label: 'Log it', hint: 'One tap, no timer' },
]

/** Quick lengths for a sit. The number field beside them takes any length. */
const SIT_MINUTES = [2, 5, 10, 15, 20, 30] as const

export interface PracticeTimerSetupProps {
  timerKind: TimerKind
  movementConfig: MovementConfig | null
  mindlessMode: MindlessMode | null
  breathPattern: string | null
  durationLocked: boolean
  warmupMessage: string | null
  warmupSec: number | null
  /** The session length as typed. Owned by the editor, because Effort is gated by it. */
  durationMin: string
  onDurationInput: (value: string) => void
  /** Save a length (and anything riding with it) in one patch. The editor clamps Effort to it. */
  commitDuration: (minutes: number | null, extra?: PracticeEdit) => void
  queueSave: (patch: PracticeEdit) => void
  /** What the author has written, for the suggested setups. */
  signals: TimerSignals
  /** Vera's read-only recommendation action. Omitted = the offline suggestions only. */
  suggestTimer?: SuggestTimer
}

export function PracticeTimerSetup(props: PracticeTimerSetupProps) {
  const { durationMin, onDurationInput, commitDuration, queueSave } = props
  const [timerKind, setTimerKind] = useState<TimerKind>(props.timerKind ?? 'mindless')
  const [mindlessMode, setMindlessMode] = useState<MindlessMode | null>(props.mindlessMode ?? null)
  const [breathPattern, setBreathPattern] = useState<string | null>(props.breathPattern ?? null)
  const [durationLocked, setDurationLocked] = useState<boolean>(props.durationLocked ?? false)
  // Full per-mode tuning the CREATOR presets, so the timer opens ready (ADR-592, P2). Seeded
  // from the saved movement_config; each mode reads only its own fields, mirroring the member
  // setup in movement-session.tsx. Defaults match lib/movement's builders.
  const mc = props.movementConfig
  const [movementMode, setMovementMode] = useState<MovementMode>(mc?.mode ?? 'walk')
  const [walkMinutes, setWalkMinutes] = useState<number>(mc?.walkMinutes ?? 20)
  const [walkIntervalMin, setWalkIntervalMin] = useState<number>(mc?.walkIntervalMin ?? 0)
  const [runMinutes, setRunMinutes] = useState<number>(mc?.runMinutes ?? 20)
  const [runIntervalMin, setRunIntervalMin] = useState<number>(mc?.runIntervalMin ?? 0)
  const [stretchMinutes, setStretchMinutes] = useState<number>(mc?.stretchMinutes ?? 10)
  const [stretchIntervalMin, setStretchIntervalMin] = useState<number>(mc?.stretchIntervalMin ?? 0)
  const [yogaKind, setYogaKind] = useState<YogaPresetKind>(mc?.yogaKind ?? 'gentle')
  const [strengthKind, setStrengthKind] = useState<StrengthPresetKind>(mc?.strengthKind ?? mc?.workoutKind ?? 'tabata')
  const [workSec, setWorkSec] = useState<number>(mc?.workSec ?? 20)
  const [restSec, setRestSec] = useState<number>(mc?.restSec ?? 10)
  const [rounds, setRounds] = useState<number>(mc?.rounds ?? 8)
  // Creator-authored warm-up (ADR-592, P3): a message + length shown during the pre-roll.
  const [warmupMessage, setWarmupMessage] = useState(props.warmupMessage ?? '')
  const [warmupSec, setWarmupSec] = useState<number>(props.warmupSec ?? 0)
  // The suggested setup the author last tapped. Any hand edit clears it, so a card only reads as
  // chosen while the timer still is that setup.
  const [appliedId, setAppliedId] = useState<TimerSetupId | null>(null)

  const save = (patch: PracticeEdit) => { setAppliedId(null); queueSave(patch) }
  const saveLength = (minutes: number | null, extra?: PracticeEdit) => { setAppliedId(null); commitDuration(minutes, extra) }

  // Compose the full movement_config for a mode from the current tuning state. `overrides` carry
  // a control's brand-new value so the save uses it before React state settles; `mode` lets a
  // mode switch compose the new mode's config directly. The server re-sanitizes on save.
  const composeMovementConfig = (overrides: Partial<MovementConfig> = {}, mode: MovementMode = movementMode): MovementConfig => {
    const base: MovementConfig =
      mode === 'walk' ? { mode, walkMinutes, walkIntervalMin }
      : mode === 'run' ? { mode, runMinutes, runIntervalMin }
      : mode === 'yoga' ? { mode, yogaKind }
      : mode === 'stretch' ? { mode, stretchMinutes, stretchIntervalMin }
      : mode === 'play' ? { mode }
      : { mode: 'strength', strengthKind, workSec, restSec, rounds }
    return { ...base, ...overrides }
  }
  // A Get Moving practice has ONE length: the plan's. The session length column follows it, so
  // the card, the Effort gate and the log all agree with what the timer actually runs.
  const saveMovement = (overrides: Partial<MovementConfig> = {}, mode: MovementMode = movementMode) => {
    const config = composeMovementConfig(overrides, mode)
    const total = totalSeconds(buildPlan(config))
    saveLength(total != null ? Math.max(1, Math.round(total / 60)) : null, { timer_kind: 'movement', movement_config: config })
  }
  // Picking a Strength shape seeds its default work/rest/rounds (the member can still tune each).
  const pickStrength = (kind: StrengthPresetKind) => {
    const p = STRENGTH_PRESETS.find((x) => x.kind === kind) ?? STRENGTH_PRESETS[0]
    setStrengthKind(kind); setWorkSec(p.workSec); setRestSec(p.restSec); setRounds(p.rounds)
    saveMovement({ strengthKind: kind, workSec: p.workSec, restSec: p.restSec, rounds: p.rounds })
  }
  // A single-length mode (Walk / Run / Stretch): its minutes + optional interval-cue state,
  // presets, and save-on-change setters, resolved for the active mode. Null for other modes.
  const durationTuner: {
    minutes: number
    setMinutes: (v: number) => void
    minutePresets: readonly number[]
    interval: number
    setInterval: (v: number) => void
    intervalPresets: readonly { value: number; label: string }[]
    intervalHint: string
  } | null =
    movementMode === 'walk'
      ? { minutes: walkMinutes, setMinutes: (v: number) => { setWalkMinutes(v); saveMovement({ walkMinutes: v }) }, minutePresets: WALK_DURATION_PRESETS, interval: walkIntervalMin, setInterval: (v: number) => { setWalkIntervalMin(v); saveMovement({ walkIntervalMin: v }) }, intervalPresets: WALK_INTERVAL_PRESETS, intervalHint: 'A gentle chime as you go, if you want one.' }
      : movementMode === 'run'
      ? { minutes: runMinutes, setMinutes: (v: number) => { setRunMinutes(v); saveMovement({ runMinutes: v }) }, minutePresets: RUN_DURATION_PRESETS, interval: runIntervalMin, setInterval: (v: number) => { setRunIntervalMin(v); saveMovement({ runIntervalMin: v }) }, intervalPresets: RUN_INTERVAL_PRESETS, intervalHint: 'Split cues on the minute, if you want them.' }
      : movementMode === 'stretch'
      ? { minutes: stretchMinutes, setMinutes: (v: number) => { setStretchMinutes(v); saveMovement({ stretchMinutes: v }) }, minutePresets: STRETCH_DURATION_PRESETS, interval: stretchIntervalMin, setInterval: (v: number) => { setStretchIntervalMin(v); saveMovement({ stretchIntervalMin: v }) }, intervalPresets: STRETCH_INTERVAL_PRESETS, intervalHint: 'A soft cue to switch sides, if you want one.' }
      : null

  // One tap on a suggested setup: mirror its columns into the controls below, then save them in
  // a single patch. This is the author's own act; nothing applies until they tap.
  const applySuggestion = (s: TimerSuggestion) => {
    const p = s.patch
    setTimerKind(p.timer_kind)
    if (p.timer_kind === 'mindless') {
      setMindlessMode(p.mindless_mode ?? null)
      setBreathPattern(p.breath_pattern ?? null)
    }
    const c = p.movement_config
    if (p.timer_kind === 'movement' && c) {
      setMovementMode(c.mode)
      if (c.walkMinutes != null) setWalkMinutes(c.walkMinutes)
      if (c.walkIntervalMin != null) setWalkIntervalMin(c.walkIntervalMin)
      if (c.runMinutes != null) setRunMinutes(c.runMinutes)
      if (c.runIntervalMin != null) setRunIntervalMin(c.runIntervalMin)
      if (c.stretchMinutes != null) setStretchMinutes(c.stretchMinutes)
      if (c.stretchIntervalMin != null) setStretchIntervalMin(c.stretchIntervalMin)
      if (c.yogaKind) setYogaKind(c.yogaKind)
      if (c.strengthKind) setStrengthKind(c.strengthKind)
      if (c.workSec != null) setWorkSec(c.workSec)
      if (c.restSec != null) setRestSec(c.restSec)
      if (c.rounds != null) setRounds(c.rounds)
    }
    const { duration_min, ...rest } = p
    if (p.timer_kind === 'none') queueSave(rest)
    else commitDuration(duration_min ?? null, rest)
    setAppliedId(s.id)
  }

  const typedMinutes = durationMin.trim() === '' ? null : Number(durationMin) || null
  const described = describeTimer({
    timerKind,
    mindlessMode,
    breathPattern,
    movementConfig: timerKind === 'movement' ? composeMovementConfig() : null,
    durationMin: typedMinutes,
    durationLocked,
    warmupSec,
    warmupMessage,
  })

  return (
    <section id="timer" aria-labelledby="practice-timer-heading" data-energy={described.energy} className="mt-6 scroll-mt-24 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="practice-timer-heading" className="inline-flex items-center gap-2 text-body font-bold text-text">
          <Timer className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden /> Timer
        </h2>
        <span className="rounded-pill bg-surface-elevated px-2 py-0.5 text-meta font-medium text-muted">
          {described.mode === 'Log it' ? 'Log it' : `${described.mode} · ${described.headline}`}
        </span>
      </div>
      <p className="mt-1 text-body-sm text-muted">
        How a member does this practice. Start from a suggested setup, or build your own below. It opens ready to go, with one tap.
      </p>

      <div className="mt-4">
        <TimerSuggestions signals={{ ...props.signals, durationMin: typedMinutes ?? props.signals.durationMin }} appliedId={appliedId} onApply={applySuggestion} suggest={props.suggestTimer} />
      </div>

      {/* How it's done: drives the single action a follower sees. Be Still opens the quiet timer,
          Get Moving opens the moving timer, and Log it records in one tap. */}
      <fieldset className="mt-5 border-t border-border pt-4">
        <legend className={capsLabel('text-2xs font-semibold text-muted')}>How it&rsquo;s done</legend>
        <div role="radiogroup" aria-label="How it's done" className="mt-2 grid grid-cols-3 gap-2">
          {KINDS.map((k) => {
            const active = timerKind === k.value
            return (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setTimerKind(k.value)
                  // Switching to Get Moving seeds its config from the current mode; Be Still carries
                  // its flavour; Log it clears both (the server nulls what no longer applies).
                  if (k.value === 'movement') saveMovement()
                  else if (k.value === 'mindless') save({ timer_kind: 'mindless', movement_config: null, mindless_mode: mindlessMode })
                  else save({ timer_kind: 'none', movement_config: null })
                }}
                className={choiceTileClasses(
                  active,
                  `flex min-h-11 flex-col items-start justify-center rounded-control px-3 py-2 text-body-sm font-medium ${active ? 'text-primary-strong' : 'text-muted'}`,
                )}
              >
                <span>{k.label}</span>
                <span className={`text-2xs font-normal ${active ? 'text-primary-strong' : 'text-muted'}`}>{k.hint}</span>
              </button>
            )
          })}
        </div>

        {timerKind === 'none' && (
          <p className="mt-3 rounded-control border border-border bg-surface-elevated/60 px-3 py-2 text-meta text-muted">
            No timer. A member taps Log it once and can add a note. Right for a real-world act, like texting a friend.
          </p>
        )}

        {/* The Be Still flavour a practice opens on (P7). "Auto" leaves it to the Pillar. */}
        {timerKind === 'mindless' && (
          <div className="mt-4 space-y-4">
            <div>
              <p className={capsLabel('text-2xs font-semibold text-muted')}>Be Still mode</p>
              <div role="radiogroup" aria-label="Be Still mode" className="mt-2 flex flex-wrap gap-2">
                <TimerChip active={mindlessMode === null} onClick={() => { setMindlessMode(null); save({ mindless_mode: null }) }}>
                  Auto
                </TimerChip>
                {BE_STILL_MODES.map((m) => (
                  <TimerChip key={m.value} active={mindlessMode === m.value} title={m.hint} onClick={() => { setMindlessMode(m.value); save({ mindless_mode: m.value }) }}>
                    {m.label}
                  </TimerChip>
                ))}
              </div>
              <p className="mt-1 text-2xs text-muted">
                {mindlessMode ? BE_STILL_MODES.find((m) => m.value === mindlessMode)?.hint : 'Auto picks the mode that fits the practice. You can choose another.'}
              </p>
            </div>

            {/* Breath pattern (P4): a Breathe practice can SHIP its pattern, so a Box-breathing
                practice opens on Box. "Member's choice" (null) keeps their own saved pattern. */}
            {mindlessMode === 'breathe' && (
              <div>
                <p className={capsLabel('text-2xs font-semibold text-muted')}>Breath pattern</p>
                <div role="radiogroup" aria-label="Breath pattern" className="mt-2 flex flex-wrap gap-2">
                  <TimerChip active={breathPattern === null} onClick={() => { setBreathPattern(null); save({ breath_pattern: null }) }}>
                    Member&rsquo;s choice
                  </TimerChip>
                  {BREATH_PATTERNS.map((p) => (
                    <TimerChip key={p.slug} active={breathPattern === p.slug} title={p.blurb} onClick={() => { setBreathPattern(p.slug); save({ breath_pattern: p.slug }) }}>
                      {p.name}
                    </TimerChip>
                  ))}
                </div>
                <p className="mt-1 text-2xs text-muted">
                  {breathPattern ? BREATH_PATTERNS.find((p) => p.slug === breathPattern)?.blurb : 'Each member breathes their own way.'}
                </p>
              </div>
            )}

            {mindlessMode !== 'log' && (
              <div>
                <p className={capsLabel('text-2xs font-semibold text-muted')}>Length</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {SIT_MINUTES.map((min) => (
                    <TimerChip key={min} active={typedMinutes === min} onClick={() => { onDurationInput(String(min)); saveLength(min) }}>
                      {min} min
                    </TimerChip>
                  ))}
                  <span className="inline-flex items-center gap-1.5">
                    <Input
                      type="number"
                      aria-label="Time (minutes)"
                      min={0}
                      max={1440}
                      value={durationMin}
                      onChange={(e) => onDurationInput(e.target.value)}
                      onBlur={() => saveLength(durationMin.trim() === '' ? null : Number(durationMin))}
                      placeholder="Any"
                      className="w-20"
                    />
                    <span className="text-meta text-muted">min</span>
                  </span>
                </div>
                <p className="mt-1 text-2xs text-muted">
                  Leave it empty for an open sit. The member earns the tier they reach: {TIER_FLOOR_MIN.standard} min = Standard, {TIER_FLOOR_MIN.heavy} min = Heavy.
                </p>
                <Checkbox
                  checked={durationLocked}
                  onChange={(e) => { setDurationLocked(e.target.checked); save({ duration_locked: e.target.checked }) }}
                  label="Lock this length so members can’t change it at the timer"
                  wrapperClassName="mt-2"
                />
              </div>
            )}
          </div>
        )}

        {/* The Get Moving mode the timer opens on, and its tuning. */}
        {timerKind === 'movement' && (
          <div className="mt-4">
            <p className={capsLabel('text-2xs font-semibold text-muted')}>Movement mode</p>
            <div role="radiogroup" aria-label="Movement mode" className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {MOVEMENT_MODES.map((m) => {
                const active = movementMode === m.mode
                return (
                  <button
                    key={m.mode}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={m.blurb}
                    onClick={() => { setMovementMode(m.mode); saveMovement({}, m.mode) }}
                    className={choiceTileClasses(active, `flex min-h-11 items-center justify-center rounded-control px-2 py-2 text-body-sm font-medium ${active ? 'text-primary-strong' : 'text-muted'}`)}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-2xs text-muted">{MOVEMENT_MODES.find((m) => m.mode === movementMode)?.blurb}</p>

            {/* Per-mode tuning the CREATOR presets, so the timer opens ready (ADR-592, P2). The
                member can still adjust it at start; this is the preset it ships with. */}
            <div className="mt-3 space-y-3">
              {durationTuner && (
                <>
                  <div>
                    <p className={capsLabel('text-2xs font-semibold text-muted')}>Length</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {durationTuner.minutePresets.map((min) => (
                        <TimerChip key={min} active={durationTuner.minutes === min} onClick={() => durationTuner.setMinutes(min)}>
                          {min} min
                        </TimerChip>
                      ))}
                      <TimerStepper
                        label="min"
                        value={durationTuner.minutes}
                        onLess={() => durationTuner.setMinutes(Math.max(1, durationTuner.minutes - 5))}
                        onMore={() => durationTuner.setMinutes(Math.min(600, durationTuner.minutes + 5))}
                      />
                    </div>
                  </div>
                  <div>
                    <p className={capsLabel('text-2xs font-semibold text-muted')}>Interval cue</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {durationTuner.intervalPresets.map((iv) => (
                        <TimerChip key={iv.value} active={durationTuner.interval === iv.value} onClick={() => durationTuner.setInterval(iv.value)}>
                          {iv.label}
                        </TimerChip>
                      ))}
                    </div>
                    <p className="mt-1 text-2xs text-muted">{durationTuner.intervalHint}</p>
                  </div>
                </>
              )}

              {movementMode === 'yoga' && (
                <div>
                  <p className={capsLabel('text-2xs font-semibold text-muted')}>Flow</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {YOGA_PRESETS.map((y) => (
                      <TimerChip key={y.kind} active={yogaKind === y.kind} title={y.blurb} onClick={() => { setYogaKind(y.kind); saveMovement({ yogaKind: y.kind }) }}>
                        {y.label}
                      </TimerChip>
                    ))}
                  </div>
                  <p className="mt-1 text-2xs text-muted">{YOGA_PRESETS.find((y) => y.kind === yogaKind)?.blurb}</p>
                </div>
              )}

              {movementMode === 'strength' && (
                <div className="space-y-3">
                  <div>
                    <p className={capsLabel('text-2xs font-semibold text-muted')}>Shape</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {STRENGTH_PRESETS.map((w) => (
                        <TimerChip key={w.kind} active={strengthKind === w.kind} title={w.blurb} onClick={() => pickStrength(w.kind)}>
                          {w.label}
                        </TimerChip>
                      ))}
                    </div>
                    <p className="mt-1 text-2xs text-muted">{STRENGTH_PRESETS.find((w) => w.kind === strengthKind)?.blurb}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <TimerStepper label="Work" value={`${workSec}s`} onLess={() => { const v = clampSeconds(workSec - 5); setWorkSec(v); saveMovement({ workSec: v }) }} onMore={() => { const v = clampSeconds(workSec + 5); setWorkSec(v); saveMovement({ workSec: v }) }} />
                    <TimerStepper label="Rest" value={restSec === 0 ? 'none' : `${restSec}s`} onLess={() => { const v = Math.max(0, restSec - 5); setRestSec(v); saveMovement({ restSec: v }) }} onMore={() => { const v = Math.min(600, restSec + 5); setRestSec(v); saveMovement({ restSec: v }) }} />
                    <TimerStepper label="Rounds" value={String(rounds)} onLess={() => { const v = clampRounds(rounds - 1); setRounds(v); saveMovement({ rounds: v }) }} onMore={() => { const v = clampRounds(rounds + 1); setRounds(v); saveMovement({ rounds: v }) }} />
                  </div>
                </div>
              )}

              {movementMode === 'play' && (
                <p className="rounded-control border border-border bg-surface-elevated/60 px-3 py-2 text-meta text-muted">
                  An open count-up. The member starts, moves, and stops when they are done. Nothing to preset.
                </p>
              )}
            </div>
          </div>
        )}
      </fieldset>

      {/* Warm-up: a message + length shown while the timer counts in (ADR-592, P3). Only a timed
          practice has a count-in, so this is hidden for Log it. Optional, so it starts folded
          unless the author already wrote one. */}
      {timerKind !== 'none' && mindlessMode !== 'log' && (
        <details className="mt-4 border-t border-border pt-3" open={Boolean(props.warmupMessage?.trim() || props.warmupSec)}>
          <summary className={capsLabel('cursor-pointer text-2xs font-semibold text-muted')}>Warm-up (optional)</summary>
          <StudioNote className="mt-2">
            A short message shown on screen while the timer counts in, so the member can set up.
            Leave the count-in on <strong>Member default</strong> to keep each person&rsquo;s own 3, 5 or 10 seconds.
          </StudioNote>
          <div className="mt-2">
            <Textarea
              aria-label="Warm-up message"
              value={warmupMessage}
              onChange={(e) => setWarmupMessage(e.target.value)}
              onBlur={() => save({ warmup_message: warmupMessage })}
              rows={2}
              maxLength={WARMUP_MESSAGE_MAX}
              placeholder="e.g. Roll your shoulders. Take a slow breath. We start easy."
            />
            <p className="mt-0.5 text-2xs text-muted">{warmupMessage.trim().length}/{WARMUP_MESSAGE_MAX}. Leave blank for a silent count-in.</p>
          </div>
          <div className="mt-2">
            <p className={capsLabel('text-2xs font-semibold text-muted')}>Count-in length</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {AUTHORED_WARMUP_PRESETS.map((sec) => (
                <TimerChip key={sec} active={warmupSec === sec} onClick={() => { setWarmupSec(sec); save({ warmup_sec: sec === 0 ? null : sec }) }}>
                  {sec === 0 ? 'Member default' : `${sec}s`}
                </TimerChip>
              ))}
            </div>
          </div>
        </details>
      )}

      {/* WHAT MEMBERS SEE: the same description the practice page renders (describeTimer),
          recomputed live as the author edits. They see what they are shipping. */}
      <div className="mt-4 rounded-control bg-surface-elevated px-3 py-2.5">
        <p className={capsLabel('text-2xs font-semibold text-muted')}>Members will see</p>
        <p className="mt-1 text-body-sm font-semibold text-text">
          {described.mode === 'Log it' ? 'Log it' : `${described.mode} · ${described.headline}`}
        </p>
        <ul className="mt-1 space-y-0.5 text-meta text-muted">
          {described.facts.map((fact) => <li key={fact}>{fact}</li>)}
        </ul>
        <p className="mt-1.5 text-meta text-subtle">
          {timerKind === 'none'
            ? 'On the practice page and on a Journey, this shows a Log it check-off.'
            : 'On the practice page and on a Journey, this shows a Start Practice button.'}
        </p>
      </div>
    </section>
  )
}

// A small selectable pill for the timer controls (modes, lengths, patterns, cues).
function TimerChip({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={active} title={title} onClick={onClick} className={chipClasses(Boolean(active))}>
      {children}
    </button>
  )
}

// A compact less / value / more stepper for a single numeric setting (Work, Rest, Rounds, length).
function TimerStepper({ label, value, onLess, onMore }: { label: string; value: string | number; onLess: () => void; onMore: () => void }) {
  return (
    <div className="rounded-control border border-border bg-surface px-2 py-1.5 text-center">
      <p className={capsLabel('text-2xs font-semibold text-muted')}>{label}</p>
      <div className="mt-0.5 flex items-center justify-between gap-1">
        <button type="button" aria-label={`Less ${label}`} onClick={onLess} className="h-6 w-6 rounded-control border border-border text-muted transition-colors hover:bg-surface-elevated">−</button>
        <span className="min-w-8 text-body-sm font-semibold tabular-nums text-text">{value}</span>
        <button type="button" aria-label={`More ${label}`} onClick={onMore} className="h-6 w-6 rounded-control border border-border text-muted transition-colors hover:bg-surface-elevated">+</button>
      </div>
    </div>
  )
}
