import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HuntModerationReader } from '@/lib/hunts/moderation-reader'
import { HuntModerationScreen, HuntPlayerSafety } from './moderation-screens'

const scope = { huntIds: ['urgent', 'routine', 'clear'] }

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  vi.stubEnv('HUNTS_AUTHORING_ENABLED', 'on')
})
afterEach(() => vi.unstubAllEnvs())

it('keeps the player and moderation shells dark when Hunts is off', async () => {
  vi.stubEnv('HUNTS_ENABLED', '')
  const reader = vi.fn<HuntModerationReader>()
  expect(await HuntModerationScreen({ scope, reader })).toBeNull()
  expect(renderToStaticMarkup(<HuntPlayerSafety banner="paused" />)).toBe('')
  expect(reader).not.toHaveBeenCalled()
})

it('does not read reports with authoring off or without an authorized Hunt', async () => {
  const reader = vi.fn<HuntModerationReader>()
  const denied = renderToStaticMarkup(await HuntModerationScreen({ scope: null, reader }))
  expect(denied).toContain('Access required')
  vi.stubEnv('HUNTS_AUTHORING_ENABLED', '')
  expect(await HuntModerationScreen({ scope, reader })).toBeNull()
  expect(reader).not.toHaveBeenCalled()
})

it('shows scoped aggregate triage in urgency order and keeps reporter identities private', async () => {
  const reader = vi.fn<HuntModerationReader>().mockResolvedValue([
    { huntId: 'routine', title: 'Routine Trail', reports: [{ reporterId: 'private-one', reason: 'other' }] },
    { huntId: 'urgent', title: 'Urgent Trail', reports: [
      { reporterId: 'private-two', reason: 'unsafe' },
      { reporterId: 'private-two', reason: 'other' },
    ] },
    { huntId: 'clear', title: 'Clear Trail', reports: [] },
    { huntId: 'outside', title: 'Outside Trail', reports: [{ reporterId: 'private-three', reason: 'unsafe' }] },
  ])
  const html = renderToStaticMarkup(await HuntModerationScreen({ scope, reader }))
  expect(reader).toHaveBeenCalledExactlyOnceWith(scope)
  expect(html).toContain('Pause recommended')
  expect(html).toContain('Review needed')
  expect(html.indexOf('Urgent Trail')).toBeLessThan(html.indexOf('Routine Trail'))
  expect(html.match(/person reported/g)).toHaveLength(2)
  expect(html).not.toMatch(/private-|Clear Trail|Outside Trail/)
})

it.each([
  ['paused', 'This Trail is paused. Your progress is safe.'],
  ['closed', 'This Trail has closed. Your progress stays here.'],
] as const)('shows the %s notice and a report control without a write action', (banner, message) => {
  const html = renderToStaticMarkup(<HuntPlayerSafety banner={banner} />)
  expect(html).toContain(message)
  expect(html).toContain('role="status"')
  expect(html).toContain('Report this Trail')
  expect(html).toMatch(/<button[^>]*disabled/)
  expect(html).not.toContain('<form')
})
