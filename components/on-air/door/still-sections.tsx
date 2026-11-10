'use client'

// The Be Still sub-menus of the Mindless door (LIVE-2241): Breath, Sound, Ambient and Feel.
// Every control here already exists in the sit engine (components/on-air/session.tsx); this is
// the same setting reached from the door instead of a second screen, written to the one settings
// model so the engine mounts with it. Previews (a bell strike, a short ambient audition) run on a
// tap, which is the gesture that unlocks audio.

import { useEffect, useRef, useState } from 'react'
import { Info, Music, Wind } from 'lucide-react'
import { AMBIENT_TRACKS, BREATH_PATTERNS, CUSTOM_PHASE_MIN, bellToneBySlug, buildCustomPattern, type BreathPattern } from '@/lib/on-air'
import { describeSections, type TimerSettings, type TimerSettingsPatch } from '@/lib/on-air/timer-settings'
import { useDialogFocusTrap } from '@/components/ui/use-dialog-focus-trap'
import { DoorSection, OptionRow, ToggleRow, VolumeRange, useDoorSections } from './door-section'
import { FeelSection, SoundSection, useDoorAudio } from './cue-sections'

const CUSTOM_PHASE_MAX = 8

export function StillSections({
  settings,
  set,
  breathMode,
  timerMode,
}: {
  settings: TimerSettings
  set: (patch: TimerSettingsPatch) => void
  /** Breathe is the sub-mode: the Breath row shows and the interval bell hides (phase cues). */
  breathMode: boolean
  /** A silent timer sub-mode (Meditate, Stillness, Ritual, Journal): the interval bell shows. */
  timerMode: boolean
}) {
  const { isOpen, toggle } = useDoorSections()
  const audio = useDoorAudio()
  const [howTo, setHowTo] = useState<BreathPattern | null>(null)
  const { still, cues } = settings
  const pattern =
    still.patternSlug === 'custom'
      ? buildCustomPattern(still.customIn, still.customHold, still.customOut)
      : (BREATH_PATTERNS.find((p) => p.slug === still.patternSlug) ?? BREATH_PATTERNS[0])
  const summary = describeSections(
    settings,
    {
      pattern: pattern.name,
      voice: bellToneBySlug(cues.bellTone).name,
      ambient: AMBIENT_TRACKS.find((t) => t.slug === cues.ambientTrack)?.name ?? null,
    },
    { breathMode },
  )
  return (
    <div className="space-y-2" aria-label="Settings">
      {breathMode && (
        <DoorSection icon={<Wind className="h-4 w-4" />} name="Breath" summary={summary.breath} open={isOpen('breath')} onToggle={() => toggle('breath')}>
          <OptionRow
            label="Pattern"
            columns={3}
            value={still.patternSlug}
            options={[...BREATH_PATTERNS.map((p) => ({ value: p.slug, label: p.name })), { value: 'custom', label: 'Custom' }]}
            onChange={(slug) => set({ still: { patternSlug: slug } })}
          />
          <div className="flex items-start gap-2">
            <p className="flex-1 text-meta text-muted">{pattern.blurb}</p>
            <button type="button" onClick={() => setHowTo(pattern)} aria-label={`How to do ${pattern.name}`} className="flex min-h-11 shrink-0 items-center gap-1 rounded-pill px-1.5 text-meta font-medium text-muted hover:text-text">
              <Info className="h-3.5 w-3.5" aria-hidden /> How it works
            </button>
          </div>
          {still.patternSlug === 'custom' && (
            <div className="space-y-2.5 rounded-card border border-border px-3 py-2.5">
              <PhaseRange label="Breathe in" min={CUSTOM_PHASE_MIN} value={still.customIn} onChange={(v) => set({ still: { customIn: v } })} />
              <PhaseRange label="Hold" min={0} value={still.customHold} onChange={(v) => set({ still: { customHold: v } })} />
              <PhaseRange label="Let go" min={CUSTOM_PHASE_MIN} value={still.customOut} onChange={(v) => set({ still: { customOut: v } })} />
            </div>
          )}
          <ToggleRow label="Show breath count" hint="The seconds of each phase on the rings." checked={cues.showBreathCount} onChange={(v) => set({ cues: { showBreathCount: v } })} />
        </DoorSection>
      )}
      <SoundSection cues={cues} set={set} audio={audio} summary={summary.sound} open={isOpen('sound')} onToggle={() => toggle('sound')} intervalBell={timerMode} endBell hint="Bells on phase changes and at the end." />
      <DoorSection icon={<Music className="h-4 w-4" />} name="Ambient" summary={summary.ambient} open={isOpen('ambient')} onToggle={() => toggle('ambient')}>
        <OptionRow
          label="Background loop"
          value={cues.ambientTrack}
          options={[{ value: null, label: 'Off' }, ...AMBIENT_TRACKS.map((t) => ({ value: t.slug as string | null, label: t.name }))]}
          onChange={(slug) => {
            set({ cues: { ambientTrack: slug } })
            audio.audition(slug, cues.ambientVolume)
          }}
        />
        {cues.ambientTrack && (
          <VolumeRange
            label="Ambient volume"
            value={cues.ambientVolume}
            onChange={(v) => {
              set({ cues: { ambientVolume: v } })
              audio.level(v)
            }}
          />
        )}
      </DoorSection>
      <FeelSection cues={cues} set={set} summary={summary.feel} open={isOpen('feel')} onToggle={() => toggle('feel')} vibrationHint="A small tap on the warm-up, the end and an early close, where the device supports it." />
      {howTo && <HowItWorks pattern={howTo} onClose={() => setHowTo(null)} />}
    </div>
  )
}

function PhaseRange({ label, min, value, onChange }: { label: string; min: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-meta text-muted">
      <span className="mb-1 flex items-baseline justify-between">
        <span>{label}</span>
        <span className="font-semibold tabular-nums text-text">{value === 0 ? 'off' : `${value}s`}</span>
      </span>
      <input type="range" min={min} max={CUSTOM_PHASE_MAX} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </label>
  )
}

/** The pattern how-to, above the door (z-[60] over its z-50). Close, scrim or Escape dismiss it. */
function HowItWorks({ pattern, onClose }: { pattern: BreathPattern; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  useDialogFocusTrap(true, panel)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={`How to do ${pattern.name}`} className="fixed inset-0 z-[60] flex items-center justify-center px-6">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-canvas/80 backdrop-blur-sm" />
      <div ref={panel} tabIndex={-1} className="relative w-full max-w-sm rounded-card border border-border bg-surface px-6 py-6 outline-none lift-3">
        <p className="text-body font-semibold text-text">{pattern.name}</p>
        <p className="mt-2 text-body-sm text-muted">{pattern.instructions}</p>
        <button type="button" onClick={onClose} className="mt-4 min-h-11 w-full rounded-control border border-border px-3 text-body-sm font-semibold text-text">Got it</button>
      </div>
    </div>
  )
}
