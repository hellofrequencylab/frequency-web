import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Guards for the four verified HIGHS the meta scan left open, plus the RSVP silent-failure fix.
// Each assertion was confirmed to FAIL against the pre-fix tree — a green suite that would also
// have been green before the fix proves nothing.
//
// These are source-shape guards on purpose. Every defect here is a fact about the RENDERED
// markup or the route layout that no unit test of a pure function can observe: a skeleton in the
// wrong directory, a modal with no dialog role, a negative margin that disagrees with the shell's
// padding, a <label> with nothing to point at.

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('/people/<handle> route skeleton', () => {
  // `/people` is now only a redirect into the Network hub (ADR-172), so the segment's own
  // loading.tsx — a directory GRID of person cards — was the nearest one Next.js found for the
  // DETAIL route too. Opening a profile flashed six card skeletons, then reflowed into a Detail
  // page: the wrong shape and a layout shift on every profile open.
  it('gives the detail route its own skeleton', () => {
    expect(existsSync(join(root, 'app/(main)/people/[handle]/loading.tsx'))).toBe(true)
  })

  it('no longer leaks the directory grid skeleton onto the detail route', () => {
    expect(existsSync(join(root, 'app/(main)/people/loading.tsx'))).toBe(false)
  })

  it('paints the Detail shape (hero + band + 2/3 content beside a 1/3 aside)', () => {
    const src = read('app/(main)/people/[handle]/loading.tsx')
    expect(src).toContain('xl:grid-cols-3')
    expect(src).toContain('xl:col-span-2')
    expect(src).toContain('<aside')
    // NOT the directory grid it used to inherit.
    expect(src).not.toContain('sm:grid-cols-2 lg:grid-cols-3')
  })
})

describe('⌘K search overlay is a real modal', () => {
  // The overlay owned its backdrop, ESC and scroll-lock but was not a dialog to assistive tech:
  // Tab walked straight out into the page behind it, and closing dropped focus to <body>, so a
  // keyboard user restarted from the top of the document.
  const src = read('components/search/search-overlay.tsx')

  it('names itself as a modal dialog', () => {
    expect(src).toContain('role="dialog"')
    expect(src).toContain('aria-modal="true"')
    expect(src).toMatch(/aria-label="Search"/)
  })

  it('traps focus and restores it on close via the shared hook', () => {
    expect(src).toContain('useDialogFocusTrap')
    expect(src).toMatch(/useDialogFocusTrap\(true,\s*panelRef\)/)
  })

  it('gives the trap a panel to trap inside', () => {
    expect(src).toMatch(/ref=\{panelRef\}/)
  })
})

describe('chat routes respect the shell gutter', () => {
  // The shell pads its main column `px-4 sm:px-6 lg:px-8` with `py-6`. A flat `-mx-6` therefore
  // over-pulled by 8px on mobile (bleeding past the viewport into a horizontal scroll) and
  // under-pulled at lg. `100vh` ignores the iOS dynamic toolbar and pushed the composer
  // off-screen; 18 other files already use dvh.
  const FILES = [
    'app/(main)/messages/[id]/loading.tsx',
    'app/(main)/messages/[id]/page.tsx',
    'app/(main)/messages/r/[roomId]/page.tsx',
  ]

  it.each(FILES)('%s mirrors the shell padding and uses dvh', (f) => {
    const src = read(f)
    expect(src).toContain('-mx-4 -my-6 sm:-mx-6 lg:-mx-8')
    expect(src).toContain('100dvh-3.5rem')
    expect(src).not.toContain('"-mx-6 -my-6')
    expect(src).not.toContain('100vh-3.5rem')
  })
})

describe('Create Event form labels are associated', () => {
  // A bare <Label>Name</Label> beside an <Input /> renders a <label> with no htmlFor and an input
  // with no id, so the control is programmatically unlabelled: a screen reader announces
  // "edit text, blank", and clicking the label does not focus the field. Create Event had 17.
  const src = read('app/(main)/events/new/event-form.tsx')

  it('every Label either points at a control or names a group', () => {
    // Each <Label ...> opening tag must carry htmlFor (labels a control) or id (named group,
    // referenced by an aria-labelledby on a role="group" wrapper).
    const tags = src.match(/<Label\b[^>]*>/g) ?? []
    expect(tags.length).toBeGreaterThan(0)
    const orphans = tags.filter((t) => !t.includes('htmlFor') && !t.includes('id='))
    expect(orphans).toEqual([])
  })

  it('button groups are named as groups, since a button group is not labelable', () => {
    for (const id of ['event-repeats-label', 'event-attendance-label', 'event-price-label']) {
      expect(src).toContain(`id="${id}"`)
      expect(src).toContain(`aria-labelledby="${id}"`)
    }
    expect(src).toContain('role="group"')
  })

  it('each htmlFor has a control carrying the matching id', () => {
    const targets = [...src.matchAll(/htmlFor="([^"]+)"/g)].map((m) => m[1]!)
    expect(targets.length).toBeGreaterThan(0)
    for (const t of targets) expect(src).toContain(`id="${t}"`)
  })
})

describe('RSVP reports a failed write', () => {
  // setRsvp returns null when the upsert fails. That result was discarded, so a failed write fell
  // through to revalidate + a silent success: the member watched the control flip to "Going" and
  // the host never got the RSVP.
  it('the depth action returns an outcome instead of swallowing the null', () => {
    const src = read('app/(main)/events/[slug]/social-actions.ts')
    expect(src).toMatch(/Promise<\{\s*ok:\s*boolean\s*\}>/)
    expect(src).toMatch(/const saved = await setRsvp\(/)
    expect(src).toMatch(/if \(!saved\) return \{ ok: false \}/)
  })

  it('the control surfaces the failure instead of reporting success', () => {
    const src = read('components/events/rsvp-controls.tsx')
    expect(src).toContain('RSVP_SAVE_ERROR')
    expect(src).toMatch(/role="alert"/)
    // The success callback must be gated on the action's reported outcome.
    expect(src).toMatch(/if \(!res\.ok\)/)
  })
})
