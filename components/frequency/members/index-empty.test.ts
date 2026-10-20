import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// LIVE-1036: every member index says "nothing here" through the shared EmptyState, which under Frequency
// draws the kit's `.empty mu-empty` room with its glyph chip. A hand-written `.empty stack` div has no
// glyph and drifts from the rest of the app.
const BODIES = [
  'components/frequency/members/spaces/spaces-body.tsx',
  'components/frequency/members/circles/circles-body.tsx',
  'components/frequency/members/channels/channels-body.tsx',
  'components/frequency/members/marketplace/marketplace-body.tsx',
]

describe('index empty states (LIVE-1036)', () => {
  it.each(BODIES)('%s uses EmptyState', (p) => {
    const s = readFileSync(p, 'utf8')
    expect(s).not.toContain('className="empty stack"')
    expect(s).toContain('<EmptyState')
  })
})
