import { describe, it, expect } from 'vitest'
import { nextLayoutPreferences } from './actions'

// The pure preference-merge for a layout change (ADR-472). The action itself re-gates + writes; this
// locks the merge SEMANTICS so a future edit can't silently break the non-destructive guarantee:
//   • 'auto' clears the template override (derive from type + focus), keeps everything else.
//   • a template id sets the override, keeps everything else (incl. the customized puck doc).
//   • opts.reset additionally clears the puck doc, so the new layout's preset actually shows.
describe('nextLayoutPreferences (non-destructive layout merge)', () => {
  it('sets the template override and preserves every other key', () => {
    const current = { template: 'book', puck: { content: [1] }, mode: { toggles: {} } }
    const next = nextLayoutPreferences(current, 'hub')
    expect(next.template).toBe('hub')
    expect(next.puck).toEqual({ content: [1] }) // the customized doc is untouched
    expect(next.mode).toEqual({ toggles: {} }) // mode overrides survive
  })

  it("'auto' clears the template override but preserves the puck doc + other keys", () => {
    const current = { template: 'storefront', puck: { content: [1] }, mode: { labels: {} } }
    const next = nextLayoutPreferences(current, 'auto')
    expect(next).not.toHaveProperty('template')
    expect(next.puck).toEqual({ content: [1] })
    expect(next.mode).toEqual({ labels: {} })
  })

  it('opts.reset clears the puck doc so the new layout preset shows, still preserving other keys', () => {
    const current = { template: 'book', puck: { content: [1] }, mode: { toggles: {} } }
    const next = nextLayoutPreferences(current, 'schedule', { reset: true })
    expect(next.template).toBe('schedule')
    expect(next).not.toHaveProperty('puck') // the customized doc is dropped on reset
    expect(next.mode).toEqual({ toggles: {} })
  })

  it("'auto' with reset clears both the override and the puck doc", () => {
    const current = { template: 'hub', puck: { content: [1] } }
    const next = nextLayoutPreferences(current, 'auto', { reset: true })
    expect(next).not.toHaveProperty('template')
    expect(next).not.toHaveProperty('puck')
  })

  it('does not mutate the input blob', () => {
    const current = { template: 'book', puck: { content: [1] } }
    nextLayoutPreferences(current, 'hub', { reset: true })
    expect(current.template).toBe('book')
    expect(current.puck).toEqual({ content: [1] })
  })
})
