import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'

// ── Wiring guard: the way OUT of a staff Space preview (LIVE-062 batch 3) ────────────────
// previewAsSpace (wired on /admin/spaces) sets the entity view-as cookie for 8 hours, and
// exitSpacePreview sat orphaned: nothing called it, so a staffer was stuck in the preview
// (with the staff axis stripped by getStaffMember) until the cookie expired. The ladder
// control's exit never shows for an entity target, because that target leaves the COMMUNITY
// role unchanged. Source-shape, per the house archetype
// (components/messages/message-member-button.test.ts): unwiring this is silent — the preview
// still works, the exit just disappears — so no runtime test would fail.

const banner = readFileSync('components/spaces/staff-preview-banner.tsx', 'utf8')
const button = readFileSync('components/spaces/exit-space-preview-button.tsx', 'utf8')
const actions = readFileSync('app/(main)/view-as-actions.ts', 'utf8')

describe('the staff preview banner carries the exit', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(banner.length).toBeGreaterThan(1000)
    expect(button.length).toBeGreaterThan(1000)
  })

  it('renders ExitSpacePreviewButton', () => {
    expect(banner).toContain("from '@/components/spaces/exit-space-preview-button'")
    expect(banner).toContain('<ExitSpacePreviewButton />')
  })

  it('shows the exit only when the entity preview cookie is actually set', () => {
    // The banner renders on the janitor axis alone (staffViewing), cookie or no cookie — a
    // janitor who navigated straight to an owner surface has nothing to exit, so the button
    // must gate on the cookie, not ride along unconditionally.
    expect(banner).toContain('isEntityTarget(await readViewAsTarget())')
    expect(banner).toContain('{previewing && <ExitSpacePreviewButton />}')
  })
})

describe('the exit button calls the action and follows its contract', () => {
  it('is a client component that calls exitSpacePreview from the shared actions file', () => {
    expect(button).toContain("'use client'")
    expect(button).toContain("from '@/app/(main)/view-as-actions'")
    expect(button).toContain('await exitSpacePreview()')
  })

  it('hard-reloads after the action, the same full repaint ViewAsControl does', () => {
    // The action deletes the cookie and revalidates, but performs no redirect; the cookie
    // gates chrome + the staff axis, so a soft re-render of this page alone is not enough.
    expect(button).toContain('window.location.reload()')
  })

  it('composes the button kit and keeps the copy plain', () => {
    expect(button).toContain("buttonClasses('secondary', 'sm'")
    // Matched on comment-free source (scan2 L8-04): the needle also sits in a comment of the pinned
    // file, so a bare toContain stayed green with the code deleted.
    expect(sourceWithoutComments('components/spaces/exit-space-preview-button.tsx')).toContain('Exit preview')
  })
})

describe('the action contract the button relies on holds', () => {
  it('exitSpacePreview deletes the cookie and revalidates the whole layout', () => {
    const body = actions.slice(actions.indexOf('export async function exitSpacePreview'))
    expect(body).toContain('jar.delete(VIEW_AS_COOKIE)')
    expect(body).toContain("revalidatePath('/', 'layout')")
  })
})
