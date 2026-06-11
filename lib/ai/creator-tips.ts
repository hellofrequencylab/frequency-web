// Vera's creator tips (ADR-211) — the draft-and-approve loop for member-created
// content. Vera reads the SAME performance signals the admin content suite ranks
// by (lib/admin/content-signals.ts), drafts ONE engagement tip per creator/content
// grounded in those numbers, and queues it as a `creator_tips` draft. A janitor
// reviews, edits, and explicitly sends (a `notifications` insert) or dismisses.
// Vera NEVER messages a member without that approval.
//
// Budget: this is an ADMIN analysis surface (like the support-draft seam) — it is
// gated by the platform AI switch + its own per-feature daily cap, never a member
// feature's budget. Server-only; all callers gate at the action layer (janitor).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { aiAvailable, featureOverBudget, recordAiUsage } from './usage'
import { completeText, AiUnavailableError } from './complete'
import { withVoice } from './voice'
import { rankedJourneys, rankedPractices } from '@/lib/admin/content-signals'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

export type TipStatus = 'draft' | 'approved' | 'sent' | 'dismissed'
export type TipContentType = 'journey' | 'practice' | 'challenge' | 'event'
// 'tip' is a coaching nudge destined for the creator; 'flag' is an internal
// spam/quality flag for the admin (poster observer) that is NEVER sent.
export type TipKind = 'tip' | 'flag'

export interface CreatorTip {
  id: string
  creator_id: string
  content_type: TipContentType
  content_id: string
  kind: TipKind
  status: TipStatus
  draft_text: string
  sent_text: string | null
  evidence: Record<string, unknown>
  created_at: string
  reviewed_by: string | null
  sent_at: string | null
  creator: { display_name: string | null; handle: string | null } | null
}

const TIP_COLS =
  'id, creator_id, content_type, content_id, kind, status, draft_text, sent_text, evidence, ' +
  'created_at, reviewed_by, sent_at, creator:profiles!creator_id(display_name, handle)'

const FEATURE = 'creator-tips'

// How many tips one generation run may draft (bounds spend per click).
const MAX_TIPS_PER_RUN = 6
// How many top candidates per content type we consider.
const CANDIDATES_PER_TYPE = 5

const TIP_SYSTEM = `You are Vera, the Frequency guide, writing a short engagement tip to the member who created a Journey or Practice that other members are using. A human admin reviews and sends it; write it as a finished message to the creator. Ground every claim in the EVIDENCE numbers you are given (use the actual numbers; never invent or round them up). Open with what is working, then give ONE concrete, doable suggestion to help more members stick with it (for example: add a step, clarify cadence, write a short intro, share it in a Circle). Plain text, 2-4 sentences, no greeting line, no sign-off. Never use an em dash; use a period or comma instead. Output ONLY the tip.`

interface TipCandidate {
  creatorId: string
  contentType: TipContentType
  contentId: string
  title: string
  evidence: Record<string, unknown>
  evidenceLine: string
}

/** The top-performing member-created journeys + practices that don't already
 *  have a live (draft/approved/sent) tip for that content. */
async function tipCandidates(): Promise<TipCandidate[]> {
  const [journeys, practices, { data: existingRows }] = await Promise.all([
    rankedJourneys(),
    rankedPractices(),
    db().from('creator_tips').select('content_type, content_id, status').in('status', ['draft', 'approved', 'sent']),
  ])
  const existing = new Set(
    ((existingRows ?? []) as { content_type: string; content_id: string }[]).map(
      (r) => `${r.content_type}:${r.content_id}`,
    ),
  )

  const out: TipCandidate[] = []

  // Member-created journeys: not official (official programs are ours), public +
  // approved, with real signal.
  for (const j of journeys
    .filter((j) => j.author_id && !j.official && j.visibility === 'public' && j.status === 'approved' && j.score > 0)
    .slice(0, CANDIDATES_PER_TYPE)) {
    if (existing.has(`journey:${j.id}`)) continue
    out.push({
      creatorId: j.author_id as string,
      contentType: 'journey',
      contentId: j.id,
      title: j.title,
      evidence: {
        title: j.title,
        adopt_count: j.adopt_count,
        forked_count: j.forked_count,
        active_adoptions: j.active_adoptions,
        score: j.score,
      },
      evidenceLine: `Journey "${j.title}": ${j.adopt_count} members adopted it, ${j.active_adoptions} are still on it, ${j.forked_count} remixed it.`,
    })
  }

  // Member-created practices: public, approved (or grandfathered null), with signal.
  for (const p of practices
    .filter((p) => p.created_by && p.is_public && (p.status === null || p.status === 'approved') && p.score > 0)
    .slice(0, CANDIDATES_PER_TYPE)) {
    if (existing.has(`practice:${p.id}`)) continue
    out.push({
      creatorId: p.created_by as string,
      contentType: 'practice',
      contentId: p.id,
      title: p.title,
      evidence: {
        title: p.title,
        adopters: p.adopters,
        logs_30d: p.logs_30d,
        logs_total: p.logs_total,
        score: p.score,
      },
      evidenceLine: `Practice "${p.title}": ${p.adopters} members adopted it, ${p.logs_30d} logs in the last 30 days, ${p.logs_total} logs all time.`,
    })
  }

  return out.slice(0, MAX_TIPS_PER_RUN)
}

/**
 * Draft tips for the top performers that don't have one yet. Returns how many
 * drafts were created and how many candidates were skipped (already covered or
 * an individual call failed). Throws AiUnavailableError when AI is off or this
 * feature is over its daily cap — callers surface that as a friendly failure.
 */
export async function generateCreatorTips(actorId: string): Promise<{ created: number; skipped: number }> {
  if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) {
    throw new AiUnavailableError('AI is off or over budget for today')
  }

  const candidates = await tipCandidates()
  let created = 0
  let skipped = 0

  for (const c of candidates) {
    try {
      const res = await completeText({
        system: withVoice(TIP_SYSTEM),
        messages: [
          {
            role: 'user',
            content: `EVIDENCE (the only numbers you may use):\n${c.evidenceLine}\n\nWrite the tip to this creator.`,
          },
        ],
        tier: 'haiku',
        maxTokens: 300,
      })
      await recordAiUsage({ feature: FEATURE, model: res.tier, usage: res.usage, costUsd: res.costUsd, profileId: actorId })
      const text = res.text.trim()
      if (!text) {
        skipped += 1
        continue
      }
      const { error } = await db().from('creator_tips').insert({
        creator_id: c.creatorId,
        content_type: c.contentType,
        content_id: c.contentId,
        status: 'draft',
        draft_text: text,
        evidence: c.evidence,
      })
      if (error) skipped += 1
      else created += 1
    } catch (e) {
      if (e instanceof AiUnavailableError) throw e
      skipped += 1
    }
  }

  return { created, skipped }
}

// --- Queue reads + lifecycle (callers gate: janitor) -------------------------

/** Tips by status, newest first, with the creator profile for display. */
export async function listTips(statuses: TipStatus[], limit = 100): Promise<CreatorTip[]> {
  const { data } = await db()
    .from('creator_tips')
    .select(TIP_COLS)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(limit)
  type Row = Omit<CreatorTip, 'creator'> & {
    creator: { display_name: string | null; handle: string | null }[] | CreatorTip['creator']
  }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    creator: Array.isArray(r.creator) ? r.creator[0] ?? null : r.creator,
  }))
}

/** Update a draft's text (the admin's edit before approving). */
export async function updateTipText(id: string, text: string): Promise<void> {
  const trimmed = text.trim().slice(0, 1000)
  if (!trimmed) throw new Error('Tip text cannot be empty')
  const { error } = await db().from('creator_tips').update({ draft_text: trimmed }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Approve a draft: status -> approved, stamp the reviewer. */
export async function approveTip(id: string, reviewedBy: string): Promise<void> {
  const { error } = await db()
    .from('creator_tips')
    .update({ status: 'approved', reviewed_by: reviewedBy })
    .eq('id', id)
    .in('status', ['draft', 'approved'])
  if (error) throw new Error(error.message)
}

/**
 * Send an approved (or draft, when the caller approves-and-sends in one step)
 * tip: insert the notification to the creator, then mark it sent. The delivered
 * text is sent_text when set, else the (possibly edited) draft. Flags are
 * internal admin notes and are never sendable; use resolveFlag instead.
 */
export async function sendTip(id: string): Promise<void> {
  const client = db()
  const { data: row } = await client
    .from('creator_tips')
    .select('id, creator_id, content_type, content_id, kind, status, draft_text, sent_text')
    .eq('id', id)
    .maybeSingle()
  const tip = row as Pick<
    CreatorTip,
    'id' | 'creator_id' | 'content_type' | 'content_id' | 'kind' | 'status' | 'draft_text' | 'sent_text'
  > | null
  if (!tip) throw new Error('Tip not found')
  if (tip.kind === 'flag') throw new Error('Flags are internal and never go to the member. Mark it reviewed instead.')
  if (tip.status === 'sent') return // idempotent
  if (tip.status === 'dismissed') throw new Error('This tip was dismissed')

  const body = (tip.sent_text || tip.draft_text).trim()
  const { error: notifError } = await client.from('notifications').insert({
    recipient_id: tip.creator_id,
    actor_id: null,
    type: 'creator_tip',
    reference_type: tip.content_type,
    reference_id: tip.content_id,
    body,
  })
  if (notifError) throw new Error(notifError.message)

  const { error } = await client
    .from('creator_tips')
    .update({ status: 'sent', sent_text: body, sent_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Dismiss a tip (it will not be re-drafted; the content stays covered). */
export async function dismissTip(id: string, reviewedBy: string): Promise<void> {
  const { error } = await db()
    .from('creator_tips')
    .update({ status: 'dismissed', reviewed_by: reviewedBy })
    .eq('id', id)
    .neq('status', 'sent')
  if (error) throw new Error(error.message)
}
