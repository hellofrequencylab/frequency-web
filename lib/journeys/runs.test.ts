import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// THE RUN EVENT WRITERS PARSE NO WALL-CLOCK IN THE SERVER'S ZONE. scheduleKickoff receives a
// datetime-local wall-clock from the start-run form; setPhaseEvent receives a server-computed
// toISOString(). Both used `new Date(input.startsAt).toISOString()`, which parses a tz-less
// string in the SERVER's zone — correct only because prod Node runs UTC. The repo convention
// is lib/events/datetime (eventStartInputToIso here, since one caller passes an explicit
// instant). This is a source-shape guard because the failure is an ABSENT conversion: both
// functions are IO orchestration whose mocked client would accept either spelling.
describe('journey run events follow the wall-clock storage convention', () => {
  const src = readFileSync(join(__dirname, 'runs.ts'), 'utf8')

  it('normalises startsAt through eventStartInputToIso', () => {
    expect(src).toContain("import { eventStartInputToIso } from '@/lib/events/datetime'")
    // Both writers (scheduleKickoff + setPhaseEvent) route through the helper.
    expect(src.match(/eventStartInputToIso\(input\.startsAt\)/g)?.length).toBe(2)
  })

  it('never hands input.startsAt to the server-zone Date parser', () => {
    expect(src).not.toContain('new Date(input.startsAt)')
  })

  it('fails closed on an unparseable start instead of inserting garbage', () => {
    // Each normalisation is followed by the null guard both functions already use for
    // every other failure path.
    expect(src.match(/if \(!startsIso\) return null/g)?.length).toBe(2)
  })
})
