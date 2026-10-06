import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// A SPACE NEVER SEES WHAT A MEMBER TOLD VERA IN PRIVATE (SCAN-742).
//
// Vera's per-member memory (goals, interests, constraints, neighborhood) is member-only under
// own-row RLS (docs/AI-VERA.md) and the privacy page never names Spaces as recipients. The Space
// CRM contact read model used to fold it into the About panel for every Space the member had bought
// a ticket from. There is no per-Space sharing consent, so the read is gone. Read statically: the
// assertion is that the read model does not reach for the memory at all, which a mocked execution
// could satisfy by accident.

const SRC = readFileSync(new URL('./space-contact-detail.ts', import.meta.url), 'utf8')

describe('the Space contact read model and Vera memory', () => {
  it('never calls getMemberContext', () => {
    expect(SRC).not.toMatch(/getMemberContext\(/)
  })

  it('hands the About panel null facts', () => {
    expect(SRC).toMatch(/const facts: MemberFacts \| null = null/)
  })
})
