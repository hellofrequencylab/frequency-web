import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Every in-flow result list in the event settings rail must be closeable ──────────────────
//
// 🔴 THE BUG. Owner report against the host picker: "once the field of suggested spaces comes up, it
// doesn't close no matter what I do. I have to close the rail for it to turn off."
//
// These lists render IN FLOW rather than as an absolute overlay, and they have to — the settings
// module's `@container` wrapper clips a `top-full` dropdown, which is why all three were written this
// way. In flow, a list that never clears does not merely linger: it pushes the rest of the rail down
// and reads as broken. The host picker even printed "Offer sent." UNDERNEATH a still-live list.
//
// `ScopeSearch` (event-placement-field.tsx) always cleared on pick. The other two never did, and none
// of the three had Escape or click-away. This pins all three, because the next picker added to this
// rail will be copied from one of them.

const PICKERS = [
  { file: 'components/events/event-host-offer-field.tsx', fn: 'HostSpaceSearch' },
  { file: 'components/events/event-share-field.tsx', fn: 'SpaceSearch' },
]

describe.each(PICKERS)('$fn can be closed', ({ file, fn }) => {
  const src = readFileSync(file, 'utf8')
  const body = src.slice(src.indexOf(`function ${fn}(`))

  it('clears on PICK, so a result list never outlives the choice', () => {
    // The exit that matters most: picking is the common path, and leaving the list up made a
    // successful action look like a stuck UI.
    expect(body).toMatch(/onClick=\{\(\) => \{\s*dismiss\(\)/)
  })

  it('clears on ESCAPE, and does not steal the rail dismissal', () => {
    // Escape is the reflex for an open list. Bound to the BOX (not the window) and guarded on there
    // being something to close, so an empty picker still lets Escape close the admin rail itself —
    // otherwise fixing this bug would break the rail's own dismissal, which has its own guard.
    expect(body).toContain("e.key === 'Escape'")
    expect(body).toMatch(/query \|\| spaces\.length > 0/)
    expect(body).toContain('e.stopPropagation()')
  })

  it('clears on a CLICK AWAY, mounted only while something is open', () => {
    expect(body).toContain("document.addEventListener('click', onDocClick, true)")
    expect(body).toContain("document.removeEventListener('click', onDocClick, true)")
    // Guarded on a non-empty list: a document-wide capture listener that is always mounted would
    // intercept every click in the rail for no reason.
    expect(body).toMatch(/if \(spaces\.length === 0\) return/)
  })

  it('cancels the in-flight debounce when it dismisses', () => {
    // Without this, a search that resolves after the dismiss repopulates the list and it reopens by
    // itself — the same stuck list, now with no click to blame.
    expect(body).toMatch(/dismiss = useCallback\(\(\) => \{[\s\S]{0,200}clearTimeout\(debounceRef\.current\)/)
  })
})

describe('the pattern that was already right stays right', () => {
  it('ScopeSearch still clears query + hits after a pick', () => {
    // The reference implementation in the same rail. If this regresses, the two above lose the thing
    // they were modelled on.
    const src = readFileSync('components/events/event-placement-field.tsx', 'utf8')
    expect(src).toContain("setQuery('')")
    expect(src).toContain('setHits([])')
  })
})
