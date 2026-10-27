import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
const read = vi.hoisted(() => vi.fn())
vi.mock('@/lib/spaces/completion-analytics', () => ({ readSpaceCompletionAnalytics: read }))
import { FqJourneyCompletionBand } from './journey-completion-band'
beforeEach(() => vi.clearAllMocks())
it('renders actual owning-Space completion metrics and offering action using the Frequency kit', async () => {
  read.mockResolvedValue({ journeyCount: 2, enrolled: 10, completed: 4, inProgress: 6, paidEnrolled: 3, completionPct: 40 })
  const html = renderToStaticMarkup(await FqJourneyCompletionBand({ spaceId: 'owned-space', slug: 'makers' }))
  expect(read).toHaveBeenCalledExactlyOnceWith('owned-space')
  expect(html).toContain('aria-label="Journey participation"')
  expect(html).toContain('href="/spaces/makers/settings/offerings"')
  for (const text of ['Enrolled', 'Finished', 'Still going', 'Finish rate', '40%', '3 paid', '2 Journeys', 'panel kpi']) expect(html).toContain(text)
  expect(html).not.toContain('unavailable')
})
it('failed or incomplete reads display unavailable, not zero participants or a fabricated rate', async () => {
  read.mockResolvedValue(null)
  const html = renderToStaticMarkup(await FqJourneyCompletionBand({ spaceId: 'owned-space', slug: 'makers' }))
  expect(html).toContain('unavailable or incomplete')
  expect(html.match(/class="num">—/g)).toHaveLength(4)
  expect(html).not.toContain('0%')
  expect(html).not.toContain('No one has started yet')
})
it('measured zero starts stays distinct from unavailable, and never becomes zero percent', async () => {
  read.mockResolvedValue({ journeyCount: 1, enrolled: 0, completed: 0, inProgress: 0, paidEnrolled: 0, completionPct: null })
  const html = renderToStaticMarkup(await FqJourneyCompletionBand({ spaceId: 'owned-space', slug: 'makers' }))
  expect(html.match(/class="num">0/g)).toHaveLength(3)
  expect(html).toContain('No one has started yet')
  expect(html).not.toContain('unavailable')
  expect(html).not.toContain('0%')
})

it('reuses the early-started server promise without a duplicate completion query', async () => {
  const statsPromise = Promise.resolve({ journeyCount: 1, enrolled: 1, completed: 1, inProgress: 0, paidEnrolled: 0, completionPct: 100 })
  const html = renderToStaticMarkup(await FqJourneyCompletionBand({ spaceId: 'owned-space', slug: 'makers', statsPromise }))
  expect(html).toContain('100%')
  expect(read).not.toHaveBeenCalled()
})
