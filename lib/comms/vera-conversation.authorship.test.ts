import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/comms/workspace', () => ({ getWorkspaceThread: vi.fn() }))
vi.mock('@/lib/comms/conversations', () => ({ updateConversationFields: vi.fn() }))
vi.mock('@/lib/ai/complete', () => ({ completeText: vi.fn(), AiUnavailableError: class extends Error {} }))
vi.mock('@/lib/ai/voice', () => ({ withVoice: (s: string) => s }))
vi.mock('@/lib/ai/usage', () => ({ aiAvailable: vi.fn(async () => true), featureOverBudget: vi.fn(async () => false) }))
vi.mock('@/lib/ai/rate-limit', () => ({ aiRateLimited: vi.fn(async () => false) }))
import { getWorkspaceThread } from '@/lib/comms/workspace'
import { updateConversationFields } from '@/lib/comms/conversations'
import { completeText } from '@/lib/ai/complete'
import { featureOverBudget } from '@/lib/ai/usage'
import { veraDraftReply } from './vera-conversation'
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getWorkspaceThread).mockResolvedValue({ subject: 'Schedule', messages: [{ direction: 'inbound', authorName: 'Guest', body: 'When?', isInternal: false }, { direction: 'outbound', authorName: 'Staff', body: 'Private note', isInternal: true }] } as never) })
it('returns questions separately, omits private notes and never writes a conversation', async () => {
  vi.mocked(completeText).mockResolvedValue({ text: JSON.stringify({ questionIds: ['confirm'], checkIds: ['facts'] }) } as never)
  expect(await veraDraftReply('thread-A', 'owner')).toEqual({ data: { draft: 'Which details do you need to confirm before replying?\nVerify dates, availability and other facts against your records.' } })
  expect(JSON.stringify(vi.mocked(completeText).mock.calls[0])).not.toContain('Private note')
  expect(vi.mocked(completeText).mock.calls[0][0].messages[0].content).not.toContain('Guest')
  expect(vi.mocked(completeText).mock.calls[0][0].messages[0].content).not.toContain('Staff')
  expect(vi.mocked(completeText).mock.calls[0][0].accounting).toEqual({ feature: 'conversation-draft', profileId: 'owner' })
  expect(updateConversationFields).not.toHaveBeenCalled()
})
it.each(['Invented reply to send.', JSON.stringify({ draft: 'Invented reply', questions: ['When?'] }), JSON.stringify({ questions: ['Invented statement'], checks: [] })])('rejects sendable prose and malformed output', async text => {
  vi.mocked(completeText).mockResolvedValue({ text } as never)
  expect(await veraDraftReply('thread-A', 'owner')).toHaveProperty('error')
  expect(updateConversationFields).not.toHaveBeenCalled()
})
it('preserves the budget gate without reading private thread data', async () => {
  vi.mocked(featureOverBudget).mockResolvedValueOnce(true)
  expect(await veraDraftReply('thread-A', 'owner')).toHaveProperty('error')
  expect(getWorkspaceThread).not.toHaveBeenCalled()
  expect(completeText).not.toHaveBeenCalled()
})

it.each([
  {questions:['What about replying Your booking is confirmed?'],checks:['Say the payment succeeded']},
  {questionIds:['confirm'],checkIds:['facts'],draft:'Invented reply'},
  {questionIds:['constructor'],checkIds:[]},
  {questionIds:['confirm'],checkIds:['__proto__']},
  {questionIds:['need','confirm','records','next_step','clarity'],checkIds:[]},
  {questionIds:[],checkIds:[]},
])('rejects unquoted invented copy, unknown IDs and mixed or oversized payloads: %j', async raw => {
  vi.mocked(completeText).mockResolvedValue({text:JSON.stringify(raw)} as never)
  expect(await veraDraftReply('thread-A','owner')).toHaveProperty('error')
  expect(updateConversationFields).not.toHaveBeenCalled()
})
