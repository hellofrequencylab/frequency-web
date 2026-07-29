import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  hasUnpublishedWork,
  setUnpublishedWork,
  subscribeUnpublishedWork,
  UNPUBLISHED_WARNING,
} from './unpublished-work'

// ── Warning an operator that their work is not live ───────────────────────────────────────
//
// Owner report: layout edits sat unpublished for days and read as a rendering bug ("I changed
// events to the card view, but they are not showing up"). Autosave made it worse rather than
// better — "Draft · Saved" is literally true and reads as "live". Nothing warned on closing the
// edit panel, and nothing warned on leaving the page.
//
// Owner's instruction: "Make it CLEAR that there is unsaved work with warnings when they try to
// close the edit panel or exit the page."

beforeEach(() => setUnpublishedWork(false))

describe('the flag', () => {
  it('starts clean and round-trips', () => {
    expect(hasUnpublishedWork()).toBe(false)
    setUnpublishedWork(true)
    expect(hasUnpublishedWork()).toBe(true)
    setUnpublishedWork(false)
    expect(hasUnpublishedWork()).toBe(false)
  })

  it('notifies subscribers, and fires immediately on subscribe', () => {
    setUnpublishedWork(true)
    const seen: boolean[] = []
    // The immediate fire matters: the admin bar can mount AFTER the editor has already gone dirty,
    // and a subscriber that only hears future changes would show a stale clean state.
    const off = subscribeUnpublishedWork((v) => seen.push(v))
    expect(seen).toEqual([true])
    setUnpublishedWork(false)
    expect(seen).toEqual([true, false])
    off()
    setUnpublishedWork(true)
    expect(seen).toEqual([true, false]) // unsubscribed
  })

  it('does not re-notify on an unchanged value', () => {
    const seen: boolean[] = []
    const off = subscribeUnpublishedWork((v) => seen.push(v))
    setUnpublishedWork(true)
    setUnpublishedWork(true)
    off()
    expect(seen).toEqual([false, true])
  })
})

describe('both warnings are actually wired', () => {
  const fab = readFileSync('components/entity-blocks/space-publish-fab.tsx', 'utf8')
  const bar = readFileSync('components/layout/admin-bar/admin-bar.tsx', 'utf8')

  it('EXIT THE PAGE: the publish bar registers beforeunload while work is pending', () => {
    expect(fab).toContain("window.addEventListener('beforeunload'")
    // preventDefault + returnValue is all any modern browser honours; the custom string is ignored,
    // which is why the in-page copy has to carry the message too.
    expect(fab).toContain('e.preventDefault()')
    expect(fab).toContain("e.returnValue = ''")
    // Covers BOTH states: bytes in flight, and saved-but-not-published.
    expect(fab).toContain('const unsavedOrUnpublished = saving || hasUnpublishedChanges')
    // And it must be removed again, or every later navigation prompts.
    expect(fab).toContain("window.removeEventListener('beforeunload'")
  })

  it('CLOSE THE PANEL: the admin bar guards BOTH close call sites', () => {
    expect(bar).toContain('hasUnpublishedWork()')
    expect(bar).toContain('UNPUBLISHED_WARNING')
    // Desktop rail and mobile sheet. One guarded and one not is the same bug half-fixed.
    expect(bar.match(/onClose=\{closeGuarded\}/g)?.length).toBe(2)
    expect(bar).not.toContain('onClose={() => setOpen(false)}')
  })

  it('the flag is cleared on unmount, so a stale warning cannot outlive the editor', () => {
    expect(fab).toContain('return () => setUnpublishedWork(false)')
  })
})

describe('the warning copy', () => {
  it('says the thing the operator could not otherwise know', () => {
    // The failure was never "I lost my work" — autosave had it. It was "I thought it was live".
    expect(UNPUBLISHED_WARNING).toContain('not published')
    expect(UNPUBLISHED_WARNING).toContain('Nobody else can see them')
  })

  it('carries no em dash (docs/CONTENT-VOICE.md)', () => {
    expect(UNPUBLISHED_WARNING).not.toContain('—')
  })
})
