import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { spaceJourneyCompletionWiring } from './probes/space-journey-completion-wiring.mjs'
const read = (p: string) => readFileSync(p, 'utf8')
it('holds actual active gate, widget and scoped reader wiring', () => expect(spaceJourneyCompletionWiring()).toBe(true))
it.each([
  ['app/(main)/spaces/[slug]/manage/manage-board.tsx', 'if (!canManage && !staffViewing) return null', 'if (false) return null'],
  ['components/frequency/admin/pages/overview/overview-body.tsx', 'const journeyStats = readSpaceCompletionAnalytics(spaceId)', 'const journeyStats = Promise.resolve(null)'],
  ['components/frequency/admin/pages/overview/overview-body.tsx', '<FqJourneyCompletionBand spaceId={spaceId} slug={slug}', '<RetiredDashboard spaceId={spaceId} slug={slug}'],
  ['components/frequency/admin/pages/overview/journey-completion-band.tsx', 'readSpaceCompletionAnalytics(spaceId)', "readSpaceCompletionAnalytics('other-space')"],
  ['lib/spaces/completion-analytics.ts', ".eq('space_id', spaceId)", ".eq('space_id', 'other-space')"],
  ['lib/spaces/completion-analytics.ts', ".in('plan_id', planIds)", ".in('plan_id', [])"],
  ['lib/spaces/completion-analytics.ts', ".order('id')", ".order('created_at')"],
  ['lib/spaces/completion-analytics.ts', 'return result.available ? result.stats : null', 'return result.stats'],
])('rejects actual wiring regression in %s: %s', (file, original, changed) => {
  expect(read(file)).toContain(original)
  expect(() => spaceJourneyCompletionWiring(p => p === file ? read(p).replace(original, changed) : read(p))).toThrow()
})
