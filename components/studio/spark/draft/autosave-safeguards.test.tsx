// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useStudioDraft } from '../../kit/use-studio-draft'
import { discardDraft, readDraft, writeDraft, type StorageLike } from './draft-store'
import { ok } from '@/lib/action-result'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE TWO PERSISTENCE LAYERS UNDER THE SPARK MODAL (ADR-1017, over ADR-991 + 1001).
//
// The modal's close warning is only honest if the thing it promises is true: that what a member
// typed is already saved when they close. These tests hold the two promises the warning makes.
// The layers themselves predate the modal; what is new is that a much lighter gesture now depends
// on them, so they are pinned here rather than assumed.
// ─────────────────────────────────────────────────────────────────────────────────────────────

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  vi.useRealTimers()
})

/** A localStorage stand-in over a plain Map, so a "reload" is just a second reader over the
 *  same backing store. */
function fakeStorage(backing = new Map<string, string>()): StorageLike & { backing: Map<string, string> } {
  return {
    backing,
    get length() {
      return backing.size
    },
    key: (i: number) => [...backing.keys()][i] ?? null,
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
  }
}

// ── LAYER 1: THE BROWSER CACHE ───────────────────────────────────────────────────────────────

describe('the browser cache', () => {
  it('survives a reload: a fresh reader over the same storage finds what was typed', () => {
    const backing = new Map<string, string>()
    const scope = 'circles-new.new-circle'

    // Session one: the member types, and the debounced write lands.
    writeDraft(fakeStorage(backing), scope, { step: 2, values: { name: 'Thursday night run club' } })

    // The tab crashes. A brand-new page load, a brand-new Storage handle, the same disk.
    const afterReload = readDraft(fakeStorage(backing), scope)
    expect(afterReload?.values).toEqual({ name: 'Thursday night run club' })
    expect(afterReload?.step).toBe(2)
  })

  it('leaves NO ghost behind after a discard, so nothing repopulates the next visit', () => {
    const backing = new Map<string, string>()
    const scope = 'circles-new.new-circle'
    writeDraft(fakeStorage(backing), scope, { step: 1, values: { name: 'Thursday night run club' } })
    expect(readDraft(fakeStorage(backing), scope)).not.toBeNull()

    discardDraft(fakeStorage(backing), scope)

    expect(readDraft(fakeStorage(backing), scope)).toBeNull()
    // And nothing of this Spark's is left in storage at all, under any key.
    expect([...backing.keys()].filter((k) => k.includes(scope))).toEqual([])
  })

  it('keeps two Sparks apart, so discarding one cannot erase the other', () => {
    const backing = new Map<string, string>()
    writeDraft(fakeStorage(backing), 'circles-new.new-circle', { step: 1, values: { a: 'circle' } })
    writeDraft(fakeStorage(backing), 'journeys-new.new-journey', { step: 1, values: { a: 'journey' } })

    discardDraft(fakeStorage(backing), 'circles-new.new-circle')

    expect(readDraft(fakeStorage(backing), 'circles-new.new-circle')).toBeNull()
    expect(readDraft(fakeStorage(backing), 'journeys-new.new-journey')?.values).toEqual({ a: 'journey' })
  })
})

// ── THE CADENCE ──────────────────────────────────────────────────────────────────────────────

describe('autosave cadence', () => {
  it('DEBOUNCES: a burst of keystrokes costs one write, not one per key', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => ok())
    let queue: ((patch: void) => void) | null = null

    function Probe() {
      const { queueSave } = useStudioDraft<void>({ save, debounceMs: 800 })
      queue = queueSave
      return null
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root!.render(<Probe />)
    })

    // Twelve keystrokes, 50ms apart: well inside the window.
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        queue!()
      })
      await act(async () => {
        vi.advanceTimersByTime(50)
      })
    }
    // Still nothing written — the member is mid-sentence.
    expect(save).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(800)
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('is wired at 800ms in the Spark autosave, and pushes the server copy on the SAME call', () => {
    // A second timer watching the keyboard would be a second rate limit to get wrong; the server
    // push rides the local debounce instead. Source-level because the hook needs a real Spark
    // around it to exercise, and the property being protected is the wiring.
    const src = readFileSync(join('components', 'studio', 'spark', 'draft', 'use-spark-draft.ts'), 'utf8')
    expect(src).toMatch(/useStudioDraft<void>\(\{ save: persist, debounceMs: 800 \}\)/)
    expect(src).toMatch(/const persist = useCallback\(async \(\) => \{[\s\S]{0,400}push\(scope\)/)
  })
})

// ── LAYER 2, AND THE PAIRING THE DISCARD BUTTON RELIES ON ────────────────────────────────────

describe('discard reaches both layers', () => {
  const src = readFileSync(join('components', 'studio', 'spark', 'draft', 'use-spark-draft.ts'), 'utf8')

  it("the Spark's own discard clears the browser cache AND the studio_draft row", () => {
    const body = /const discard = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[scope\]\)/.exec(src)?.[1] ?? ''
    expect(body).toContain('discardDraft(store, scope)')
    expect(body).toContain('discardSparkDraftAction(scope)')
  })

  it('and it clears the dirty flag, so the unmount flush cannot resurrect what was just erased', () => {
    // The unmount cleanup force-pushes whatever is staged. Without this line, discarding and then
    // closing would put the draft straight back on the member's account — the exact ghost the
    // browser-cache clear above is trying to avoid.
    const body = /const discard = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[scope\]\)/.exec(src)?.[1] ?? ''
    expect(body).toContain('dirty: false')
  })
})
