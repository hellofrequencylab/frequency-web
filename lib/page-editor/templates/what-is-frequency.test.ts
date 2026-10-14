import { describe, it, expect } from 'vitest'
import { data } from '@/lib/page-editor/templates/what-is-frequency'
import { CATEGORY_LINE } from '@/lib/site'

// LIVE-912 (LAUNCH-MARKETING-PLAN §14 Phase 0.3). /what-is-frequency is the page answer engines
// quote for "what is Frequency", so it must say what /the-lab says: the Lab is a 2028 plan, not a
// room you can walk into today. It leads with R1's category line, and it never sells Crew as the
// thing that keeps Frequency free for everyone (R2 ends comped Crew at launch; R8 is support first).
const text = JSON.stringify(data)

describe('what-is-frequency template copy (LIVE-912)', () => {
  it("leads with R1's category line", () => {
    expect(text).toContain(CATEGORY_LINE)
    expect(text).not.toMatch(/Frequency is a Community Collective built to/)
  })

  it('puts The Lab in the future tense', () => {
    expect(text).not.toMatch(/a real place you can walk into/)
    expect(text).not.toMatch(/the community gathers in/)
    expect(text).not.toMatch(/first (Lab|one) is taking root/)
    expect(text).not.toMatch(/first Lab is being built/)
    expect(text).toMatch(/planned to open in [^"]*2028/)
  })

  it('never promises Crew keeps it free for everyone, and never says "Frequency Labs"', () => {
    expect(text).not.toMatch(/free for everyone/i)
    expect(text).not.toContain('Frequency Labs')
  })
})
