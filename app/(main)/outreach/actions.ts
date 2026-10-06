'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { sendOutreachNoteEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { enqueue } from '@/lib/queue/outbox'
import { log } from '@/lib/log'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getLedCircles } from '@/app/(main)/lead/load-led-circles'

// Outreach — a steward's DIRECT note to the members they lead (distinct from a public
// Broadcast/dispatch). Reaches the inbox, the in-app notifications and the push of everyone
// in the Circles you steward. No public post, no new table.
//
// REACH (SCAN-729): the Circles come from getLedCircles, the same union the Leader dashboard
// uses (hosted Circles + the hubs you guide + the hubs under the nexuses you mentor). The old
// role-exclusive lookup read mentors out of `nexus_regions`, the geography tree, whose ids
// never match hubs.nexus_id, so a mentor was told they lead nothing.
//
// SHAPE (SCAN-731): every send is a queue write (email and push both ride the outbox, the
// in-app row is one insert), run in small parallel chunks, and each one carries a dedupe key
// of (steward, note, recipient). A retry after a timeout therefore reaches nobody twice.

const CHUNK = 12

/** One short fingerprint of the note, so a retry of the same text is the same send. */
function noteKey(callerId: string, body: string): string {
  return `outreach:${callerId}:${createHash('sha256').update(body).digest('hex').slice(0, 16)}`
}

export async function sendOutreach(message: string): Promise<ActionResult<{ sent: number }>> {
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'host')) return fail('Outreach is a steward tool.')

  const body = message.trim()
  if (!body) return fail('Write a message first.')
  if (body.length > 2000) return fail('Keep it under 2000 characters.')

  const admin = createAdminClient()
  const circleIds = (await getLedCircles(caller.id)).map((c) => c.id)
  if (!circleIds.length) return fail('You don’t lead a circle, hub, or region yet, so there’s nobody to reach.')

  // Unique active members across every Circle you lead, minus yourself.
  const { data: memberRows } = await admin
    .from('memberships')
    .select('profile_id')
    .in('circle_id', circleIds)
    .eq('status', 'active')
  const ids = new Set((memberRows ?? []).map((m) => m.profile_id as string))
  ids.delete(caller.id)
  const profileIds = [...ids]
  if (!profileIds.length) return ok({ sent: 0 })

  const authorName =
    (await admin.from('profiles').select('display_name').eq('id', caller.id).maybeSingle()).data?.display_name ?? 'Your steward'
  const key = noteKey(caller.id, body)

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name, auth_user_id')
    .in('id', profileIds)
  const recipients = (profiles ?? []).filter((p) => !!p.auth_user_id)

  let sent = 0
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const results = await Promise.allSettled(
      recipients.slice(i, i + CHUNK).map(async (p) => {
        const recipientKey = `${key}:${p.id}`
        // The inbox row is where the push and the email both point (SCAN-730): a note is not a
        // post, so /feed had nothing to show. The dedupe is the (actor, body) pair on the row.
        const { data: existing } = await admin
          .from('notifications')
          .select('id')
          .eq('recipient_id', p.id)
          .eq('actor_id', caller.id)
          .eq('type', 'mention')
          .eq('reference_type', 'profile')
          .eq('body', body)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1)
        if (!existing?.length) {
          await admin.from('notifications').insert({
            recipient_id: p.id,
            actor_id: caller.id,
            type: 'mention',
            reference_type: 'profile',
            reference_id: caller.id,
            body,
          })
        }

        // The ONE seam (ADR-169), not the bare preference read it replaced, which skipped suppression
        // (meta-scan B9 H6). Address first so suppression can see it. No subject: the recipient set is
        // the union of every Circle this steward leads, deduplicated, so no single Circle names it.
        const { data: { user } } = await admin.auth.admin.getUserById(p.auth_user_id as string)
        if (user?.email && (await resolveSendGate(p.id, 'email', 'dispatches', { email: user.email })).allowed) {
          await sendOutreachNoteEmail({
            to: user.email,
            recipientName: p.display_name,
            recipientProfileId: p.id,
            authorName,
            body,
            dedupeKey: `${recipientKey}:email`,
          })
        }
        // Push rides the outbox too: the queue handler runs the gate and the per-device web push,
        // so none of that happens inside this action (lib/automations.ts does the same).
        await enqueue(
          'push',
          {
            profileId: p.id,
            payload: { title: `✉️ ${authorName}`, body: body.slice(0, 180), url: '/notifications', tag: `outreach-${caller.id}` },
            category: 'dispatches',
          },
          { lane: 'bulk', dedupeKey: `${recipientKey}:push` },
        )
      }),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') sent++
      else log.warn('outreach.recipient_failed', { callerId: caller.id, error: r.reason instanceof Error ? r.reason.message : String(r.reason) })
    }
  }

  revalidatePath('/outreach')
  return ok({ sent })
}
