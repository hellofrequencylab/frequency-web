import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  hasUnpublishedWork,
  setUnpublishedWork,
  subscribeUnpublishedWork,
  UNPUBLISHED_WARNING,
  UNPUBLISHED_LEAVE_WARNING,
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

  it('EXIT THE PAGE, HARD: the publish bar registers beforeunload while work is pending', () => {
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

  it('EXIT THE PAGE, SOFT: an in-app link click is guarded too', () => {
    // 🔴 THE GAP THE FIRST FIX LEFT. `beforeunload` does NOT fire on an App Router client
    // transition, and a click on the nav rail or a Space header tab is how an owner ACTUALLY leaves
    // their page. So the guard written for "the draft sat unpublished for days" was silent on the
    // majority path, and the test above passed while covering the minority one.
    expect(fab).toContain("document.addEventListener('click', onClick, true)")
    expect(fab).toContain("document.removeEventListener('click', onClick, true)")
    // CAPTURE phase, or the router's own handler has already navigated.
    expect(fab).toMatch(/addEventListener\('click', onClick, true\)/)
    expect(fab).toContain('UNPUBLISHED_LEAVE_WARNING')

    // It must NOT hijack the clicks that lose nothing. Each of these leaves the editor open.
    expect(fab).toContain('e.metaKey || e.ctrlKey || e.shiftKey || e.altKey')  // new tab / new window
    expect(fab).toContain("anchor.hasAttribute('download')")
    expect(fab).toContain("anchor.target && anchor.target !== '_self'")
    expect(fab).toContain('url.origin !== window.location.origin')            // leaving the app entirely
    expect(fab).toContain('e.button !== 0')                                    // middle / right click
  })

  it('and the leave warning describes LEAVING, not closing', () => {
    // The panel's warning ends "Close anyway?", which describes the wrong consequence on a click
    // that navigates. Same fact, correct verb; both live in one module so they cannot drift.
    expect(UNPUBLISHED_LEAVE_WARNING).toContain('Leave anyway?')
    expect(UNPUBLISHED_LEAVE_WARNING).not.toContain('Close anyway?')
    expect(UNPUBLISHED_LEAVE_WARNING).not.toContain('—')
  })

  it('CLOSE THE PANEL: EVERY dismissal path is guarded, not just the X button', () => {
    expect(bar).toContain('hasUnpublishedWork()')
    expect(bar).toContain('UNPUBLISHED_WARNING')

    // 1. The X button on the desktop rail and on the mobile sheet.
    expect(bar.match(/onClose=\{closeGuarded\}/g)?.length).toBe(2)
    expect(bar).not.toContain('onClose={() => setOpen(false)}')

    // 2. 🔴 ESCAPE. The standard slide-over dismissal, and the likeliest way to lose a draft
    //    because it takes no aim and leaves no trace. It called setOpen(false) directly and
    //    bypassed the guard entirely.
    //
    //    Called DIRECTLY, not through a ref. The first fix mirrored closeGuarded into a ref and
    //    assigned `ref.current` in the render body to hold the effect deps at [open]; that is the
    //    react-hooks/refs "Cannot access refs during render" violation and it failed CI. The ref
    //    bought nothing: closeGuarded is a useCallback over [setOpen], and a useState setter is
    //    stable for the component's life, so the listener still binds once per open.
    expect(bar).toContain("if (e.key === 'Escape') closeGuarded()")
    expect(bar).toContain('}, [open, closeGuarded])')
    expect(bar).not.toContain('closeGuardedRef')
    expect(bar).not.toMatch(/if \(e\.key === 'Escape'\) setOpen\(false\)/)

    // 3. 🔴 THE MOBILE SCRIM. A second, full-screen control also labelled "Close settings", and
    //    the PRIMARY dismissal gesture on a phone. It uses onClick, not the onClose prop — which
    //    is exactly why the first version of THIS test reported full coverage while missing it.
    expect(bar).toContain('onClick={closeGuarded}')

    // Only ONE bare setOpen(false) may remain: the mobile route-change effect, where a confirm
    // would be pointless because navigation has already happened. Any other is an unguarded exit.
    const bare = bar.match(/setOpen\(false\)/g) ?? []
    expect(bare.length).toBe(2) // one inside closeGuarded itself, one in the route-change effect
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
