'use client'

// The Sound and Feel sub-menus of the Mindless door, shared by Be Still and Get Moving
// (LIVE-2241, LIVE-2242). Previews (a bell strike, a short ambient audition) run on a tap, which
// is the gesture that unlocks audio. Every change writes the one settings model.

import { useEffect, useRef } from 'react'
import { Sparkles, Volume2 } from 'lucide-react'
import { AMBIENT_TRACKS, BELL_INTERVALS, BELL_TONES, WARMUP_PRESETS, bellToneBySlug } from '@/lib/on-air'
import { chime } from '@/lib/timer-audio'
import { createAmbient, type AmbientHandle } from '@/lib/on-air-ambient'
import type { CueSettings, TimerSettingsPatch } from '@/lib/on-air/timer-settings'
import { DoorSection, OptionRow, ToggleRow, VolumeRange } from './door-section'
import { takeUnlockedAudio } from '@/lib/on-air/timer-audio-unlock'

/** One audio context for previews, created on the first tap and closed with the door. */
export function useDoorAudio() {
  const ctx = useRef<AudioContext | null>(null)
  const ambient = useRef<AmbientHandle | null>(null)
  useEffect(
    () => () => {
      ambient.current?.stop()
      void ctx.current?.close().catch(() => undefined)
    },
    [],
  )
  const ensure = () => {
    try {
      ctx.current = ctx.current ?? takeUnlockedAudio() ?? new AudioContext()
      void ctx.current.resume()
      return ctx.current
    } catch {
      return null
    }
  }
  return {
    strike(toneSlug: string, volume: number) {
      const c = ensure()
      if (!c) return
      try {
        chime(c, bellToneBySlug(toneSlug), volume)
      } catch {
        // a preview is a nicety
      }
    },
    audition(slug: string | null, volume: number) {
      ambient.current?.stop()
      ambient.current = null
      if (!slug) return
      const track = AMBIENT_TRACKS.find((t) => t.slug === slug)
      const c = ensure()
      if (!track || !c) return
      ambient.current = createAmbient(c, track.src, { fadeInSec: 0.8, autoStopAfterSec: 6, volume })
    },
    level(volume: number) {
      ambient.current?.setVolume(volume)
    },
  }
}

export type DoorAudio = ReturnType<typeof useDoorAudio>

export function SoundSection({
  cues,
  set,
  audio,
  summary,
  open,
  onToggle,
  intervalBell,
  endBell,
  hint,
  flag = 'bell',
}: {
  cues: CueSettings
  set: (patch: TimerSettingsPatch) => void
  audio: DoorAudio
  summary: string
  open: boolean
  onToggle: () => void
  /** The silent sit modes offer a bell every N minutes; Breathe and Get Moving do not. */
  intervalBell: boolean
  /** The closing double strike is the sit's; Get Moving rings its own end. */
  endBell: boolean
  hint: string
  /** Which on/off this section flips: the sit's `bell` (default off) or Get Moving's `moveBell` (default on). */
  flag?: 'bell' | 'moveBell'
}) {
  const on = cues[flag]
  return (
    <DoorSection icon={<Volume2 className="h-4 w-4" />} name="Sound" summary={summary} open={open} onToggle={onToggle}>
      <ToggleRow label="Sound" hint={hint} checked={on} onChange={(v) => set({ cues: { [flag]: v } })} />
      {on && (
        <>
          <OptionRow
            label="Bell voice"
            value={cues.bellTone}
            options={BELL_TONES.map((t) => ({ value: t.slug, label: t.name }))}
            onChange={(slug) => {
              set({ cues: { bellTone: slug } })
              audio.strike(slug, cues.bellVolume)
            }}
          />
          <VolumeRange label="Bell volume" value={cues.bellVolume} onChange={(v) => set({ cues: { bellVolume: v } })} onCommit={(v) => audio.strike(cues.bellTone, v)} />
          {intervalBell && (
            <OptionRow label="Interval bell" value={cues.bellEveryMin} options={BELL_INTERVALS.map((iv) => ({ value: iv.value as number, label: iv.label }))} onChange={(v) => set({ cues: { bellEveryMin: v } })} />
          )}
          {endBell && <ToggleRow label="End bell" hint="A double strike when the sit ends." checked={cues.endBell} onChange={(v) => set({ cues: { endBell: v } })} />}
        </>
      )}
    </DoorSection>
  )
}

export function FeelSection({
  cues,
  set,
  summary,
  open,
  onToggle,
  vibrationHint,
}: {
  cues: CueSettings
  set: (patch: TimerSettingsPatch) => void
  summary: string
  open: boolean
  onToggle: () => void
  vibrationHint: string
}) {
  return (
    <DoorSection icon={<Sparkles className="h-4 w-4" />} name="Feel" summary={summary} open={open} onToggle={onToggle}>
      <OptionRow label="Countdown" columns={3} value={cues.warmupSec} options={WARMUP_PRESETS.map((w) => ({ value: w as number, label: `${w} s` }))} onChange={(v) => set({ cues: { warmupSec: v } })} />
      <ToggleRow label="Vibration" hint={vibrationHint} checked={cues.haptics} onChange={(v) => set({ cues: { haptics: v } })} />
    </DoorSection>
  )
}
