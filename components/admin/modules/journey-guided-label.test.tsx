// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('./guided-module', () => ({ GuidedModule: ({ redrawLabel, coachingOnly }: { redrawLabel?: string; coachingOnly?: boolean }) => <button data-coaching={String(coachingOnly)}>{redrawLabel ?? 'Draft it again'}</button> }))
vi.mock('@/app/(main)/journeys/admin-actions', () => ({ getJourneyRailData: vi.fn() }))
vi.mock('@/app/(main)/journeys/actions', () => ({ redrawJourneyAction: vi.fn(), restoreJourneyAction: vi.fn() }))
import { JourneyGuidedModule } from './journey-guided-module'
it('labels the actual Journey caller as coaching without changing the shared drafting default', () => {
  const html = renderToStaticMarkup(<JourneyGuidedModule />)
  expect(html).toContain('Get coaching questions')
  expect(html).toContain('data-coaching="true"')
  expect(html).not.toContain('Draft it again')
})
