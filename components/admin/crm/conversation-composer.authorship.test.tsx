// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(main)/admin/crm/conversations/actions', () => ({ sendConversationReply: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/comms/workspace', () => ({ getWorkspaceThread: async () => ({ subject: 'Question', messages: [{direction:'inbound',authorName:'PRIVATE NAME',body:'When?',isInternal:false}] }) }))
vi.mock('@/lib/comms/conversations', () => ({ updateConversationFields: vi.fn() }))
vi.mock('@/lib/ai/complete', () => ({ AiUnavailableError: class extends Error {}, completeText: async () => ({text: JSON.stringify({questionIds:['confirm'],checkIds:['facts']})}) }))
vi.mock('@/lib/ai/usage', () => ({ aiAvailable: async () => true, featureOverBudget: async () => false }))
vi.mock('@/lib/ai/rate-limit', () => ({ aiRateLimited: async () => false }))
import { veraDraftReply } from '@/lib/comms/vera-conversation'
import { ConversationComposer } from './conversation-composer'
it('keeps authored reply untouched and sends only that reply after separate coaching', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const send = vi.fn(async () => ({ data: undefined })), draft = vi.fn(async (id: string) => veraDraftReply(id, 'owner'))
  try {
    await act(async () => root.render(<ConversationComposer conversationId="thread-A" counterpartName="Guest" draftAction={draft} sendAction={send} />))
    const field = host.querySelector('textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, 'My own reply.')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Coach my reply'))!.click())
    expect(host.querySelector('[aria-label="Reply coaching"]')?.textContent).toContain('Which details do you need to confirm before replying?')
    expect(field.value).toBe('My own reply.')
    expect(send).not.toHaveBeenCalled()
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Send reply'))!.click())
    expect(send).toHaveBeenCalledWith({ conversationId: 'thread-A', body: 'My own reply.', isInternal: false })
  } finally { act(() => root.unmount()); host.remove() }
})
