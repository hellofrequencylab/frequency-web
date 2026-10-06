import { z } from 'zod'
import { messageSendInput } from '@/lib/contract'
import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { toPeerView } from '@/lib/contract/views'
import { loadDockDmThread } from '@/app/(main)/messages/popover-actions'
import { sendMessage } from '@/app/(main)/messages/actions'

// /api/v1/messages/{conversationId} (LIVE-716): GET reads a conversation (the newest 100, oldest
// first) and marks it read; POST { body } sends. Both are the web's own functions: the participant
// gate under RLS, and on send the block gate both ways.

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(request, 'messages-thread')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const id = readInput(z.uuid(), (await params).id)
    const thread = await asCaller(auth, () => loadDockDmThread(id))
    if (!thread) return fail('not_found', 'That conversation could not be found.')
    return ok({
      id,
      title: thread.title,
      name: thread.name,
      participants: thread.participants.map(toPeerView),
      messages: thread.messages.map((m) => ({ id: m.id, senderId: m.sender_id, body: m.body, createdAt: m.created_at })),
    })
  } catch (e) {
    return failFrom(e)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(request, 'messages-send', { limit: 60, window: '1 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const id = readInput(z.uuid(), (await params).id)
    const { body } = readInput(messageSendInput, await request.json().catch(() => null))
    const form = new FormData()
    form.set('body', body)
    try {
      await asCaller(auth, () => sendMessage(id, form))
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      if (/not part of|cannot message/.test(message)) return fail('forbidden', message)
      throw e
    }
    return ok({ sent: true as const }, { status: 201 })
  } catch (e) {
    return failFrom(e)
  }
}
