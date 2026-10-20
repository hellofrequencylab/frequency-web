import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// LIVE-1031: every member index header carries the same two buttons, the small pastel pill
// (`btn pa sm`) and the small plain pill (`btn sm`), the size Spaces and the shared header use.
const KIT_BODIES = [
  'components/frequency/members/circles/circles-body.tsx',
  'components/frequency/members/channels/channels-body.tsx',
  'components/frequency/members/marketplace/marketplace-body.tsx',
  'components/frequency/members/events/events-body.tsx',
]
const SHARED_PAGES = ['app/(main)/nearby/page.tsx', 'app/(main)/network/page.tsx']
const read = (p: string) => readFileSync(p, 'utf8')

describe('index header actions (LIVE-1031)', () => {
  it.each(KIT_BODIES)('%s uses the small pills', (p) => {
    const s = read(p)
    expect(s).not.toMatch(/"btn pa lg"|"btn lg"|"btn glass sm"/)
    expect(s).toMatch(/"btn pa sm"|"btn sm"/)
  })

  it.each(SHARED_PAGES)('%s routes its buttons through buttonClasses', (p) => {
    const s = read(p)
    expect(s).not.toContain('rounded-control bg-primary px-4 py-2')
    expect(s).toContain("buttonClasses('primary', 'sm')")
  })

  it('Housing header buttons are small', () => {
    const s = read('app/(main)/(marketplace)/housing/page.tsx')
    expect(s).toContain("buttonClasses('primary', 'sm')")
    expect(s).toContain("buttonClasses('secondary', 'sm')")
  })
})
