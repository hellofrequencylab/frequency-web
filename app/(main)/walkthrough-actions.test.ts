import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Drift guard: the walkthrough 'seen' mark has exactly ONE writer (LIVE-062) ───────────
// seenWalkthroughAction was a pure orphan and a double-write hazard: the seen mark is already
// written fire-and-forget at server render by markWalkthroughSeen. Source-level in the house
// archetype (components/events/series-wiring.test.ts) because re-adding the client action is
// SILENT — both writes are best-effort and idempotent-looking, so nothing would fail at runtime;
// the mark would just race itself again.

const actionsRaw = readFileSync('app/(main)/walkthrough-actions.ts', 'utf8')
// Comments stripped before the absence assertions: the header legitimately NAMES the render-time
// writer while explaining it, and a guard that trips on the documentation for the thing it guards
// is a guard that gets deleted (the /api/status env-pin test sets this precedent).
const actions = actionsRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const feed = readFileSync('components/walkthroughs/feed-walkthrough.tsx', 'utf8')
const promo = readFileSync('components/walkthroughs/feed-role-promotion.tsx', 'utf8')

describe('the client actions file no longer carries a seen writer', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(actionsRaw.length).toBeGreaterThan(500)
  })

  it('exports no seenWalkthroughAction and never imports markWalkthroughSeen', () => {
    expect(actions).not.toContain('seenWalkthroughAction')
    expect(actions).not.toContain('markWalkthroughSeen')
  })

  it('keeps the dismiss and complete actions', () => {
    expect(actions).toContain('export async function dismissWalkthroughAction')
    expect(actions).toContain('export async function completeWalkthroughAction')
  })
})

describe('the render-time writers remain (the reason the action could go)', () => {
  for (const [name, src] of [
    ['feed-walkthrough', feed],
    ['feed-role-promotion', promo],
  ] as const) {
    it(`${name} writes the seen mark fire-and-forget at server render`, () => {
      expect(src).toContain("import { markWalkthroughSeen } from '@/lib/walkthroughs/progress'")
      expect(src).toMatch(/void markWalkthroughSeen\(profileId, \w+\.slug\)\.catch\(/)
    })
  }
})

describe('the surviving actions stay wired', () => {
  it('the card dismisses and the lightbox completes through this file', () => {
    const card = readFileSync('components/walkthroughs/walkthrough-card.tsx', 'utf8')
    const lightbox = readFileSync('components/walkthroughs/walkthrough-lightbox.tsx', 'utf8')
    expect(card).toContain("import { dismissWalkthroughAction } from '@/app/(main)/walkthrough-actions'")
    expect(lightbox).toContain("import { completeWalkthroughAction } from '@/app/(main)/walkthrough-actions'")
  })
})
