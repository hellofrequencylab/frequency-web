'use client'

// The Be Still settings of the Mindless door (LIVE-2241, redesigned under LIVE-2245): the breath
// pattern with its how-to and custom counts, the Journal note, and the shared Sound, Ambient and
// Feel cues. On a phone they are disclosure rows under the practice; on the web the breath pattern
// and the note are sections of the main column and the cues sit in "Sound and feel". Every control
// exists in the sit engine; this is the same setting reached from the door, written to the one
// settings model so the engine mounts with it.

import { useState } from 'react'
import { BookOpen, Info } from 'lucide-react'
import { BreatheIcon } from '@/components/on-air/icons'
import { Textarea } from '@/components/ui/field'
import { BREATH_PATTERNS, CUSTOM_PHASE_MAX, CUSTOM_PHASE_MIN, buildCustomPattern, type BreathPattern } from '@/lib/on-air'
import type { TimerSettings, TimerSettingsPatch } from '@/lib/on-air/timer-settings'
import { MenuRow, RowLabel, Segmented, Slider, SwitchRow, Tiles, WebSection } from './door-section'
import { AmbientSection, FeelSection, SoundSection, type CueScope, type DoorAudio } from './cue-sections'

const NOTE_PLACEHOLDER = 'What happened? One line is plenty.'
export const NOTE_MAX = 280

/** The pattern the settings name, with Custom built from its three counts. */
export function currentPattern(still: TimerSettings['still']): BreathPattern {
  return still.patternSlug === 'custom'
    ? buildCustomPattern(still.customIn, still.customHold, still.customOut)
    : (BREATH_PATTERNS.find((p) => p.slug === still.patternSlug) ?? BREATH_PATTERNS[0])
}

function counts(p: BreathPattern): string {
  return p.phases.map((ph) => ph.seconds).join('-')
}

/** "Box 4-4-4-4", "4-7-8", "Custom 4-2-6". */
export function describeBreath(still: TimerSettings['still']): string {
  const p = currentPattern(still)
  const c = counts(p)
  return p.name === c ? p.name : `${p.name} ${c}`
}

const tileOptions = () => [
  ...BREATH_PATTERNS.map((p) => ({ value: p.slug, label: p.name, sub: p.slug === '478' ? 'in, hold, out' : counts(p) })),
  { value: 'custom', label: 'Custom', sub: 'your counts' },
]

function CustomSliders({ still, set, accent, columns }: { still: TimerSettings['still']; set: (patch: TimerSettingsPatch) => void; accent: 'still' | 'move'; columns: boolean }) {
  const rows = [
    { label: 'In', key: 'customIn' as const, min: CUSTOM_PHASE_MIN, value: still.customIn },
    { label: 'Hold', key: 'customHold' as const, min: 0, value: still.customHold },
    { label: 'Out', key: 'customOut' as const, min: CUSTOM_PHASE_MIN, value: still.customOut },
  ]
  return (
    <div className={columns ? 'grid grid-cols-3 gap-4' : 'flex flex-col'}>
      {rows.map((r) => (
        <Slider key={r.key} stacked={columns} label={r.label} min={r.min} max={CUSTOM_PHASE_MAX} value={r.value} text={r.key === 'customHold' && !r.value ? 'None' : `${r.value} s`} accent={accent} onChange={(v) => set({ still: { [r.key]: v } })} />
      ))}
    </div>
  )
}

function HowItWorks({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} className="flex h-8 items-center gap-1.5 px-1 text-body-sm font-medium text-muted hover:text-text">
      <Info className="h-3.75 w-3.75" aria-hidden /> How it works
    </button>
  )
}

function Instructions({ pattern }: { pattern: BreathPattern }) {
  return (
    <div role="note" className="rounded-control bg-ink px-3.5 py-3 text-body-sm leading-normal text-on-ink">
      {pattern.instructions}
    </div>
  )
}

/** Web: the Breath pattern section (Breathe only). */
export function BreathWebSection({ settings, set, accent }: { settings: TimerSettings; set: (patch: TimerSettingsPatch) => void; accent: 'still' | 'move' }) {
  const [how, setHow] = useState(false)
  const pattern = currentPattern(settings.still)
  return (
    <WebSection label="Breath pattern" aside={<HowItWorks open={how} onToggle={() => setHow((v) => !v)} />}>
      <Tiles label="Breath pattern" columns={6} height="h-13" value={settings.still.patternSlug} options={tileOptions()} onChange={(slug) => set({ still: { patternSlug: slug } })} />
      {how && <Instructions pattern={pattern} />}
      {settings.still.patternSlug === 'custom' && <CustomSliders still={settings.still} set={set} accent={accent} columns />}
    </WebSection>
  )
}

/** Mobile: the Breath row. */
function BreathSection({ settings, set, accent, open, onToggle}: { settings: TimerSettings; set: (patch: TimerSettingsPatch) => void; accent: 'still' | 'move'; open: boolean; onToggle: () => void }) {
  const [how, setHow] = useState(false)
  const pattern = currentPattern(settings.still)
  const options = tileOptions().map((o) => ({ value: o.value, label: o.label }))
  return (
    <MenuRow icon={<BreatheIcon className="h-4.5 w-4.5" />} name="Breath" summary={describeBreath(settings.still)} open={open} onToggle={onToggle}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <RowLabel>Pattern</RowLabel>
          <HowItWorks open={how} onToggle={() => setHow((v) => !v)} />
        </div>
        <Segmented label="Pattern" size="sm" value={settings.still.patternSlug} options={options.slice(0, 3)} onChange={(slug) => set({ still: { patternSlug: slug } })} />
        <Segmented label="More patterns" size="sm" value={settings.still.patternSlug} options={options.slice(3)} onChange={(slug) => set({ still: { patternSlug: slug } })} />
      </div>
      {how && <Instructions pattern={pattern} />}
      {settings.still.patternSlug === 'custom' && <CustomSliders still={settings.still} set={set} accent={accent} columns={false} />}
      <SwitchRow label="Breath count" checked={settings.cues.showBreathCount} onChange={(v) => set({ cues: { showBreathCount: v } })} />
    </MenuRow>
  )
}

/** The optional note, typed on the door and carried into the sit (Journal keeps it on the live
 *  screen; Just Log sends it with the log). `well` is the web and Just Log field; the row form
 *  sits inside the mobile Note row. */
export function NoteField({ value, onChange, variant }: { value: string; onChange: (v: string) => void; variant: 'web' | 'sheet' | 'row' }) {
  const look =
    variant === 'web'
      ? 'min-h-22 rounded-control bg-surface px-3.5 py-3 ring-1 ring-inset ring-border-strong'
      : variant === 'sheet'
        ? 'min-h-20 rounded-[16px] bg-surface px-4 py-3 ring-1 ring-inset ring-border'
        : 'min-h-20 rounded-control bg-surface-elevated px-3.5 py-3'
  return (
    <Textarea
      variant="seamless"
      aria-label="Session note"
      placeholder={NOTE_PLACEHOLDER}
      maxLength={NOTE_MAX}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full border-0 text-body leading-normal text-text ${look}`}
    />
  )
}

/** Mobile: every Be Still row for the current style, one open at a time. */
export function StillSections({
  settings,
  set,
  audio,
  scope,
  breathMode,
  journal,
  note,
  onNote,
  openRow,
  onToggleRow,
}: {
  settings: TimerSettings
  set: (patch: TimerSettingsPatch) => void
  audio: DoorAudio
  scope: CueScope
  breathMode: boolean
  journal: boolean
  note: string
  onNote: (v: string) => void
  openRow: string | null
  onToggleRow: (id: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-[20px] bg-surface ring-1 ring-inset ring-border lift-1" aria-label="Settings">
      {breathMode && <BreathSection settings={settings} set={set} accent={scope.accent} open={openRow === 'breath'} onToggle={() => onToggleRow('breath')} />}
      {journal && (
        <MenuRow icon={<BookOpen className="h-4.5 w-4.5" />} name="Note" summary={note || 'Optional'} open={openRow === 'note'} onToggle={() => onToggleRow('note')}>
          <NoteField value={note} onChange={onNote} variant="row" />
        </MenuRow>
      )}
      <SoundSection cues={settings.cues} set={set} audio={audio} scope={scope} open={openRow === 'sound'} onToggle={() => onToggleRow('sound')} />
      <AmbientSection cues={settings.cues} set={set} audio={audio} accent={scope.accent} open={openRow === 'ambient'} onToggle={() => onToggleRow('ambient')} />
      <FeelSection cues={settings.cues} set={set} open={openRow === 'feel'} onToggle={() => onToggleRow('feel')} />
    </div>
  )
}
