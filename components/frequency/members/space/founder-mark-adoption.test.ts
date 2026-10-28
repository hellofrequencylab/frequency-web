import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// LIVE-1077: every Frequency surface that marks a Founding Business draws the pastel FounderMark, never the
// old gold chip (FoundingBusinessBadge) or a plain-text mark. The Space profile and the share page already
// do; the /discover/spaces cards joined them here (the Space-owned Circle header is gone, LIVE-1625).
const SURFACES = [
  'components/frequency/site/pages/discover/spaces.tsx',
  'components/frequency/members/spaces/spaces-body.tsx',
]

describe('Founding Business marks', () => {
  it.each(SURFACES)('%s draws FounderMark and not the old chip or text', (file) => {
    const src = readFileSync(file, 'utf8')
    expect(src).toContain('FounderMark')
    expect(src).not.toContain('FoundingBusinessBadge')
    expect(src).not.toMatch(/'Founding Business'/)
  })
})
