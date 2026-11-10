'use client'

// THE MINDLESS DOOR (LIVE-2241, LIVE-2242, LIVE-2243; redesigned under LIVE-2245 from the Claude
// Design handoff of 2026-11-10). One door, two layouts on the same props and the same choice:
//
//   • under 840px, a full-screen sheet: the Be Still | Get Moving pill, the breathing orb that IS
//     the length field (minus / plus beside it, presets under it), the Practice and How pickers,
//     the settings rows (Breath, Plan, Cues, Note, Sound, Ambient, Feel; one open at a time) and a
//     docked Go with the "Logs as" line;
//   • from 840px, a dialog: a Today rail of practices on the left, the main column (title, Style
//     tiles, Length, Breath pattern / Plan / Note, Sound and feel) and a footer with the summary,
//     Cancel and Go. Esc closes, Enter starts, the arrows change the minutes.
//
// Nothing either engine can do sits behind a second screen; every setting is written to the one
// timer settings model (lib/on-air/timer-settings.ts) so the engine mounts with it. Tokens only
// (docs/THEME.md); the one action fill is Go.

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BookOpen, Check, ChevronDown, Dumbbell, Flower2, Footprints, Lock, Minus, Moon, Plus, Rabbit, Sparkles, StretchHorizontal, Volleyball, X } from 'lucide-react'
import { useDialogFocusTrap } from '@/components/ui/use-dialog-focus-trap'
import { Input } from '@/components/ui/field'
import { BoltIcon, BreatheIcon, DialIcon, LotusIcon } from '@/components/on-air/icons'
import { unlockTimerAudio } from '@/lib/on-air/timer-audio-unlock'
import {
  BREATH_DURATION_PRESETS,
  DURATION_PRESETS,
  SESSION_MODE_META,
  SESSION_MODE_ORDER,
  bellToneBySlug,
  engineForMode,
  modeForMindless,
  modeHasNote,
  type OnAirPrefs,
  type SessionMode,
} from '@/lib/on-air'
import {
  MOVEMENT_MODES,
  RUN_DURATION_PRESETS,
  STRETCH_DURATION_PRESETS,
  WALK_DURATION_PRESETS,
  sanitizeMovementConfig,
  type MovementConfig,
  type MovementMode,
} from '@/lib/movement'
import {
  MINUTE_MAX,
  clampMemberMinutes,
  defaultMoveConfig,
  isValidMemberMinutes,
  mergeTimerSettings,
  moveMinutes,
  withMoveMinutes,
  type TimerSettings,
  type TimerSettingsPatch,
} from '@/lib/on-air/timer-settings'
import { useTimerSettings } from './use-timer-settings'
import { Keycap, Segmented, Tiles } from './door/door-section'
import { SoundAndFeel, useDoorAudio, type CueScope } from './door/cue-sections'
import { BreathWebSection, NoteField, StillSections } from './door/still-sections'
import { MoveSections, PlanWebSection, clock, describePlan, moveCue } from './door/move-sections'
import { MINDLESS_TAGLINE } from './mode-toggle'
import type { TimerMode } from './mindless'
import type { OnAirPractice } from './session'

export type SetupChoice = {
  practiceId: string
  mode: TimerMode
  /** A Be Still open length the member typed or tapped (never for Get Moving: the config carries it). */
  minutesOverride?: number
  /** The Be Still sub-mode and breath pattern the member set on the door (LIVE-2241). */
  stillMode?: SessionMode
  patternSlug?: string
  /** The Get Moving configuration the member composed on the door (LIVE-2242). */
  moveConfig?: MovementConfig
  /** Start fresh (LIVE-2243): ignore today's partial on the practice and run the chosen length from zero. */
  fresh?: boolean
  /** The note typed on the door for Journal or Just Log (LIVE-2245); the engine carries it into the log. */
  note?: string
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

/** The Get Moving config a practice opens on: its creator's preset, or for the Free Practice the
 *  member's remembered configuration (the saved Get Moving memory), else a 20 min walk. */
function moveConfigFor(p: OnAirPractice | undefined, remembered: MovementConfig | null): MovementConfig {
  if (p && !p.logsAs && p.movementConfig) {
    const config = sanitizeMovementConfig(p.movementConfig)
    // A practice whose config names no length of its own runs its authored minutes.
    return p.durationMin && p.durationMin > 0 && moveMinutes(config) !== null && !hasOwnMinutes(p.movementConfig) ? withMoveMinutes(config, p.durationMin) : config
  }
  return remembered ? sanitizeMovementConfig(remembered) : defaultMoveConfig('walk', null)
}

function hasOwnMinutes(c: MovementConfig): boolean {
  return c.walkMinutes != null || c.runMinutes != null || c.stretchMinutes != null
}

const MOVE_PRESETS: Record<MovementMode, readonly number[]> = {
  walk: WALK_DURATION_PRESETS,
  run: RUN_DURATION_PRESETS,
  stretch: STRETCH_DURATION_PRESETS,
  yoga: [],
  strength: [],
  play: [],
}

const ICON = 'h-4.5 w-4.5'
const STILL_ICON: Record<SessionMode, ReactNode> = {
  timer: <LotusIcon className={ICON} />,
  breath: <BreatheIcon className={ICON} />,
  journal: <BookOpen className={ICON} aria-hidden />,
  stillness: <Moon className={ICON} aria-hidden />,
  ritual: <Sparkles className={ICON} aria-hidden />,
  log: <BoltIcon className={ICON} />,
}
const MOVE_ICON: Record<MovementMode, ReactNode> = {
  walk: <Footprints className={ICON} aria-hidden />,
  run: <Rabbit className={ICON} aria-hidden />,
  yoga: <Flower2 className={ICON} aria-hidden />,
  strength: <Dumbbell className={ICON} aria-hidden />,
  stretch: <StretchHorizontal className={ICON} aria-hidden />,
  play: <Volleyball className={ICON} aria-hidden />,
}

/** The web dialog from 840px; the sheet under it. The server snapshot is the sheet (the door is a
 *  client chunk, so this only decides the first client paint). */
const WEB_QUERY = '(min-width: 840px)'
function useWebLayout(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const m = typeof window.matchMedia === 'function' ? window.matchMedia(WEB_QUERY) : null
      m?.addEventListener?.('change', notify)
      return () => m?.removeEventListener?.('change', notify)
    },
    () => (typeof window.matchMedia === 'function' ? !!window.matchMedia(WEB_QUERY).matches : false),
    () => false,
  )
}

/** What the member has set in one mode; kept apart so switching Be Still | Get Moving and back loses nothing. */
interface ModeState {
  pickedId: string | undefined
  stillPick: SessionMode | null
  movePick: { practiceId: string | undefined; config: MovementConfig } | null
  /** A length the member chose on the door (NaN while the typed number is not a real one). */
  custom: number | null
  /** The raw text in the minutes field while they type it. */
  typed: string | null
  freshFor: string | null
  /** A breath pattern the member picked on the door; until then an authored practice shows its own. */
  patternPick: string | null
}
const blank = (pickedId?: string): ModeState => ({ pickedId, stillPick: null, movePick: null, custom: null, typed: null, freshFor: null, patternPick: null })

const MINUTES_LABEL = `Minutes, 1 to ${MINUTE_MAX}`
const INVALID_LINE = `Choose 1 to ${MINUTE_MAX} minutes.`

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
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogFocusTrap(true, panel)
  const web = useWebLayout()
  const { initial, save } = useTimerSettings(prefs)
  const [saved, setSaved] = useState<TimerSettings>(initial)
  const audio = useDoorAudio()
  const [mode, setMode] = useState(initialMode)
  const [states, setStates] = useState<Record<TimerMode, ModeState>>(() => ({ still: blank(initialMode === 'still' ? initialPracticeId : undefined), move: blank(initialMode === 'move' ? initialPracticeId : undefined) }))
  const cur = states[mode]
  const patch = (o: Partial<ModeState>) => setStates((s) => ({ ...s, [mode]: { ...s[mode], ...o } }))
  const set = (p: TimerSettingsPatch) => {
    setSaved((s) => mergeTimerSettings(s, p))
    save(p)
    if (p.still?.patternSlug) patch({ patternPick: p.still.patternSlug })
  }
  const [note, setNote] = useState('')
  // The mobile pickers and settings rows: one thing open at a time.
  const [picker, setPicker] = useState<'practice' | 'how' | null>(null)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const togglePicker = (k: 'practice' | 'how') => {
    setPicker((p) => (p === k ? null : k))
    setOpenRow(null)
  }
  const toggleRow = (id: string) => {
    setOpenRow((r) => (r === id ? null : id))
    setPicker(null)
  }

  const available = setupPractices(practices, mode)
  const practice = available.find((p) => p.id === cur.pickedId) ?? available.find((p) => p.logsAs) ?? available[0]
  // A practice that ships its own breath pattern (a Box breathing practice ships Box) shows and runs
  // it until the member picks another; the member's remembered pattern is never overwritten by it.
  const authoredPattern = mode === 'still' && !cur.patternPick && practice && !practice.logsAs ? practice.breathPattern : null
  const settings: TimerSettings = authoredPattern ? { ...saved, still: { ...saved.still, patternSlug: authoredPattern } } : saved
  const isFree = !!practice?.logsAs
  const explicit = practice?.id === explicitPracticeId

  // Be Still: the sub-mode, pre-set by the practice until the member picks one.
  const stillMode: SessionMode = cur.stillPick ?? stillModeFor(practice, explicit)

  // Get Moving: the composed configuration, pre-set by the practice (or the Free memory) until the
  // member changes it. Keyed by practice so a practice pick re-seeds.
  const moveConfig: MovementConfig = cur.movePick && cur.movePick.practiceId === practice?.id ? cur.movePick.config : moveConfigFor(practice, settings.move)
  const setMoveConfig = (next: MovementConfig) => {
    patch({ movePick: { practiceId: practice?.id, config: next } })
    // The Free Practice memory is what the member last composed unattached; an authored practice
    // keeps its creator's preset and is never remembered over it.
    if (isFree) set({ move: next })
  }

  // Continue or Start fresh (LIVE-2243): a practice with a partial today continues by default, as the
  // engines always did silently; the door now says so and offers the fresh start beside it.
  const partial = practice?.partialToday ?? null
  const remainingSec = partial && partial.targetSec > 0 ? Math.max(0, partial.targetSec - partial.bankedSec) : 0
  const hasPartial = remainingSec > 0 && practice?.timerKind !== 'none'
  const fresh = hasPartial && cur.freshFor === practice?.id
  const continuing = hasPartial && !fresh
  const remainingMin = Math.max(1, Math.ceil(remainingSec / 60))
  const bankedMin = partial ? Math.round(partial.bankedSec / 60) : 0
  const targetMin = partial ? Math.round(partial.targetSec / 60) : 0
  const lockedByAuthor = !!practice?.durationLocked && !isFree
  const plan = mode === 'move' ? describePlan(moveConfig) : null
  const structured = !!plan
  const openCount = mode === 'move' && moveConfig.mode === 'play'
  const logOnly = mode === 'still' ? stillMode === 'log' : practice?.timerKind === 'none'
  const authored = lockedByAuthor && ((practice?.durationMin ?? 0) > 0 || mode === 'move')
  const locked = authored || structured || logOnly || openCount || continuing
  const editable = !locked
  const configuredStill = practice?.durationMin ?? null
  const minutes = continuing ? remainingMin : mode === 'move' ? (moveMinutes(moveConfig) ?? 0) : (cur.custom ?? configuredStill ?? settings.still.minutes)
  // A typed length (say "0" on the way to "10") stays out of the plan: the field alone decides
  // whether Go is live until the number is a real one.
  const valid = isValidMemberMinutes(minutes) && (cur.custom === null || isValidMemberMinutes(cur.custom))
  const invalid = editable && !valid
  const presets: readonly number[] = mode === 'move' ? MOVE_PRESETS[moveConfig.mode] : stillMode === 'breath' ? BREATH_DURATION_PRESETS : DURATION_PRESETS
  const raw = cur.typed ?? String(minutes)

  const pickLength = (m: number) => {
    if (mode === 'move') {
      if (isValidMemberMinutes(m)) {
        patch({ custom: null, typed: null })
        setMoveConfig(withMoveMinutes(moveConfig, m))
      } else patch({ custom: m })
      return
    }
    patch({ custom: m, typed: null })
    // The open length is the member's own number: remembered the moment they choose it, never an
    // authored length and never a locked one.
    if (!locked && configuredStill == null && isValidMemberMinutes(m)) set({ still: { minutes: m } })
  }
  const typeLength = (text: string) => {
    const v = text.replace(/[^\d]/g, '').slice(0, 3)
    const n = Number(v)
    if (v && isValidMemberMinutes(n)) {
      pickLength(n)
      patch({ typed: v })
    } else patch({ custom: NaN, typed: v })
  }
  const stepLength = (d: number) => {
    if (!editable) return
    const base = valid ? minutes : mode === 'move' ? (moveMinutes(moveConfig) ?? 20) : (configuredStill ?? settings.still.minutes)
    pickLength(clampMemberMinutes(base + d))
  }

  const pickPractice = (p: OnAirPractice) => {
    patch({ ...blank(p.id) })
    if (!web) setPicker(null)
  }
  const pickStill = (m: SessionMode) => {
    // A style on a practice with no length of its own seeds that style's default minutes.
    patch({ stillPick: m, typed: null, custom: configuredStill == null && m !== 'log' ? SESSION_MODE_META[m].defaultMin : null })
    if (!web) setPicker(null)
  }
  const pickMove = (m: MovementMode) => {
    patch({ custom: null, typed: null })
    setMoveConfig(defaultMoveConfig(m, settings.move))
    if (!web) setPicker(null)
  }
  const switchMode = (next: TimerMode) => {
    setMode(next)
    setPicker(null)
    setOpenRow(null)
  }

  const choice = (): SetupChoice =>
    mode === 'move'
      ? { practiceId: practice!.id, mode, moveConfig, ...(fresh ? { fresh: true } : {}) }
      : {
          practiceId: practice!.id,
          mode,
          ...(!locked && valid ? { minutesOverride: minutes } : {}),
          ...(fresh ? { fresh: true } : {}),
          stillMode,
          patternSlug: settings.still.patternSlug,
          ...(modeHasNote(stillMode) && note.trim() ? { note: note.trim() } : {}),
        }
  const goDisabled = !practice || (!locked && !valid)
  const go = () => {
    if (goDisabled) return
    unlockTimerAudio()
    onStart(choice())
  }
  const goLabel = logOnly ? 'Log it' : continuing ? `Continue, ${remainingMin} min left` : 'Start timer'
  const goIcon = logOnly ? <BoltIcon className="h-4.5 w-4.5" /> : <DialIcon className="h-4.5 w-4.5" />
  const startFresh = () => patch({ freshFor: practice?.id ?? null, custom: null, typed: null })

  // Keyboard: Esc closes; on the web Enter starts (unless a field or button has focus) and the arrows
  // change the minutes while they are editable.
  const keys = useRef({ go, stepLength, editable, web, onClose })
  useEffect(() => {
    keys.current = { go, stepLength, editable, web, onClose }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current
      const tag = (e.target as HTMLElement | null)?.tagName ?? ''
      if (e.key === 'Escape') {
        e.preventDefault()
        k.onClose()
        return
      }
      if (!k.web || /INPUT|TEXTAREA|SELECT/.test(tag)) return
      if (e.key === 'Enter' && tag !== 'BUTTON') {
        e.preventDefault()
        k.go()
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && k.editable) {
        e.preventDefault()
        k.stepLength(e.key === 'ArrowRight' ? 1 : -1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // --- The words -----------------------------------------------------------------------------
  const styleLabel = mode === 'move' ? (MOVEMENT_MODES.find((m) => m.mode === moveConfig.mode)?.label ?? 'Walk') : SESSION_MODE_META[stillMode].label
  const styleIcon = mode === 'move' ? MOVE_ICON[moveConfig.mode] : STILL_ICON[stillMode]
  const styleNote = mode === 'move' ? (lockedByAuthor ? 'Set by your practice.' : (MOVEMENT_MODES.find((m) => m.mode === moveConfig.mode)?.blurb ?? '')) : SESSION_MODE_META[stillMode].subline
  const styleLocked = lockedByAuthor
  const logsAs = practice?.logsAs ? (practices.find((p) => p.id === practice.logsAs)?.title ?? practice.title) : practice?.title ?? ''
  const runPractice = practice && !practice.logsAs ? practice : null
  const journey = runPractice && journeyLegs.length > 0 ? journeyLegs[0] : null
  const journeyLabel = journey ? (journey.week != null ? `Week ${journey.week} of ${journey.weeks}` : `${journey.title}, all weeks open`) : null
  const extra = journeyLabel ?? (runPractice?.loggedToday ? 'already counted today, this one is extra' : practicedToday >= 3 ? `${practicedToday} practiced today` : null)
  const sessionLine = `Logs as ${logsAs}${extra ? ` · ${extra}` : ''}`
  const lengthText = continuing ? `${remainingMin} min left` : plan ? `${clock(plan.total)} ${plan.short}` : openCount ? 'Open count-up' : logOnly ? 'No timer' : `${valid ? minutes : settings.still.minutes} min`
  const headline = [styleLabel, logOnly ? null : lengthText, journeyLabel ?? (runPractice?.loggedToday ? 'Done today, this one is extra' : null)].filter(Boolean).join(' · ')
  const soundOn = mode === 'move' ? settings.cues.moveBell : settings.cues.bell
  const intervalBell = mode === 'still' && engineForMode(stillMode) === 'timer'
  const summary = logOnly
    ? `Logs as ${logsAs} now. No countdown.`
    : `${settings.cues.warmupSec} s countdown, then ${lengthText} of ${styleLabel}. ${soundOn ? `${bellToneBySlug(settings.cues.bellTone).name} bell${intervalBell && settings.cues.bellEveryMin ? ` every ${settings.cues.bellEveryMin} min` : ''}. ` : ''}Logs as ${logsAs}.`
  const scope: CueScope = {
    flag: mode === 'move' ? 'moveBell' : 'bell',
    accent: mode,
    intervalBell,
    endBell: mode === 'still',
    breathCount: mode === 'still' && stillMode === 'breath',
    ambient: mode === 'still',
    cue: mode === 'move' && !lockedByAuthor ? moveCue(moveConfig, setMoveConfig) : undefined,
  }
  const orbLine: { text: string; role: 'alert' | 'note'; lock?: boolean; live?: boolean } | null = invalid
    ? { text: INVALID_LINE, role: 'alert', live: true }
    : continuing
      ? { text: `${bankedMin} of ${targetMin} min banked today`, role: 'note' }
      : authored
        ? { text: `Fixed length, set by ${practice?.title}`, role: 'note', lock: true }
        : plan
          ? { text: plan.short, role: 'note' }
          : openCount
            ? { text: 'Stop whenever you are done.', role: 'note' }
            : null
  const orbValue = editable ? raw : continuing ? String(remainingMin) : plan ? clock(plan.total) : openCount ? 'Open' : logOnly ? 'Log' : String(minutes)
  const orbUnit = continuing ? 'min left' : plan ? 'total' : openCount ? 'counts up' : logOnly ? 'no timer' : 'min'
  const orbSize = openCount || logOnly ? 'text-display-h3' : plan ? 'text-display-h2' : 'text-display-h1'
  const readout = !editable && (continuing || authored || openCount)
  const readoutText = continuing ? `${remainingMin} min left of ${targetMin}. ${bankedMin} min banked today.` : authored ? `${minutes} min, set by ${practice?.title}` : 'Open. It counts up until you stop.'
  const readoutIcon = continuing ? <DialIcon className="h-4.25 w-4.25" /> : openCount ? <Volleyball className="h-4.25 w-4.25" aria-hidden /> : <Lock className="h-4.25 w-4.25" aria-hidden />

  const practiceRows = available.map((p) => {
    const on = p.id === practice?.id
    const pPartial = p.partialToday && p.partialToday.targetSec > 0 && p.timerKind !== 'none' ? Math.max(0, p.partialToday.targetSec - p.partialToday.bankedSec) : 0
    const left = pPartial > 0 ? Math.max(1, Math.ceil(pPartial / 60)) : 0
    const style = mode === 'move' ? moveConfigFor(p, settings.move) : null
    const styleName = p.logsAs ? null : mode === 'move' ? (MOVEMENT_MODES.find((m) => m.mode === style!.mode)?.label ?? 'Walk') : SESSION_MODE_META[stillModeFor(p, p.id === explicitPracticeId)].label
    const length = p.logsAs ? null : mode === 'move' ? (style && describePlan(style)?.short) || (p.durationMin ? `${p.durationMin} min` : null) : p.durationMin ? `${p.durationMin} min` : null
    const meta = p.logsAs ? 'Any style, any length' : [styleName, length, p.durationLocked ? 'fixed' : null].filter(Boolean).join(', ')
    const tag = left ? { text: `${left} min left`, look: 'bg-primary-bg text-text' } : p.loggedToday ? { text: 'Done', look: 'bg-presence-bg text-presence', done: true } : on && journeyLabel ? { text: journeyLabel, look: 'bg-primary-bg text-primary-strong' } : p.durationLocked && !p.logsAs ? { text: 'Fixed', look: 'bg-surface-elevated text-text' } : null
    const sheetMeta = left ? `${left} min left` : p.loggedToday ? `Done today · ${meta}` : meta
    return { p, on, meta, sheetMeta, tag, icon: p.logsAs ? <Sparkles className="h-4.25 w-4.25" aria-hidden /> : mode === 'move' ? MOVE_ICON[style!.mode] : STILL_ICON[stillModeFor(p, p.id === explicitPracticeId)] }
  })

  const stillTiles = SESSION_MODE_ORDER.map((m) => ({ value: m, label: SESSION_MODE_META[m].label, icon: STILL_ICON[m], disabled: (practice?.timerKind === 'none' && m !== 'log') || (styleLocked && m !== stillMode) }))
  const moveTiles = MOVEMENT_MODES.map((m) => ({ value: m.mode, label: m.label, icon: MOVE_ICON[m.mode], disabled: styleLocked && m.mode !== moveConfig.mode }))
  const accentBtn = mode === 'move' ? 'bg-move text-on-move' : 'bg-primary text-on-primary'
  const tabOn: Record<TimerMode, string> = { still: 'bg-primary text-on-primary lift-2', move: 'bg-move text-on-move lift-2' }
  const orbFill = mode === 'move' ? 'radial-gradient(circle at 35% 30%, var(--color-surface) 0, var(--color-presence-bg) 34%, color-mix(in oklab, var(--color-move) 45%, var(--color-surface)) 100%)' : 'var(--design-practice-orb)'

  const goButton = (size: 'sheet' | 'web') => (
    <button
      type="button"
      onClick={go}
      disabled={goDisabled}
      className={`flex items-center justify-center gap-2.5 rounded-pill font-semibold lift-2 transition-opacity disabled:opacity-40 ${accentBtn} ${size === 'sheet' ? 'h-14 w-full text-body' : 'h-12 min-w-55 px-5.5 text-body-sm'}`}
    >
      {goIcon}
      {goLabel}
      {size === 'web' && <Keycap className="ml-1 opacity-55">Enter</Keycap>}
    </button>
  )
  const styleTiles = mode === 'move' ? <Tiles label="Style" columns={web ? 6 : 3} value={moveConfig.mode} options={moveTiles} onChange={pickMove} /> : <Tiles label="Style" columns={web ? 6 : 3} value={stillMode} options={stillTiles} onChange={pickStill} />
  const minutesInput = (className: string) => (
    <Input
      variant="seamless"
      type="text"
      inputMode="numeric"
      aria-label={MINUTES_LABEL}
      aria-invalid={invalid || undefined}
      value={raw}
      onChange={(e) => typeLength(e.target.value)}
      className={className}
    />
  )
  const webMain = mode === 'still' ? (
    <>
      {stillMode === 'breath' && <BreathWebSection settings={settings} set={set} accent="still" />}
      {modeHasNote(stillMode) && (
        <section className="flex flex-col gap-2.5">
          <span className="text-body-sm font-semibold text-text">Note</span>
          <NoteField value={note} onChange={setNote} variant="web" />
        </section>
      )}
    </>
  ) : (
    plan && <PlanWebSection config={moveConfig} onConfig={setMoveConfig} locked={lockedByAuthor} />
  )

  // --- Web dialog (from 840px) ---------------------------------------------------------------
  if (web) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
        <div className="flex min-h-dvh items-center justify-center bg-surface-elevated/55 p-8">
          <div ref={panel} role="dialog" aria-modal="true" aria-label="Mindless timer setup" tabIndex={-1} className="flex h-[min(780px,calc(100dvh-64px))] w-full max-w-265 flex-col overflow-hidden rounded-[28px] bg-surface ring-1 ring-inset ring-border lift-3 outline-none">
            <header className="flex h-17 shrink-0 items-center gap-9 border-b border-border pl-7 pr-5">
              <span className="eyebrow flex items-center gap-2.5 text-text">
                <LotusIcon className="h-5.5 w-5.5" /> Mindless
              </span>
              <div role="tablist" aria-label="Timer mode" className="flex gap-7 self-stretch">
                {(['still', 'move'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => switchMode(m)}
                    className={`flex items-center gap-2 px-0.5 text-body-sm font-semibold ${mode === m ? `text-text ${m === 'move' ? 'shadow-[inset_0_-2px_0_var(--color-move)]' : 'shadow-[inset_0_-2px_0_var(--color-text)]'}` : 'text-muted hover:text-text'}`}
                  >
                    {m === 'still' ? <LotusIcon className="h-4.25 w-4.25" /> : <Footprints className="h-4.25 w-4.25" aria-hidden />}
                    {m === 'still' ? 'Be Still' : 'Get Moving'}
                  </button>
                ))}
              </div>
              <span className="flex-1" />
              <span className="text-body-sm text-subtle">{MINDLESS_TAGLINE}</span>
              <button type="button" aria-label="Close" onClick={onClose} className="flex h-10 items-center gap-2 rounded-pill pl-3 pr-2.5 text-meta font-medium text-muted hover:text-text">
                <Keycap className="ring-border-strong">Esc</Keycap>
                <X className="h-4.5 w-4.5" aria-hidden />
              </button>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-[264px_minmax(0,1fr)] min-[1200px]:grid-cols-[300px_minmax(0,1fr)]">
              <aside aria-label="Your practices" className="flex min-h-0 flex-col gap-3 overflow-y-auto border-r border-border bg-surface-elevated px-3.5 pb-4.5 pt-5.5">
                <span className="eyebrow px-2.5 text-muted">Today</span>
                <div className="flex flex-col gap-1">
                  {practiceRows.map(({ p, on, meta, tag, icon }) => (
                    <button key={p.id} type="button" aria-pressed={on} aria-label={`${p.title}`} onClick={() => pickPractice(p)} className={`flex min-h-15 items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition-colors ${on ? 'bg-surface ring-[1.5px] ring-inset ring-text lift-1' : 'hover:bg-surface/60'}`}>
                      <span className={`flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-[11px] text-text ${on ? 'bg-surface-elevated' : 'bg-surface'}`}>{icon}</span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.75">
                        <span className="truncate text-body-sm font-semibold text-text">{p.title}</span>
                        <span className="truncate text-meta text-muted">{meta}</span>
                      </span>
                      {tag && (
                        <span className={`flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-2.25 text-2xs font-semibold ${tag.look}`}>
                          {tag.done && <Check className="h-2.75 w-2.75" strokeWidth={2.6} aria-hidden />}
                          {tag.text}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <span className="flex-1" />
                {practicedToday >= 3 && (
                  <span className="flex items-center gap-2 px-2.5 text-meta text-muted">
                    <span className="h-1.75 w-1.75 rounded-pill bg-primary" aria-hidden />
                    {practicedToday} members practiced today
                  </span>
                )}
              </aside>
              <main className="flex min-h-0 flex-col gap-6.5 overflow-y-auto px-9 pb-7 pt-6.5">
                <div className="flex items-center gap-4">
                  <span className="fq-breathe h-12 w-12 shrink-0 rounded-pill ring-1 ring-inset ring-surface/70 lift-2 motion-reduce:animate-none" aria-hidden style={{ background: orbFill }} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.25">
                    <h2 id={titleId} className="m-0 font-display text-display-card font-medium leading-tight tracking-[-0.04em] text-text">{practice?.title}</h2>
                    <span className="text-body-sm text-muted">{headline}</span>
                  </div>
                </div>
                <section className="flex flex-col gap-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-body-sm font-semibold text-text">Style</span>
                    {styleLocked && (
                      <span className="flex items-center gap-1.5 text-meta font-medium text-muted">
                        <Lock className="h-3 w-3" aria-hidden /> Set by your practice
                      </span>
                    )}
                  </div>
                  {styleTiles}
                  <span className="text-body-sm text-muted">{styleNote}</span>
                </section>
                {editable && (
                  <section className="flex flex-col gap-2.5">
                    <span className="text-body-sm font-semibold text-text">Length</span>
                    <div className="flex flex-wrap items-center gap-3">
                      <Segmented label="Length presets" className="flex-[1_1_320px]" value={minutes} options={presets.map((m) => ({ value: m, label: `${m} min` }))} onChange={pickLength} />
                      <div className={`flex h-12 shrink-0 items-center rounded-control bg-surface ring-inset ${invalid ? 'ring-[1.5px] ring-danger' : 'ring-1 ring-border-strong'}`}>
                        <button type="button" aria-label="One minute less" onClick={() => stepLength(-1)} className="flex h-12 w-10 items-center justify-center text-text">
                          <Minus className="h-3.75 w-3.75" aria-hidden />
                        </button>
                        {minutesInput('h-10 w-11 border-0 text-center text-card-title font-semibold tabular-nums text-text')}
                        <span className="text-body-sm font-medium text-muted">min</span>
                        <button type="button" aria-label="One minute more" onClick={() => stepLength(1)} className="flex h-12 w-10 items-center justify-center text-text">
                          <Plus className="h-3.75 w-3.75" aria-hidden />
                        </button>
                      </div>
                    </div>
                    {invalid && <span role="alert" className="text-body-sm font-medium text-danger">{INVALID_LINE}</span>}
                  </section>
                )}
                {readout && (
                  <section className="flex flex-col gap-2.5">
                    <span className="text-body-sm font-semibold text-text">Length</span>
                    <div role="group" aria-label={continuing ? 'Continue or start fresh' : 'Length'} className="flex min-h-13 items-center gap-3 rounded-control bg-surface-elevated px-4">
                      <span className="text-muted">{readoutIcon}</span>
                      <span className="flex-1 text-body font-semibold text-text">{readoutText}</span>
                      {continuing && (
                        <button type="button" onClick={startFresh} className="h-9 rounded-pill bg-surface px-3.5 text-body-sm font-semibold text-text ring-1 ring-inset ring-border-strong">
                          Start fresh
                        </button>
                      )}
                    </div>
                  </section>
                )}
                {webMain}
                <SoundAndFeel cues={settings.cues} set={set} audio={audio} scope={scope} />
              </main>
            </div>
            <footer className="flex shrink-0 items-center gap-4 border-t border-border bg-surface py-4 pl-7 pr-5">
              <span className="min-w-0 flex-1 text-body-sm text-muted">{summary}</span>
              <button type="button" onClick={onClose} className="h-12 rounded-pill px-5 text-body-sm font-semibold text-text ring-1 ring-inset ring-border-strong">Cancel</button>
              {goButton('web')}
            </footer>
          </div>
        </div>
      </div>
    )
  }

  // --- The sheet (under 840px) ---------------------------------------------------------------
  const pickerField = (open: boolean) => `flex h-14 min-w-0 items-center gap-2 rounded-[16px] bg-surface pl-3.5 pr-3 text-left ${open ? 'ring-[1.5px] ring-inset ring-text' : 'ring-1 ring-inset ring-border lift-1'}`
  return (
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="fixed inset-0 z-50 overflow-y-auto bg-canvas outline-none">
      <div className="mx-auto flex min-h-dvh w-full max-w-120 flex-col px-5">
        <div className="flex items-center justify-between pt-[max(14px,env(safe-area-inset-top))]">
          <span id={titleId} className="eyebrow flex items-center gap-2.5 text-text">
            <LotusIcon className="h-5.5 w-5.5" /> Mindless
          </span>
          <button type="button" onClick={onClose} className="-mr-2.5 flex h-11 w-11 items-center justify-center rounded-pill text-muted hover:text-text">
            <X className="h-4.5 w-4.5" aria-hidden />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <div role="tablist" aria-label="Timer mode" className="mb-5.5 mt-2 grid grid-cols-2 gap-1 rounded-pill bg-surface-elevated p-1">
          {(['still', 'move'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`flex h-11 items-center justify-center gap-1.75 rounded-pill text-body-sm font-semibold transition-colors ${mode === m ? tabOn[m] : 'text-muted'}`}
            >
              {m === 'still' ? <LotusIcon className="h-4 w-4" /> : <Footprints className="h-4 w-4" aria-hidden />}
              {m === 'still' ? 'Be Still' : 'Get Moving'}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
            <button type="button" disabled={!editable} onClick={() => stepLength(-1)} className="flex h-12 w-12 items-center justify-center justify-self-center rounded-pill bg-surface text-text ring-1 ring-inset ring-border lift-1 disabled:opacity-30">
              <Minus className="h-4.5 w-4.5" aria-hidden />
              <span className="sr-only">One minute less</span>
            </button>
            <div className="relative flex h-41 w-41 items-center justify-center">
              <span className="fq-breathe absolute -inset-[8%] rounded-pill opacity-50 blur-[22px] motion-reduce:animate-none" aria-hidden style={{ background: orbFill }} />
              <span className="fq-breathe absolute inset-0 rounded-pill ring-1 ring-inset ring-surface/70 motion-reduce:animate-none" aria-hidden style={{ background: orbFill }} />
              {/* The number sits on the pale orb in both day and night, so it reads in the fixed ink. */}
              <div className="relative flex flex-col items-center gap-1.5 text-ink">
                {editable ? (
                  minutesInput(`w-27.5 border-0 p-0 text-center font-display font-medium leading-none tracking-[-0.05em] ${orbSize} ${invalid ? 'text-danger' : 'text-ink'}`)
                ) : (
                  <span className={`font-display font-medium leading-none tracking-[-0.05em] tabular-nums ${orbSize}`}>{orbValue}</span>
                )}
                <span className="eyebrow opacity-70">{orbUnit}</span>
              </div>
            </div>
            <button type="button" disabled={!editable} onClick={() => stepLength(1)} className="flex h-12 w-12 items-center justify-center justify-self-center rounded-pill bg-surface text-text ring-1 ring-inset ring-border lift-1 disabled:opacity-30">
              <Plus className="h-4.5 w-4.5" aria-hidden />
              <span className="sr-only">One minute more</span>
            </button>
          </div>
          {editable && <Segmented label="Length presets in minutes" size="lg" className="w-full" value={minutes} options={presets.map((m) => ({ value: m, label: String(m), aria: `${m} minutes` }))} onChange={pickLength} />}
          {orbLine && (
            <p role={orbLine.role} className={`m-0 flex items-center gap-1.5 text-center text-body-sm font-medium ${orbLine.live ? 'text-danger' : 'text-muted'}`}>
              {orbLine.lock && <Lock className="h-3.25 w-3.25" aria-hidden />}
              {orbLine.text}
            </p>
          )}
          {mode === 'still' && stillMode === 'log' && <NoteField value={note} onChange={setNote} variant="sheet" />}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" aria-expanded={picker === 'practice'} onClick={() => togglePicker('practice')} className={pickerField(picker === 'practice')}>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-2xs font-medium text-muted">Practice</span>
              <span className="truncate text-body font-semibold text-text">{practice?.title}</span>
            </span>
            <ChevronDown className={`h-3.75 w-3.75 shrink-0 text-muted transition-transform ${picker === 'practice' ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          <button type="button" aria-expanded={picker === 'how'} onClick={() => togglePicker('how')} className={pickerField(picker === 'how')}>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-1 text-2xs font-medium text-muted">
                How {styleLocked && <Lock className="h-2.75 w-2.75" aria-hidden />}
              </span>
              <span className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-body font-semibold text-text">
                <span className="[&>svg]:h-3.75 [&>svg]:w-3.75">{styleIcon}</span>
                {styleLabel}
              </span>
            </span>
            <ChevronDown className={`h-3.75 w-3.75 shrink-0 text-muted transition-transform ${picker === 'how' ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        </div>
        {picker === 'practice' && (
          <div role="group" aria-label="Your practices" className="mt-2 flex flex-col gap-0.5 rounded-[20px] bg-surface p-1.5 ring-1 ring-inset ring-border lift-2">
            {practiceRows.map(({ p, on, sheetMeta }) => (
              <button key={p.id} type="button" aria-pressed={on} onClick={() => pickPractice(p)} className={`flex min-h-13 items-center gap-3 rounded-control px-3 py-2 text-left ${on ? 'bg-surface-elevated' : ''}`}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.75">
                  <span className="text-body font-semibold text-text">{p.title}</span>
                  <span className="text-meta text-muted">{sheetMeta}</span>
                </span>
                {on && <Check className="h-4.5 w-4.5 text-text" aria-hidden />}
              </button>
            ))}
          </div>
        )}
        {picker === 'how' && (
          <div className="mt-2 flex flex-col gap-2 rounded-[20px] bg-surface p-2 ring-1 ring-inset ring-border lift-2">
            {styleTiles}
            <span className="px-1.5 pb-1 pt-0.5 text-body-sm text-muted">{styleNote}</span>
          </div>
        )}

        <div className="mt-3">
          {mode === 'still' ? (
            <StillSections settings={settings} set={set} audio={audio} scope={scope} breathMode={stillMode === 'breath'} journal={stillMode === 'journal'} note={note} onNote={setNote} openRow={openRow} onToggleRow={toggleRow} />
          ) : (
            !logOnly && <MoveSections config={moveConfig} onConfig={setMoveConfig} settings={settings} set={set} audio={audio} scope={scope} locked={lockedByAuthor} openRow={openRow} onToggleRow={toggleRow} />
          )}
        </div>

        <div className="min-h-4 flex-1" />
        <div className="sticky bottom-0 z-[2] flex flex-col gap-1.5 bg-gradient-to-t from-canvas from-72% to-transparent pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
          {goButton('sheet')}
          <div role={continuing ? 'group' : undefined} aria-label={continuing ? 'Continue or start fresh' : undefined} className="flex min-h-5.5 items-center justify-center gap-2.5 text-center text-body-sm text-muted">
            <span>{sessionLine}</span>
            {continuing && (
              <button type="button" onClick={startFresh} className="h-8 px-1 text-body-sm font-semibold text-text underline underline-offset-[3px]">
                Start fresh
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
