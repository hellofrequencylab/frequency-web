import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./complete', () => ({ completeRaw: vi.fn() }))
vi.mock('./client', () => ({ aiEnabled: vi.fn(() => true) }))
vi.mock('./usage', () => ({ featureOverBudget: vi.fn(async () => false) }))
vi.mock('./voice', () => ({ withVoice: (s: string) => s }))
import { completeRaw } from './complete'
import { featureOverBudget } from './usage'
import { coachMessaging } from './messaging-generator'
const input = { goalKey: 'welcome', goalLabel: 'Welcome', object: 'campaign' as const, intent: 'Help guests return', audience: 'Guests', tone: 'plain', name: 'My title', details: 'My authored notes', profileId: 'owner' }
function response(value: unknown) { return { content: [{ type: 'tool_use', name: 'coach_messaging', input: value }] } as never }
beforeEach(() => vi.clearAllMocks())
describe('messaging coaching boundary', () => {
  it('returns questions and measurement without subject/body/draft fields', async () => {
    vi.mocked(completeRaw).mockResolvedValue(response({ questions: ['What next step matters?'], checks: ['Check the real date.'], measurement: 'Compare attended bookings after the campaign.' }))
    const result = await coachMessaging(input)
    expect(result?.questions).toEqual(['What next step matters?'])
    expect(Object.keys(result!)).toEqual(['questions', 'checks', 'measurement'])
    expect(completeRaw).toHaveBeenCalledWith(expect.objectContaining({ accounting: { feature: 'messaging-generator', profileId: 'owner' } }))
    expect(input.details).toBe('My authored notes')
  })
  it.each([{ subject: 'Invented', body: 'Buy now', questions: ['Buy now?'], checks: [], measurement: 'Open rate' }, { questions: ['Invented prose'], checks: [], measurement: 'Opens' }, { questions: [], checks: [], measurement: '' }])('rejects invalid or copy-shaped output', async value => {
    vi.mocked(completeRaw).mockResolvedValue(response(value))
    expect(await coachMessaging(input)).toBeNull()
  })
  it('does not call the provider over budget', async () => {
    vi.mocked(featureOverBudget).mockResolvedValueOnce(true)
    expect(await coachMessaging(input)).toBeNull()
    expect(completeRaw).not.toHaveBeenCalled()
  })
  it('fails safely without constructing content', async () => {
    vi.mocked(completeRaw).mockRejectedValue(new Error('Unavailable'))
    expect(await coachMessaging(input)).toBeNull()
  })
})
