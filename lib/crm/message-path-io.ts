// THE PATH IO reader (CRM Everywhere plan 2.2 / ADR-827 ruling 3). Gathers one person's raw
// communication rows and hands them to the PURE assembler (lib/crm/message-path.ts). NO gate here —
// the caller (buildMemberDetail, behind each surface's gate + tenancy check) has already authorized
// the read, and the ALTITUDE lives in the assembler's scope filter (fail-closed for leader lanes).
//
// DEFENSIVE by design: every read selects `*` and maps the scope fields defensively (a pre-scope-spine
// row resolves through the legacy metadata conventions instead) — the scope_kind/scope_id columns are
// live and covered by the regenerated types (ADR-246 closed). FAIL-SAFE: any error degrades to
// EMPTY_MESSAGE_PATH, never a throw, so the member pane always renders. No N+1: a fixed handful of
// batched reads for the ONE selected person.

import { createAdminClient } from '@/lib/supabase/admin'
import { getProfileSummaries } from '@/lib/connections/matching'
import {
  assembleMessagePath,
  resolvePathRef,
  EMPTY_MESSAGE_PATH,
  type MessagePath,
  type PathScope,
  type PathLabels,
  type PathInteractionRow,
  type PathConversationRow,
  type PathMessageRow,
  type PathRef,
} from './message-path'
import type { InteractionChannel, InteractionDirection } from './interactions'

// Bounded reads: plenty for a pane, never an unbounded scan.
const MAX_CONVERSATIONS = 20
const MAX_MESSAGES = 300
const MAX_INTERACTIONS = 200

/** The typed admin client (the comms/CRM tables are covered by the generated types; ADR-246 closed). */
function admin() {
  return createAdminClient()
}

function s(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null
}
function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Batch-resolve display labels for the referenced entities: events (title + public route),
 *  campaigns (subject), dispatches (title). Bookings / memberships / tickets keep the plain
 *  fallback label (no per-kind read is worth it for a badge). Fail-safe per source. */
async function resolveLabels(refs: PathRef[]): Promise<PathLabels> {
  const ids = (kind: string) => [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.id))]
  const eventIds = ids('event')
  const campaignIds = ids('campaign')
  const dispatchIds = ids('dispatch')
  const labels: PathLabels = {}

  const safe = async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch {
      /* one failing label source never sinks the rest */
    }
  }

  await Promise.all([
    eventIds.length
      ? safe(async () => {
          const { data } = await admin().from('events').select('id, slug, title').in('id', eventIds).order('id', { ascending: true }).limit(eventIds.length)
          for (const row of data ?? []) {
            const id = s(row.id)
            if (!id) continue
            const slug = s(row.slug)
            labels[`event:${id}`] = { label: s(row.title) ?? 'Event', href: slug ? `/events/${slug}` : undefined }
          }
        })
      : Promise.resolve(),
    campaignIds.length
      ? safe(async () => {
          const { data } = await admin().from('campaigns').select('id, subject').in('id', campaignIds).order('id', { ascending: true }).limit(campaignIds.length)
          for (const row of data ?? []) {
            const id = s(row.id)
            if (!id) continue
            labels[`campaign:${id}`] = { label: s(row.subject) ?? 'Campaign' }
          }
        })
      : Promise.resolve(),
    dispatchIds.length
      ? safe(async () => {
          const { data } = await admin().from('dispatches').select('id, title').in('id', dispatchIds).order('id', { ascending: true }).limit(dispatchIds.length)
          for (const row of data ?? []) {
            const id = s(row.id)
            if (!id) continue
            labels[`dispatch:${id}`] = { label: s(row.title) ?? 'Dispatch' }
          }
        })
      : Promise.resolve(),
  ])

  return labels
}

export interface LoadMessagePathInput {
  /** Every identity row that stitches to this person (profile id, contact id, capture ids). */
  subjectIds: string[]
  /** The member's display name (the inbound sender label in the fold). */
  memberName?: string
  /** The viewer's lane; drives both the server-side narrowing and the assembler's fail-closed filter. */
  scope: PathScope
  audience: 'staff' | 'leader'
}

/**
 * Load and assemble The Path for one person through the viewer's lane. Space lanes narrow
 * server-side on `space_id` AND re-check in the assembler; the event / circle / hub / nexus lanes
 * fetch the person's rows and keep only what RESOLVES to the exact scope (fail-closed — the
 * scope-eq server filter can come once the columns are regenerated into the typed reads).
 * FAIL-SAFE: EMPTY_MESSAGE_PATH on any error.
 */
export async function loadMessagePath(input: LoadMessagePathInput): Promise<MessagePath> {
  const subjectIds = [...new Set(input.subjectIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
  if (subjectIds.length === 0) return EMPTY_MESSAGE_PATH
  const { scope } = input

  try {
    const spaceLane = scope.kind === 'space' ? scope.id : null

    // Conversations + interactions for the person, in parallel. `select('*')` kept on purpose so the
    // defensive row mapping below stays schema-tolerant (the assembler resolves legacy metadata too).
    const convQ = admin().from('comms_conversations').select('*').in('subject_id', subjectIds)
    const intQ = admin().from('contact_interactions').select('*').in('subject_id', subjectIds)
    const [convRes, intRes] = await Promise.all([
      (spaceLane ? convQ.eq('space_id', spaceLane) : convQ).order('last_activity_at', { ascending: false }).limit(MAX_CONVERSATIONS),
      (spaceLane ? intQ.eq('space_id', spaceLane) : intQ).order('occurred_at', { ascending: false }).limit(MAX_INTERACTIONS),
    ])

    const conversations: PathConversationRow[] = (convRes.data ?? []).flatMap((row) => {
      const id = s(row.id)
      if (!id) return []
      return [
        {
          id,
          kind: s(row.kind) ?? 'crm',
          subject: s(row.subject),
          channel: s(row.channel) ?? 'email',
          spaceId: s(row.space_id),
          metadata: obj(row.metadata),
          lastActivityAt: s(row.last_activity_at),
          scopeKind: s(row.scope_kind),
          scopeId: s(row.scope_id),
        },
      ]
    })

    const interactions: PathInteractionRow[] = (intRes.data ?? []).flatMap((row) => {
      const id = s(row.id)
      const occurredAt = s(row.occurred_at)
      if (!id || !occurredAt) return []
      return [
        {
          id,
          channel: (s(row.channel) ?? 'system') as InteractionChannel,
          direction: (s(row.direction) ?? 'internal') as InteractionDirection,
          summary: s(row.summary),
          body: s(row.body),
          metadata: obj(row.metadata),
          source: s(row.source) ?? 'system',
          occurredAt,
          spaceId: s(row.space_id),
          idempotencyKey: s(row.idempotency_key),
          scopeKind: s(row.scope_kind),
          scopeId: s(row.scope_id),
        },
      ]
    })

    // Messages for the loaded conversations (one batched read).
    let messages: PathMessageRow[] = []
    const convIds = conversations.map((c) => c.id)
    if (convIds.length) {
      const { data } = await admin()
        .from('comms_messages')
        .select('*')
        .in('conversation_id', convIds)
        .order('occurred_at', { ascending: true })
        .limit(MAX_MESSAGES)
      const raw = (data ?? []).flatMap((row) => {
        const id = s(row.id)
        const conversationId = s(row.conversation_id)
        const occurredAt = s(row.occurred_at)
        if (!id || !conversationId || !occurredAt) return []
        return [
          {
            id,
            conversationId,
            direction: (s(row.direction) ?? 'outbound') as InteractionDirection,
            authorKind: s(row.author_kind) ?? 'system',
            authorId: s(row.author_id),
            body: s(row.body) ?? '',
            channel: s(row.channel) ?? 'email',
            isInternal: row.is_internal === true,
            occurredAt,
          },
        ]
      })
      // Resolve author display names in one batch (staff / leader senders).
      const authorIds = [...new Set(raw.map((m) => m.authorId).filter((id): id is string => !!id))]
      const authors = authorIds.length ? await getProfileSummaries(authorIds) : new Map()
      messages = raw.map(({ authorId, ...m }) => ({
        ...m,
        authorName: authorId ? (authors.get(authorId)?.displayName ?? null) : null,
      }))
    }

    // Batch the display labels for every ref the rows resolve to (three in() reads, no N+1).
    const refs = [
      ...conversations.map((c) => resolvePathRef(c)),
      ...interactions.map((i) => resolvePathRef(i)),
    ].filter((r): r is PathRef => !!r)
    const labels = await resolveLabels(refs)

    return assembleMessagePath({
      interactions,
      conversations,
      messages,
      labels,
      scope,
      audience: input.audience,
      memberName: input.memberName,
    })
  } catch {
    return EMPTY_MESSAGE_PATH
  }
}
