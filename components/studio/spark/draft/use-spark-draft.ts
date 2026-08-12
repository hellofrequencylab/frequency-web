'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE SPARK AUTOSAVE (docs/adr-drafts/991-wizard-autosave.md).
//
// One hook, called once, by the SHELL. Every Spark inherits autosave and the resume offer without
// a line of its own, which is the whole reason it lives here and not in five wizards.
//
// It reads and writes what the author TYPED, by watching the controls mounted inside the shell's
// stage. That is deliberate, and it is what lets this work with no wizard change at all:
//   • the kit stays entity-blind (it never learns what a Journey is, only that a textarea has text),
//   • deferred creation is untouched (nothing leaves the device before the commit the wizards gate),
//   • and what is recovered is exactly the expensive thing: the writing, not a regenerable draft.
//
// The debounce, the save state, and the "saved" cue are NOT reinvented: this composes the Studio's
// existing autosave engine (`components/studio/kit/use-studio-draft.ts`) with a local write in place
// of a server action, so a Spark and an editor behave the same way and there is one loop, not two.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ok } from '@/lib/action-result'
import { useStudioDraft, type SaveState } from '../../kit/use-studio-draft'
import { applyValues, collectValues } from './draft-dom'
import {
  discardDraft,
  hasDraftContent,
  pruneDrafts,
  readDraft,
  savedAgoLabel,
  writeDraft,
  type StorageLike,
} from './draft-store'

/**
 * `checking` until the store has been read (the first client effect), then `offer` when there is a
 * draft waiting on an answer, or `active` once the author has answered or there was nothing to ask.
 */
export type SparkDraftPhase = 'checking' | 'offer' | 'active'

export interface SparkDraftHandle {
  phase: SparkDraftPhase
  saveState: SaveState
  /** "6 minutes ago". Fixed at the moment the offer is made, so nothing ticks under the reader. */
  savedLabel: string
  /** True once the author took the offer, until they move to another step. */
  restored: boolean
  restore: () => void
  discard: () => void
}

const PROBE_KEY = 'frequency.spark.probe'

/** localStorage, or null where it is blocked (private mode, an embedded webview, a locked-down
 *  browser). Autosave is an assist: when there is nowhere to put a draft, the Spark just works
 *  the way it always did. */
function safeStorage(): StorageLike | null {
  try {
    const store = window.localStorage
    // Reading the object is not enough: Safari's private mode hands one over and throws on WRITE,
    // so the probe has to be a write.
    store.setItem(PROBE_KEY, '1')
    store.removeItem(PROBE_KEY)
    return store
  } catch {
    return null
  }
}

/**
 * Throw away a Spark's saved draft, from anywhere in the browser. The shell already does this when
 * a commit navigates away; this is the escape hatch for a flow that commits WITHOUT leaving (a Spark
 * that swaps itself for the thing it just made, say).
 */
export function clearSparkDraft(scope: string): void {
  const store = safeStorage()
  if (store) discardDraft(store, scope)
}

export function useSparkDraft(opts: {
  /** The per-Spark key (see `draftScope`). Null turns autosave off for this surface. */
  scope: string | null
  step: number
  stageRef: RefObject<HTMLElement | null>
  /** The wizard's in-flight flag, which is also how a commit is recognised (see below). */
  busy?: boolean
}): SparkDraftHandle {
  const { scope, step, stageRef, busy = false } = opts

  /** Phase and its label move together (a phase of `offer` always has a "when"), so they are one
   *  piece of state: two would mean two renders and two writes for a single decision. */
  const [state, setState] = useState<{ phase: SparkDraftPhase; savedLabel: string }>({
    phase: 'checking',
    savedLabel: '',
  })
  /** The step the offer was taken on. The "restored" line belongs to that moment, so this is
   *  compared with the current step rather than being switched off by an effect later. */
  const [restoredAt, setRestoredAt] = useState<number | null>(null)

  /** Everything captured so far, across every step, merged. Held in a ref because it is written on
   *  each keystroke and nothing renders from it. */
  const values = useRef<Record<string, string>>({})
  /** Saved values still waiting for their control to mount. Emptied key by key as steps appear. */
  const pending = useRef<Record<string, string> | null>(null)
  // The latest step and in-flight flag, readable from a listener and from the unmount cleanup.
  // Synced in an effect rather than during render, which is the rule this repo lints for.
  const stepRef = useRef(step)
  const busyRef = useRef(busy)
  useEffect(() => {
    stepRef.current = step
    busyRef.current = busy
  })

  // The debounced write, on the Studio's autosave engine. `save` is local and cannot fail in a way
  // the author should be told about, so it always reports ok and the engine shows the usual cue.
  const persist = useCallback(async () => {
    if (!scope) return ok()
    const store = safeStorage()
    if (store) writeDraft(store, scope, { step: stepRef.current, values: values.current })
    return ok()
  }, [scope])
  const { saveState, queueSave } = useStudioDraft<void>({ save: persist, debounceMs: 800 })

  // ── Open: prune the stale, then ask (or not) ──
  // Reading the store has to happen AFTER mount: it is browser-only, and deciding during render
  // would make the server and the client disagree about whether the offer is on screen.
  useEffect(() => {
    if (!scope) return
    const store = safeStorage()
    const draft = store ? readDraft(store, scope) : null
    if (store) pruneDrafts(store)
    const waiting = !!draft && hasDraftContent(draft)
    // Seed from what was saved, so a keystroke before the offer is answered merges into the draft
    // instead of replacing it with one field.
    if (waiting && draft) values.current = { ...draft.values }
    // Syncing state FROM an external store on mount is what an effect is for; there is no
    // render-time read of localStorage that would not break hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setState({ phase: waiting ? 'offer' : 'active', savedLabel: draft ? savedAgoLabel(draft.savedAt) : '' })
  }, [scope])

  // ── Capture: one listener per step, on the stage the shell already keys ──
  useEffect(() => {
    if (!scope || state.phase === 'checking') return
    const stage = stageRef.current
    if (!stage) return
    const onEdit = () => {
      values.current = { ...values.current, ...collectValues(stage, stepRef.current) }
      queueSave()
    }
    stage.addEventListener('input', onEdit)
    stage.addEventListener('change', onEdit)
    return () => {
      stage.removeEventListener('input', onEdit)
      stage.removeEventListener('change', onEdit)
    }
  }, [scope, state.phase, step, stageRef, queueSave])

  // ── Restore: fill each step's controls as that step mounts ──
  // The wizard owns the step machine, so the kit does not jump anyone forward. It hands each saved
  // answer back the moment its field is on screen, and the author walks their own path again.
  useEffect(() => {
    if (state.phase !== 'active' || !pending.current) return
    const stage = stageRef.current
    if (!stage) return
    const left = applyValues(stage, step, pending.current)
    pending.current = Object.keys(left).length === 0 ? null : left
  }, [state.phase, step, stageRef])

  // ── The commit, recognised without a wizard change ──
  // A Spark that succeeds NAVIGATES, and it does so inside the transition that set `busy`. So an
  // unmount while busy is a commit (or a door that created something) and the draft has done its
  // job. Leaving the page any other way keeps it, and a refresh or a crash runs no cleanup at all,
  // which is precisely the case this feature exists for.
  useEffect(() => {
    if (!scope) return
    return () => {
      if (!busyRef.current) return
      const store = safeStorage()
      if (store) discardDraft(store, scope)
    }
  }, [scope])

  const restore = useCallback(() => {
    pending.current = { ...values.current }
    setRestoredAt(stepRef.current)
    setState((prev) => ({ ...prev, phase: 'active' }))
  }, [])

  const discard = useCallback(() => {
    if (scope) {
      const store = safeStorage()
      if (store) discardDraft(store, scope)
    }
    values.current = {}
    pending.current = null
    setRestoredAt(null)
    setState({ phase: 'active', savedLabel: '' })
  }, [scope])

  return {
    phase: state.phase,
    saveState,
    savedLabel: state.savedLabel,
    restored: restoredAt === step,
    restore,
    discard,
  }
}
