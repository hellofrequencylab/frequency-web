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
  vi.mocked(completeText).mockResolvedValue({ text: JSON.stringify({ questions: ['Which date is confirmed?'], checks: ['Check the schedule.'] }) } as never)
  expect(await veraDraftReply('thread-A', 'owner')).toEqual({ data: { draft: 'Which date is confirmed?\nCheck the schedule.' } })
  expect(JSON.stringify(vi.mocked(completeText).mock.calls[0])).not.toContain('Private note')
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
