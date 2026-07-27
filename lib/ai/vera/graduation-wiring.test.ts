import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { AUTONOMY_CATEGORIES } from './autonomy-config'

// THE GRADUATION SEAM MUST STAY CONNECTED (ADR-626).
//
// `autonomousSend` is described in its own header as "the ONLY function that turns a Vera-decided
// send into a real, autonomous send", and it had ZERO callers. Meanwhile /admin/vera-ai rendered a
// fully live console: a master switch labelled "Lets Vera SEND email on her own, past propose-only",
// per-category toggles, rate caps, a breaker re-arm button, and a decision-history panel reading
// `vera_autonomy_decisions` — a table whose only writer was that unreachable function. An operator
// could enable autonomy, tune the caps, and watch a permanently empty history, because nothing could
// consult any of it.
//
// The gate INVARIANTS (breaker and send-gate both unbypassable, every block falls back to propose,
// fail-closed on error) are already covered in autonomous-send.test.ts, which mocks the URL/crypto
// plumbing to test the decision in isolation. This file covers the thing that was actually broken and
// that no unit test can see: whether anything calls it.

const EXECUTE = readFileSync('lib/ai/vera/execute.ts', 'utf8')

describe('Vera autonomous-send is wired to the console that controls it', () => {
  it('execute.ts imports the graduation seam', () => {
    expect(EXECUTE).toContain("from '@/lib/ai/vera/autonomous-send'")
  })

  it('every autonomy category the console exposes has a call site', () => {
    // The console renders a toggle per AUTONOMY_CATEGORIES entry. A toggle with no consumer is
    // exactly the dead control this fixes, so the two lists must stay in step.
    for (const category of AUTONOMY_CATEGORIES) {
      expect(EXECUTE, `no autonomousSend call passes category '${category}'`).toContain(
        `category: '${category}'`,
      )
    }
    expect(EXECUTE.match(/autonomousSend\(/g) ?? []).toHaveLength(AUTONOMY_CATEGORIES.length)
  })

  it('the seam is reached ONLY when a human did not approve', () => {
    // An approved send keeps going out through the plain enqueue, untouched by the breaker; the
    // autonomous path is the else-branch of that check.
    expect(EXECUTE).toContain('} else if (!approvedSend) {')
  })

  it('the call sites inject a no-op propose, so the fallback is not double-recorded', () => {
    // Each executor already records its own human-approval fallback (the interaction row with
    // status 'drafted'). The default propose would write a second, duplicate proposal.
    expect(EXECUTE.match(/propose: async \(\) => \{\}/g) ?? []).toHaveLength(AUTONOMY_CATEGORIES.length)
  })
})
