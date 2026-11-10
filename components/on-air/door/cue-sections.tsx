'use client'

// The Sound, Ambient and Feel settings of the Mindless door, shared by Be Still and Get Moving
// (LIVE-2241, LIVE-2242, redesigned under LIVE-2245). On a phone they are disclosure rows; on the
// web they are one "Sound and feel" section of selects, switches and volume sliders. Previews (a
// bell strike, a six second ambient audition) run on a tap, which is the gesture that unlocks
// audio. Every change writes the one settings model.

import { useEffect, useRef } from 'react'
import { Waves } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { BellCueIcon, VibrationIcon } from '@/components/on-air/icons'
import { AMBIENT_TRACKS, BELL_INTERVALS, BELL_TONES, WARMUP_PRESETS, bellToneBySlug, bellVolumeScale } from '@/lib/on-air'
import { chime } from '@/lib/timer-audio'
import { createAmbient, type AmbientHandle } from '@/lib/on-air-ambient'
import type { CueSettings, TimerSettingsPatch } from '@/lib/on-air/timer-settings'
import { takeUnlockedAudio } from '@/lib/on-air/timer-audio-unlock'
import { MenuRow, RowLabel, Segmented, Slider, SwitchRow, WebSection } from './door-section'

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
        chime(c, bellToneBySlug(toneSlug), bellVolumeScale(volume))
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

/** What the cue controls need from the door: which on/off they flip, which rows apply to the
 *  current style, and the one movement cue select (Reminder / Split / Switch sides). */
export interface CueScope {
  /** The sit's `bell` (default off) or Get Moving's `moveBell` (default on). */
  flag: 'bell' | 'moveBell'
  accent: 'still' | 'move'
  /** The silent sit styles offer a bell every N minutes; Breathe and Get Moving do not. */
  intervalBell: boolean
  /** The closing double strike is the sit's; Get Moving rings its own end. */
  endBell: boolean
  /** Breathe shows the count toggle. */
  breathCount: boolean
  /** Be Still offers the ambient loop. */
  ambient: boolean
  /** Walk, Run and Stretch: the one minute cue. */
  cue?: { label: string; value: number; options: readonly { value: number; label: string }[]; onChange: (v: number) => void }
}

export const pct = (v: number) => `${Math.round(v * 100)}%`
export const ambientLevel = (v: number) => (v < 0.4 ? 'low' : v < 0.75 ? 'medium' : 'high')

function bellOptions(): { value: string; label: string }[] {
  return [{ value: 'off', label: 'Off' }, ...BELL_TONES.map((t) => ({ value: t.slug, label: t.name }))]
}

/** The Sound row summary: "Warm, every 5 min, end bell" or "Off". */
export function describeSound(cues: CueSettings, scope: CueScope): string {
  if (!cues[scope.flag]) return 'Off'
  return [
    bellToneBySlug(cues.bellTone).name,
    scope.intervalBell && cues.bellEveryMin > 0 ? `every ${cues.bellEveryMin} min` : null,
    scope.endBell && cues.endBell ? 'end bell' : null,
  ]
    .filter(Boolean)
    .join(', ')
}

export function describeAmbient(cues: CueSettings): string {
  const track = AMBIENT_TRACKS.find((t) => t.slug === cues.ambientTrack)
  return track ? `${track.name}, ${ambientLevel(cues.ambientVolume)}` : 'Off'
}

export function describeFeel(cues: CueSettings): string {
  return `${cues.warmupSec} s countdown, vibration ${cues.haptics ? 'on' : 'off'}`
}

function pickBell(value: string, cues: CueSettings, scope: CueScope, set: (patch: TimerSettingsPatch) => void, audio: DoorAudio) {
  if (value === 'off') {
    set({ cues: { [scope.flag]: false } })
    return
  }
  set({ cues: { [scope.flag]: true, bellTone: value } })
  audio.strike(value, cues.bellVolume)
}

// --- Mobile rows -----------------------------------------------------------------------------

export function SoundSection({ cues, set, audio, scope, open, onToggle}: { cues: CueSettings; set: (patch: TimerSettingsPatch) => void; audio: DoorAudio; scope: CueScope; open: boolean; onToggle: () => void }) {
  const on = cues[scope.flag]
  return (
    <MenuRow icon={<BellCueIcon className="h-[18px] w-[18px]" />} name="Sound" summary={describeSound(cues, scope)} open={open} onToggle={onToggle}>
      <div className="flex flex-col gap-1.5">
        <RowLabel>Bell, tap to hear it</RowLabel>
        <Segmented label="Bell" size="sm" value={on ? cues.bellTone : 'off'} options={bellOptions()} onChange={(v) => pickBell(v, cues, scope, set, audio)} />
      </div>
      {on && scope.intervalBell && (
        <div className="flex flex-col gap-1.5">
          <RowLabel>Interval bell</RowLabel>
          <Segmented label="Interval bell" size="sm" value={cues.bellEveryMin} options={BELL_INTERVALS.map((iv) => ({ value: iv.value as number, label: iv.label }))} onChange={(v) => set({ cues: { bellEveryMin: v } })} />
        </div>
      )}
      {on && <Slider label="Volume" min={0} max={100} value={Math.round(cues.bellVolume * 100)} text={pct(cues.bellVolume)} accent={scope.accent} onChange={(v) => set({ cues: { bellVolume: v / 100 } })} onCommit={(v) => audio.strike(cues.bellTone, v / 100)} />}
      {on && scope.endBell && <SwitchRow label="End bell" checked={cues.endBell} onChange={(v) => set({ cues: { endBell: v } })} />}
    </MenuRow>
  )
}

export function AmbientSection({ cues, set, audio, accent, open, onToggle }: { cues: CueSettings; set: (patch: TimerSettingsPatch) => void; audio: DoorAudio; accent: 'still' | 'move'; open: boolean; onToggle: () => void }) {
  return (
    <MenuRow icon={<Waves className="h-[18px] w-[18px]" />} name="Ambient" summary={describeAmbient(cues)} open={open} onToggle={onToggle}>
      <div className="flex flex-col gap-1.5">
        <RowLabel>Track, tap to hear it</RowLabel>
        <Segmented
          label="Ambient"
          size="sm"
          value={cues.ambientTrack}
          options={[{ value: null, label: 'Off' }, ...AMBIENT_TRACKS.map((t) => ({ value: t.slug as string | null, label: t.name }))]}
          onChange={(slug) => {
            set({ cues: { ambientTrack: slug } })
            audio.audition(slug, cues.ambientVolume)
          }}
        />
      </div>
      {cues.ambientTrack && (
        <Slider
          label="Volume"
          min={0}
          max={100}
          value={Math.round(cues.ambientVolume * 100)}
          text={pct(cues.ambientVolume)}
          accent={accent}
          onChange={(v) => {
            set({ cues: { ambientVolume: v / 100 } })
            audio.level(v / 100)
          }}
        />
      )}
    </MenuRow>
  )
}

export function FeelSection({ cues, set, open, onToggle }: { cues: CueSettings; set: (patch: TimerSettingsPatch) => void; open: boolean; onToggle: () => void }) {
  return (
    <MenuRow icon={<VibrationIcon className="h-[18px] w-[18px]" />} name="Feel" summary={describeFeel(cues)} open={open} onToggle={onToggle}>
      <div className="flex flex-col gap-1.5">
        <RowLabel>Countdown</RowLabel>
        <Segmented label="Countdown" size="sm" value={cues.warmupSec} options={WARMUP_PRESETS.map((w) => ({ value: w as number, label: `${w} s` }))} onChange={(v) => set({ cues: { warmupSec: v } })} />
      </div>
      <SwitchRow label="Vibration" checked={cues.haptics} onChange={(v) => set({ cues: { haptics: v } })} />
    </MenuRow>
  )
}

// --- Web: one Sound and feel section ---------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-meta font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

export function SoundAndFeel({ cues, set, audio, scope }: { cues: CueSettings; set: (patch: TimerSettingsPatch) => void; audio: DoorAudio; scope: CueScope }) {
  const on = cues[scope.flag]
  return (
    <WebSection label="Sound and feel" className="border-t border-border pt-[22px]">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Bell">
          <Select aria-label="Bell" value={on ? cues.bellTone : 'off'} options={bellOptions()} onChange={(e) => pickBell(e.target.value, cues, scope, set, audio)} />
        </Field>
        {on && scope.intervalBell && (
          <Field label="Interval bell">
            <Select aria-label="Interval bell" value={String(cues.bellEveryMin)} options={BELL_INTERVALS.map((iv) => ({ value: String(iv.value), label: iv.value ? `Every ${iv.value} min` : 'Off' }))} onChange={(e) => set({ cues: { bellEveryMin: Number(e.target.value) } })} />
          </Field>
        )}
        {scope.cue && (
          <Field label={scope.cue.label}>
            <Select aria-label={scope.cue.label} value={String(scope.cue.value)} options={scope.cue.options.map((o) => ({ value: String(o.value), label: o.value ? `Every ${o.value} min` : 'None' }))} onChange={(e) => scope.cue?.onChange(Number(e.target.value))} />
          </Field>
        )}
        {scope.ambient && (
          <Field label="Ambient">
            <Select
              aria-label="Ambient"
              value={cues.ambientTrack ?? 'off'}
              options={[{ value: 'off', label: 'Off' }, ...AMBIENT_TRACKS.map((t) => ({ value: t.slug, label: t.name }))]}
              onChange={(e) => {
                const slug = e.target.value === 'off' ? null : e.target.value
                set({ cues: { ambientTrack: slug } })
                audio.audition(slug, cues.ambientVolume)
              }}
            />
          </Field>
        )}
        <Field label="Countdown">
          <Select aria-label="Countdown" value={String(cues.warmupSec)} options={WARMUP_PRESETS.map((w) => ({ value: String(w), label: `${w} seconds` }))} onChange={(e) => set({ cues: { warmupSec: Number(e.target.value) } })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
        {on && scope.endBell && <SwitchRow inline label="End bell" checked={cues.endBell} onChange={(v) => set({ cues: { endBell: v } })} />}
        <SwitchRow inline label="Vibration" checked={cues.haptics} onChange={(v) => set({ cues: { haptics: v } })} />
        {scope.breathCount && <SwitchRow inline label="Breath count" checked={cues.showBreathCount} onChange={(v) => set({ cues: { showBreathCount: v } })} />}
        <span className="flex-1" />
        {on && <Slider inline label="Bell volume" min={0} max={100} value={Math.round(cues.bellVolume * 100)} text={pct(cues.bellVolume)} accent={scope.accent} onChange={(v) => set({ cues: { bellVolume: v / 100 } })} onCommit={(v) => audio.strike(cues.bellTone, v / 100)} />}
        {scope.ambient && cues.ambientTrack && (
          <Slider
            inline
            label="Ambient volume"
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
      </div>
    </WebSection>
  )
}
