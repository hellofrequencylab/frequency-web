import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'

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
// Comment- and import-free (LIVE-167): a needle must hit the CALL, never the import line that names it.
const feed = sourceWithoutComments('components/walkthroughs/feed-walkthrough.tsx', { imports: true })
const promo = sourceWithoutComments('components/walkthroughs/feed-role-promotion.tsx', { imports: true })

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
      expect(src).not.toMatch(/function markWalkthroughSeen\b/)
      expect(src).toMatch(/void markWalkthroughSeen\(profileId, \w+\.slug\)\.catch\(/)
    })
  }
})

describe('the surviving actions stay wired', () => {
  it('the card dismisses and the lightbox completes through this file', () => {
    const card = sourceWithoutComments('components/walkthroughs/walkthrough-card.tsx', { imports: true })
    const lightbox = sourceWithoutComments('components/walkthroughs/walkthrough-lightbox.tsx', { imports: true })
    expect(card).toContain('await dismissWalkthroughAction(walkthrough.slug)')
    expect(lightbox).toContain('await completeWalkthroughAction(walkthrough.slug)')
  })
})
