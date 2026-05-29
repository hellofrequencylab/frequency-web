// Studio campaigns: segments (who) + the email body builder. Send orchestration
// lives in the campaigns server action. Server-only; untyped client view until
// types regenerate. v1 targets member contacts (so the profile-based unsubscribe
// works); lead/non-member segments come with a contact-based unsubscribe later.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export type SegmentKey = 'members' | 'subscribed_members'

export const SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: 'members', label: 'All members (not unsubscribed)' },
  { key: 'subscribed_members', label: 'Subscribed members only' },
]

export interface Recipient {
  contactId: string
  email: string
  profileId: string
}

/** Member contacts in a segment, excluding unsubscribed (suppression is enforced at send). */
export async function resolveSegment(segment: SegmentKey): Promise<Recipient[]> {
  const db = createAdminClient() as unknown as SupabaseClient
  let q = db
    .from('contacts')
    .select('id, email, profile_id, consent_state')
    .not('profile_id', 'is', null)
    .neq('consent_state', 'unsubscribed')
  if (segment === 'subscribed_members') q = q.eq('consent_state', 'subscribed')

  const { data } = await q
  return (data ?? [])
    .filter((c) => c.profile_id && c.email)
    .map((c) => ({ contactId: c.id, email: c.email as string, profileId: c.profile_id as string }))
}

export interface CampaignRow {
  id: string
  subject: string
  segment: string
  status: string
  recipientCount: number
  sentAt: string | null
  createdAt: string | null
}

export async function listCampaigns(limit = 50): Promise<CampaignRow[]> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('campaigns')
    .select('id, subject, segment, status, recipient_count, sent_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((c) => ({
    id: c.id,
    subject: c.subject,
    segment: c.segment,
    status: c.status,
    recipientCount: Number(c.recipient_count ?? 0),
    sentAt: c.sent_at ?? null,
    createdAt: c.created_at ?? null,
  }))
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Wrap a plain-text campaign body in a minimal email + unsubscribe footer. */
export function campaignEmail(body: string, unsubscribeUrl: string): { html: string; text: string } {
  const paras = body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 16px;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('')
  const html = `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;">${paras}<hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/><p style="font-size:12px;color:#999;line-height:1.6;">You're receiving this as a Frequency member. <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe</a>.</p></div>`
  const text = `${body}\n\n---\nUnsubscribe: ${unsubscribeUrl}`
  return { html, text }
}
