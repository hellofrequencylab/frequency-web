// The read half of the per-Space / per-Circle mute card (server-side), plus the ONE
// definition of "which subjects a member may mute" that both halves share.
//
// The write half lives in ./mute-actions.ts and the card in ./mutes-form.tsx. The two
// must agree on the membership rule or the UI would offer a row the action then refuses,
// so `listMuteSubjects` (what we render) and `isMutableSubject` (what we allow a write
// against) are declared here, next to each other, and read the same tables the same way.
//
// THE SESSION CLIENT, NOT THE ADMIN ONE (ADR-923, held by `pnpm check:admin-client`).
// Every read here is a member reading their OWN membership rows, and RLS already says
// exactly that: `space_members` is gated on `profile_id = get_my_profile_id()`
// (20260818000000) and `memberships` on the member's own rows, with `spaces` / `circles`
// visibility-aware on top. Reaching for the service key would bypass a gate that already
// fits. The explicit `.eq(...)` filters stay as defence in depth: RLS decides what is
// visible, the filters say what we asked for, and the two agreeing is the point.
//
// FAIL-SAFE on the read (an empty list renders the empty state, never a broken card) and
// FAIL-CLOSED on the check (any error means "not a member", so no write happens).

import { createClient } from '@/lib/supabase/server'
import {
  NOTIFICATION_CATEGORIES,
  listSubjectMutes,
  type NotificationChannel,
  type NotificationTopic,
  type PreferenceSubjectType,
} from '@/lib/notification-preferences'
import type { MuteSubjectRow } from './mutes-form'

// Every topic × every channel the send gate can consult for a subject. Muting a subject
// writes one row per pair; unmuting clears the same set. `marketing` is in the topic list
// because the gate passes it through as a NotificationTopic like any other
// (lib/comms/send-gate.ts) — a member who mutes a Space means all of it, not "all of it
// except the campaign".
export const MUTE_TOPICS: readonly NotificationTopic[] = [...NOTIFICATION_CATEGORIES, 'marketing']
export const MUTE_CHANNELS: readonly NotificationChannel[] = ['email', 'inapp', 'push']

/** How many mute rows a fully-muted subject holds (7 topics × 3 channels). */
export const MUTE_ROWS_PER_SUBJECT = MUTE_TOPICS.length * MUTE_CHANNELS.length

// The card is a list a member scans, not a directory. Past this the read stops rather than
// rendering hundreds of switches; nobody is in this many Circles today, and if that changes
// the card needs search, not a bigger cap.
const MAX_SUBJECTS = 100

/**
 * Is this Space/Circle one the caller may mute? TRUE only for a live belonging:
 *   • space  — an ACTIVE `space_members` row, OR ownership (`spaces.owner_profile_id`),
 *              because a Space owner holds no membership row and still receives the
 *              Space's Dispatches (lib/dispatches.ts uses the same two-read union).
 *   • circle — an ACTIVE `memberships` row.
 * Fail-CLOSED: no session, no row, or any error returns false, so a caller can never write
 * mute rows against an arbitrary UUID.
 */
export async function isMutableSubject(
  profileId: string,
  subjectType: PreferenceSubjectType,
  subjectId: string,
): Promise<boolean> {
  if (!profileId || !subjectId) return false
  try {
    const db = await createClient()
    if (subjectType === 'circle') {
      const { data } = await db
        .from('memberships')
        .select('id')
        .eq('profile_id', profileId)
        .eq('circle_id', subjectId)
        .eq('status', 'active')
        .maybeSingle()
      return !!data
    }
    const [{ data: member }, { data: owned }] = await Promise.all([
      db
        .from('space_members')
        .select('id')
        .eq('profile_id', profileId)
        .eq('space_id', subjectId)
        .eq('status', 'active')
        .maybeSingle(),
      db.from('spaces').select('id').eq('id', subjectId).eq('owner_profile_id', profileId).maybeSingle(),
    ])
    return !!member || !!owned
  } catch {
    return false
  }
}

/**
 * The Spaces and Circles this member belongs to, each carrying its current mute state.
 *
 * `muted` is true when ANY mute row exists for the subject, and `partial` when some but not
 * all of the topic × channel pairs are muted. Today the card only ever writes the full set,
 * so `partial` can only come from a finer-grained control we have not built yet (or a write
 * that half-failed) — it renders as muted with honest secondary copy rather than pretending
 * the subject is silent or pretending it is not.
 */
export async function listMuteSubjects(profileId: string): Promise<MuteSubjectRow[]> {
  try {
    const db = await createClient()
    const [{ data: spaceMemberRows }, { data: ownedRows }, { data: circleMemberRows }, mutes] =
      await Promise.all([
        db
          .from('space_members')
          .select('space_id')
          .eq('profile_id', profileId)
          .eq('status', 'active')
          .limit(MAX_SUBJECTS),
        db.from('spaces').select('id').eq('owner_profile_id', profileId).limit(MAX_SUBJECTS),
        db
          .from('memberships')
          .select('circle_id')
          .eq('profile_id', profileId)
          .eq('status', 'active')
          .limit(MAX_SUBJECTS),
        listSubjectMutes(profileId),
      ])

    const spaceIds = [
      ...new Set([
        ...(spaceMemberRows ?? []).map((r) => r.space_id),
        ...(ownedRows ?? []).map((r) => r.id),
      ]),
    ].filter(Boolean)
    const circleIds = [...new Set((circleMemberRows ?? []).map((r) => r.circle_id))].filter(Boolean)

    const [{ data: spaces }, { data: circles }] = await Promise.all([
      spaceIds.length
        ? db.from('spaces').select('id, name, brand_name').in('id', spaceIds)
        : Promise.resolve({ data: [] as { id: string; name: string; brand_name: string | null }[] }),
      circleIds.length
        ? db.from('circles').select('id, name').in('id', circleIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ])

    // How many topic × channel pairs are muted per subject, so the card can tell "all of it"
    // from "some of it" without a second read.
    const mutedCounts = new Map<string, number>()
    for (const m of mutes) {
      const key = `${m.subjectType}:${m.subjectId}`
      mutedCounts.set(key, (mutedCounts.get(key) ?? 0) + 1)
    }

    const rows: MuteSubjectRow[] = [
      ...(spaces ?? []).map((s) => toRow('space', s.id, s.brand_name || s.name, mutedCounts)),
      ...(circles ?? []).map((c) => toRow('circle', c.id, c.name, mutedCounts)),
    ]

    // Spaces first, then Circles, each alphabetical (the order the My Frequency menu uses).
    // A stable order matters here: a toggle must never make a row jump under the finger that
    // just tapped it.
    return rows.sort((a, b) =>
      a.subjectType === b.subjectType
        ? a.name.localeCompare(b.name)
        : a.subjectType === 'space'
          ? -1
          : 1,
    )
  } catch {
    return []
  }
}

function toRow(
  subjectType: PreferenceSubjectType,
  subjectId: string,
  name: string | null,
  mutedCounts: Map<string, number>,
): MuteSubjectRow {
  const count = mutedCounts.get(`${subjectType}:${subjectId}`) ?? 0
  return {
    subjectType,
    subjectId,
    name: name?.trim() || (subjectType === 'space' ? 'Space' : 'Circle'),
    muted: count > 0,
    partial: count > 0 && count < MUTE_ROWS_PER_SUBJECT,
  }
}
