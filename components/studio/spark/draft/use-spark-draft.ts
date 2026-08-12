'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE SPARK AUTOSAVE (docs/adr-drafts/991-wizard-autosave.md, extended by 1001-draft-sync.md).
//
// One hook, called once, by the SHELL. Every Spark inherits autosave and the resume offer without
// a line of its own, which is the whole reason it lives here and not in five wizards.
//
// It reads and writes what the author TYPED, by watching the controls mounted inside the shell's
// stage. That is deliberate, and it is what lets this work with no wizard change at all:
//   • the kit stays entity-blind (it never learns what a Journey is, only that a textarea has text),
//   • deferred creation is untouched (no ENTITY row exists before the commit the wizards gate),
//   • and what is recovered is exactly the expensive thing: the writing, not a regenerable draft.
//
// LOCAL-FIRST, SERVER-SYNCED. There are two copies and they do different jobs:
//
//   • The LOCAL copy (./draft-store) is the fast one. It is written on the same debounce it always
//     was, it is what makes typing feel instant, and it is what survives a crash, a refresh, or a
//     dead connection with zero latency. It is never waited on and never blocked.
//   • The SERVER copy (lib/studio/draft-store via ./draft-actions) is the one that makes a draft
//     THE AUTHOR'S rather than THAT MACHINE'S. It is pushed on a slower cadence, it is allowed to
//     fail, and when it fails the Spark simply behaves the way it did before this existed.
//
// ONE LOOP, not two. The debounce is still the Studio's autosave engine
// (components/studio/kit/use-studio-draft.ts). The server push happens inside the SAME persist
// call, rate limited so it lands about every two seconds rather than on every pause, with a flush
// when the page is hidden or the Spark unmounts. No second timer watches the keyboard.
//
// THE ONE RULE THAT MATTERS: a silent clobber is how someone loses an hour of writing. Pushes are
// gated on the reconcile having completed, so a Spark that never heard back from the server never
// overwrites what the server holds; and when the server copy is newer and different, the author is
// asked rather than told (`reconcileDrafts`, ./draft-sync).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ok } from '@/lib/action-result'
import {
  discardSparkDraftAction,
  loadSparkDraftAction,
  saveSparkDraftAction,
} from '@/lib/studio/draft-actions'
import { useStudioDraft, type SaveState } from '../../kit/use-studio-draft'
import { applyValues, collectValues } from './draft-dom'
import {
  discardDraft,
  pruneDrafts,
  readDraft,
  savedAgoLabel,
  writeDraft,
  type SparkDraft,
  type StorageLike,
} from './draft-store'
import {
  IDLE_GATE,
  afterFailure,
  afterPush,
  mayPush,
  reconcileDrafts,
  type ServerDraft,
  type SyncGate,
} from './draft-sync'

/**
 * `checking` until both copies have been looked at, then:
 *   • `offer`    a draft is waiting on a yes or no,
 *   • `conflict` two drafts disagree and the newer one is not this device's. The author picks.
 *   • `active`   the author has answered, or there was nothing to ask.
 */
export type SparkDraftPhase = 'checking' | 'offer' | 'conflict' | 'active'

export interface SparkDraftHandle {
  phase: SparkDraftPhase
  saveState: SaveState
  /** "6 minutes ago". Fixed at the moment the offer is made, so nothing ticks under the reader. */
  savedLabel: string
  /** True when the draft on offer came from somewhere other than this browser. */
  fromAnotherDevice: boolean
  /** In a conflict: when each copy was last written, already worded. */
  conflict: { localLabel: string; otherLabel: string } | null
  /** True once the author took the offer, until they move to another step. */
  restored: boolean
  restore: () => void
  discard: () => void
  /** Conflict only: take the newer copy from the other device. */
  takeOther: () => void
  /** Conflict only: keep what is on this device, and push it over the other copy. */
  keepLocal: () => void
}

const PROBE_KEY = 'frequency.spark.probe'

/** How long the resume card waits for the server before it decides using the local copy alone. A
 *  slow network delays the CARD, never the wizard: the stage is live underneath the whole time. */
const RECONCILE_DEADLINE_MS = 2_500

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
 * Throw away a Spark's saved draft, both copies, from anywhere in the browser. The shell already
 * does this when a commit navigates away; this is the escape hatch for a flow that commits WITHOUT
 * leaving (a Spark that swaps itself for the thing it just made, say).
 */
export function clearSparkDraft(scope: string): void {
  const store = safeStorage()
  if (store) discardDraft(store, scope)
  void discardSparkDraftAction(scope).catch(() => {})
}

interface OfferState {
  phase: SparkDraftPhase
  savedLabel: string
  fromAnotherDevice: boolean
  conflict: { localLabel: string; otherLabel: string } | null
}

const CLEAN: OfferState = { phase: 'active', savedLabel: '', fromAnotherDevice: false, conflict: null }

export function useSparkDraft(opts: {
  /** The per-Spark key (see `draftScope`). Null turns autosave off for this surface. */
  scope: string | null
  step: number
  stageRef: RefObject<HTMLElement | null>
  /** The wizard's in-flight flag, which is also how a commit is recognised (see below). */
  busy?: boolean
  /** Where this Spark lives and what it calls itself, so the member's Drafts list can offer a way
   *  back into it. Stored verbatim; the kit never interprets either one. */
  route?: string | null
  label?: string | null
}): SparkDraftHandle {
  const { scope, step, stageRef, busy = false, route = null, label = null } = opts

  /** Phase and everything the card needs to say move together (a phase of `offer` always has a
   *  "when"), so they are one piece of state: several would mean several renders and several
   *  writes for a single decision. */
  const [state, setState] = useState<OfferState>({ ...CLEAN, phase: 'checking' })
  /** The step the offer was taken on. The "restored" line belongs to that moment, so this is
   *  compared with the current step rather than being switched off by an effect later. */
  const [restoredAt, setRestoredAt] = useState<number | null>(null)

  /** Everything captured so far, across every step, merged. Held in a ref because it is written on
   *  each keystroke and nothing renders from it. */
  const values = useRef<Record<string, string>>({})
  /** Saved values still waiting for their control to mount. Emptied key by key as steps appear. */
  const pending = useRef<Record<string, string> | null>(null)
  /** The other device's copy, held between the reconcile and the author's answer. */
  const otherCopy = useRef<ServerDraft | null>(null)
  // The latest step and in-flight flag, readable from a listener and from the unmount cleanup.
  // Synced in an effect rather than during render, which is the rule this repo lints for.
  const stepRef = useRef(step)
  const busyRef = useRef(busy)
  const placeRef = useRef({ route, label })
  useEffect(() => {
    stepRef.current = step
    busyRef.current = busy
    placeRef.current = { route, label }
  })

  /** Whether a push is allowed, and when. The rules are pure and live in ./draft-sync; this ref
   *  is only where the answer is kept between renders. */
  const gate = useRef<SyncGate>(IDLE_GATE)

  /** Send the staged copy. `force` skips the cadence, for the flush paths where "later" does not
   *  exist. Fire and forget: nothing on screen ever waits for this. */
  const push = useCallback((scopeKey: string, force = false) => {
    const now = Date.now()
    if (!(force ? gate.current.ready && gate.current.dirty : mayPush(gate.current, now))) return
    gate.current = afterPush(gate.current, now)
    const snapshot = { ...values.current }
    void saveSparkDraftAction(scopeKey, stepRef.current, snapshot, placeRef.current)
      .then((saved) => {
        if (!saved) gate.current = afterFailure(gate.current, Date.now())
      })
      .catch(() => {
        // A network error must never block typing or touch the local copy. The typing goes back to
        // unsent, not lost, and rides out on the next opportunity.
        gate.current = afterFailure(gate.current, Date.now())
      })
  }, [])

  // The debounced write, on the Studio's autosave engine. The LOCAL write is the one the cue
  // reports on: it is synchronous and cannot fail in a way the author should be told about, so
  // this always reports ok. The staged push rides along on the same call, rate limited.
  const persist = useCallback(async () => {
    if (!scope) return ok()
    const store = safeStorage()
    if (store) writeDraft(store, scope, { step: stepRef.current, values: values.current })
    gate.current = { ...gate.current, dirty: true }
    push(scope)
    return ok()
  }, [scope, push])
  const { saveState, queueSave } = useStudioDraft<void>({ save: persist, debounceMs: 800 })

  // ── Open: read the device, ask the server, then reconcile ──
  // Reading either store has to happen AFTER mount: one is browser-only and the other is a round
  // trip, and deciding during render would make the server and the client disagree about whether
  // the offer is on screen.
  useEffect(() => {
    if (!scope) return
    let done = false
    const store = safeStorage()
    const local: SparkDraft | null = store ? readDraft(store, scope) : null
    if (store) pruneDrafts(store)
    // Seed from what was saved, so a keystroke before the offer is answered merges into the draft
    // instead of replacing it with one field.
    if (local) values.current = { ...local.values }

    const decide = (server: ServerDraft | null) => {
      if (done) return
      done = true
      const verdict = reconcileDrafts(local, server)
      otherCopy.current = verdict.outcome === 'conflict' ? verdict.server : null
      let next: OfferState = CLEAN
      if (verdict.outcome === 'local') {
        next = { ...CLEAN, phase: 'offer', savedLabel: savedAgoLabel(verdict.draft.savedAt) }
      } else if (verdict.outcome === 'server') {
        // Nothing on this device to lose, so the other device's copy simply becomes the offer.
        values.current = { ...verdict.draft.values }
        next = {
          ...CLEAN,
          phase: 'offer',
          savedLabel: savedAgoLabel(verdict.draft.savedAt),
          fromAnotherDevice: true,
        }
      } else if (verdict.outcome === 'conflict') {
        next = {
          ...CLEAN,
          phase: 'conflict',
          savedLabel: savedAgoLabel(verdict.local.savedAt),
          conflict: {
            localLabel: savedAgoLabel(verdict.local.savedAt),
            otherLabel: savedAgoLabel(verdict.server.savedAt),
          },
        }
      }
      // Syncing state FROM an external store is what an effect is for, and this one runs from a
      // callback (a timer or a resolved promise) rather than during the effect body, so there is
      // nothing here that could read localStorage at render time and break hydration.
      setState(next)
    }

    // The card waits for the server, briefly. The wizard does not wait for anything.
    const deadline = setTimeout(() => decide(null), RECONCILE_DEADLINE_MS)
    void loadSparkDraftAction(scope)
      .then((server) => {
        // The server answered, so pushing is now safe: whatever it holds, we have seen it.
        gate.current = { ...gate.current, ready: true }
        decide(server)
      })
      .catch(() => {
        // No server today. The gate stays closed, so this session is local-only and cannot
        // overwrite a copy it never managed to read.
        decide(null)
      })

    return () => {
      done = true
      clearTimeout(deadline)
    }
  }, [scope])

  // ── Capture: one listener per step, on the stage the shell already keys ──
  // Live from the first paint, including while the reconcile is still out, so a fast typist never
  // loses the first sentence to a slow round trip.
  useEffect(() => {
    if (!scope) return
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
  }, [scope, step, stageRef, queueSave])

  // ── Flush: the page is going away ──
  // Closing a tab, switching apps, or locking a phone all end typing without ending the session,
  // and none of them run the debounce. This is the event that catches the last sentence, and it is
  // an event rather than a second timer watching the keyboard.
  useEffect(() => {
    if (!scope) return
    const flush = () => {
      if (document.visibilityState === 'hidden') push(scope, true)
    }
    const leave = () => push(scope, true)
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', leave)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', leave)
    }
  }, [scope, push])

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
  // job. Both copies go. Leaving the page any other way keeps them, and a refresh or a crash runs
  // no cleanup at all, which is precisely the case this feature exists for.
  useEffect(() => {
    if (!scope) return
    return () => {
      if (!busyRef.current) {
        push(scope, true)
        return
      }
      const store = safeStorage()
      if (store) discardDraft(store, scope)
      gate.current = { ...gate.current, dirty: false }
      void discardSparkDraftAction(scope).catch(() => {})
    }
  }, [scope, push])

  /** Take whatever is currently held and hand it back to the wizard, step by step. */
  const adopt = useCallback((next: Record<string, string>) => {
    values.current = { ...next }
    pending.current = { ...next }
    setRestoredAt(stepRef.current)
    setState({ ...CLEAN, phase: 'active' })
  }, [])

  const restore = useCallback(() => {
    adopt(values.current)
  }, [adopt])

  const discard = useCallback(() => {
    if (scope) {
      const store = safeStorage()
      if (store) discardDraft(store, scope)
      gate.current = { ...gate.current, dirty: false }
      void discardSparkDraftAction(scope).catch(() => {})
    }
    values.current = {}
    pending.current = null
    otherCopy.current = null
    setRestoredAt(null)
    setState(CLEAN)
  }, [scope])

  /** Conflict: the author chose the newer copy from their other device. */
  const takeOther = useCallback(() => {
    const other = otherCopy.current
    otherCopy.current = null
    if (!other) {
      adopt(values.current)
      return
    }
    // Write it to this device straight away, so the choice survives a refresh made one second later.
    if (scope) {
      const store = safeStorage()
      if (store) writeDraft(store, scope, { step: stepRef.current, values: other.values })
    }
    gate.current = { ...gate.current, dirty: false }
    adopt(other.values)
  }, [adopt, scope])

  /** Conflict: the author chose what is on this device. That decision is what makes the push that
   *  overwrites the other copy legitimate, so it is sent immediately rather than on the cadence. */
  const keepLocal = useCallback(() => {
    otherCopy.current = null
    const kept = { ...values.current }
    adopt(kept)
    if (scope) {
      gate.current = { ...gate.current, dirty: true, nextPushAt: 0 }
      push(scope, true)
    }
  }, [adopt, push, scope])

  return {
    phase: state.phase,
    saveState,
    savedLabel: state.savedLabel,
    fromAnotherDevice: state.fromAnotherDevice,
    conflict: state.conflict,
    restored: restoredAt === step,
    restore,
    discard,
    takeOther,
    keepLocal,
  }
}
