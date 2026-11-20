/**
 * The edition store (FH-044): the IO half of lib/hunts/editions.ts.
 *
 *   releaseEdition      publish the open draft as the next edition, move each printed code with its
 *                       place, and retire the outgoing edition. Existing runs are not touched.
 *   loadRunRecord       a run read against the edition it started on, whatever is current now
 *   loadRegularsImport / loadQrCampaignImport / createImportedDraft
 *                       a legacy hunt's shape as a new unpublished draft. Reads the legacy rows only.
 *   readOldGrants       a member's own rewards from earlier editions and from the imported legacy
 *                       hunt, read where they were written and never copied
 *
 * Every Hunt table is service role only, so this file is the tenancy wall: a write runs after
 * `authorizeHuntAction` (lib/hunts/authz.ts), a member read is scoped to the profile id the action
 * derived. Authoring calls answer nothing until HUNTS_AUTHORING_ENABLED is on, member reads until
 * HUNTS_ENABLED is on.
 *
 * Release is not one transaction, like publish (ADR-1940). Its order makes a failure half way safe:
 * the note first (on the draft), then the publish, then the bindings (an upsert on their key), then
 * the outgoing edition flips to superseded. Calling it again finishes whatever is left.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { listHuntsForSpace } from '@/lib/loyalty/hunt-store'
import { parseTrailDraft, stopKey as stopKeyOf } from './draft'
import {
  buildCrosswalk, carryBindings, importQrCampaign, importRegularsHunt, parseEditionNote, parseImportNote, runStanding, sortOldGrants,
  type Binding, type EditionNote, type OldGrant,
} from './editions'
import { huntSwitchOn } from './flags'
import type { Credit } from './graph'
import { assembleTrail } from './run-store'
import { authorizeHuntAction, createTrailDraft, publishTrail, type Actor, type PublishResult, type PublishVisibility } from './store'

// eslint-disable-next-line no-restricted-syntax -- the hunt tables are not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

type VersionRow = { id: string; version_no: number; status: string; policy: Record<string, unknown> | null }

// ── Release ──────────────────────────────────────────────────────────────────────────────────────

type ReleaseResult =
  | {
      ok: true
      versionNo: number
      /** Printed codes that followed their place into this edition. */
      carried: number
      /** Printed codes whose place was dropped. They open the Trail and credit nothing. */
      retired: string[]
      /** Active runs left on the outgoing edition, with its rules and their credits. */
      pinnedRuns: number
    }
  | Exclude<PublishResult, { ok: true }>
  | { ok: false; reason: 'nothing_to_release' }

/** Move each sign with its place, then retire the outgoing edition. Every step is safe to repeat. */
async function finishRelease(client: SupabaseClient, huntId: string, outgoing: VersionRow, incoming: VersionRow, note: EditionNote) {
  const bound = await client
    .from('hunt_mission_placements')
    .select('mission_key, placement_id, venue_space_id, evidence_policy', { count: 'exact' })
    .eq('version_id', outgoing.id)
    .eq('hunt_id', huntId)
  const rows = bound.data as { mission_key: string; placement_id: string; venue_space_id: string | null; evidence_policy: Record<string, unknown> | null }[] | null
  // A failed or truncated read must not silently retire a sign.
  if (bound.error || !rows || bound.count !== rows.length) throw new Error('The printed codes could not be read.')
  const bindings: Binding[] = rows.map((r) => ({ missionKey: r.mission_key, placementId: r.placement_id, venueSpaceId: r.venue_space_id, evidencePolicy: r.evidence_policy ?? {} }))
  const { carried, retired } = carryBindings(bindings, note.crosswalk)
  if (carried.length > 0) {
    const { error } = await client.from('hunt_mission_placements').upsert(
      carried.map((b) => ({ version_id: incoming.id, hunt_id: huntId, mission_key: b.missionKey, placement_id: b.placementId, venue_space_id: b.venueSpaceId, evidence_policy: b.evidencePolicy })),
      { onConflict: 'version_id,mission_key,placement_id' },
    )
    if (error) throw new Error(error.message)
  }

  const runs = await client.from('hunt_runs').select('id', { count: 'exact', head: true }).eq('version_id', outgoing.id).eq('hunt_id', huntId).eq('state', 'active')

  // Forward only: the database refuses to bring a superseded edition back or to rewrite its trail.
  const { error } = await client.from('hunt_versions').update({ status: 'superseded' }).eq('id', outgoing.id).eq('hunt_id', huntId).eq('status', 'published')
  if (error) throw new Error(error.message)
  return { carried: carried.length, retired, pinnedRuns: runs.count ?? 0 }
}

/**
 * Release the open draft as the next edition. The Hunt keeps its slug, so its public address does not
 * move. No run is updated: a run on the outgoing edition stays on it (the database refuses to move
 * one), keeps its credits and is read against its own rules by `loadRunRecord`.
 */
export async function releaseEdition(
  huntId: string,
  actor: Actor,
  input: { baseRevision: number; label: string; visibility: PublishVisibility; permissionConfirmed: boolean },
): Promise<ReleaseResult> {
  if (!huntSwitchOn('authoring')) return { ok: false, reason: 'forbidden' }
  const hunt = await authorizeHuntAction(huntId, actor, 'publish')
  if (!hunt) return { ok: false, reason: 'forbidden' }
  const client = db()
  const { data, error } = await client.from('hunt_versions').select('id, version_no, status, policy').eq('hunt_id', huntId).order('version_no', { ascending: false }).limit(100)
  if (error) throw new Error(error.message)
  const versions = (data ?? []) as VersionRow[]
  const latest = versions[0]
  if (!latest) return { ok: false, reason: 'nothing_to_release' }

  if (latest.status === 'draft') {
    const outgoing = versions.find((v) => v.id === hunt.currentVersionId && v.status === 'published') ?? null
    const note: EditionNote = {
      label: input.label.trim().slice(0, 80) || `Edition ${latest.version_no}`,
      previousVersionId: outgoing?.id ?? null,
      crosswalk: outgoing ? buildCrosswalk(parseTrailDraft(outgoing.policy?.trail).stops, parseTrailDraft(latest.policy?.trail).stops) : {},
    }
    const noted = await client.from('hunt_versions').update({ policy: { ...(latest.policy ?? {}), edition: note } }).eq('id', latest.id).eq('hunt_id', huntId).eq('status', 'draft')
    if (noted.error) throw new Error(noted.error.message)
    const published = await publishTrail(huntId, actor, input.baseRevision, input.visibility, input.permissionConfirmed)
    if (!published.ok) return published
    const done = outgoing ? await finishRelease(client, huntId, outgoing, latest, note) : { carried: 0, retired: [], pinnedRuns: 0 }
    return { ok: true, versionNo: latest.version_no, ...done }
  }

  // A release that published and then failed: the outgoing edition is still marked published. Finish it.
  const note = parseEditionNote(latest.policy?.edition)
  const outgoing = note?.previousVersionId ? versions.find((v) => v.id === note.previousVersionId && v.status === 'published') : undefined
  if (latest.status === 'published' && latest.id === hunt.currentVersionId && note && outgoing) {
    return { ok: true, versionNo: latest.version_no, ...(await finishRelease(client, huntId, outgoing, latest, note)) }
  }
  return { ok: false, reason: 'nothing_to_release' }
}

/** What a release would do, read before the tap (FH-044S). Nothing is written. */
export type ReleasePreview = {
  versionNo: number
  /** Each outgoing stop's place and the place it maps to in the new edition, or null when dropped. */
  crosswalk: { from: string; to: string | null }[]
  /** Printed codes that follow their place into the new edition. */
  carried: number
  /** Printed codes whose place was dropped, by the code printed on them. */
  retired: string[]
  /** Active runs left on the outgoing edition. They get EDITION_GRACE_DAYS to finish on it. */
  pinnedRuns: number
}

/** The release preview for the editor's publish step, or null when there is no live edition and open draft. */
export async function previewRelease(huntId: string, actor: Actor): Promise<ReleasePreview | null> {
  if (!huntSwitchOn('authoring')) return null
  const hunt = await authorizeHuntAction(huntId, actor, 'publish')
  if (!hunt?.currentVersionId) return null
  const client = db()
  const { data, error } = await client.from('hunt_versions').select('id, version_no, status, policy').eq('hunt_id', huntId).order('version_no', { ascending: false }).limit(100)
  if (error) throw new Error(error.message)
  const versions = (data ?? []) as VersionRow[]
  const latest = versions[0]
  const outgoing = versions.find((v) => v.id === hunt.currentVersionId && v.status === 'published')
  if (!latest || latest.status !== 'draft' || !outgoing) return null

  const oldStops = parseTrailDraft(outgoing.policy?.trail).stops
  const newStops = parseTrailDraft(latest.policy?.trail).stops
  const crosswalk = buildCrosswalk(oldStops, newStops)
  const [bound, runs] = await Promise.all([
    client.from('hunt_mission_placements').select('mission_key, placement_id, venue_space_id, evidence_policy', { count: 'exact' }).eq('version_id', outgoing.id).eq('hunt_id', huntId),
    client.from('hunt_runs').select('id', { count: 'exact', head: true }).eq('version_id', outgoing.id).eq('hunt_id', huntId).eq('state', 'active'),
  ])
  const rows = bound.data as { mission_key: string; placement_id: string; venue_space_id: string | null; evidence_policy: Record<string, unknown> | null }[] | null
  if (bound.error || !rows || bound.count !== rows.length || runs.error) throw new Error('The printed codes could not be read.')
  const { carried, retired } = carryBindings(
    rows.map((r) => ({ missionKey: r.mission_key, placementId: r.placement_id, venueSpaceId: r.venue_space_id, evidencePolicy: r.evidence_policy ?? {} })),
    crosswalk,
  )
  let retiredCodes: string[] = []
  if (retired.length > 0) {
    const codes = await client.from('hunt_placements').select('id, slug').in('id', retired)
    if (codes.error) throw new Error(codes.error.message)
    const slugOf = new Map(((codes.data ?? []) as { id: string; slug: string | null }[]).map((c) => [c.id, c.slug]))
    retiredCodes = retired.map((id) => slugOf.get(id) ?? id)
  }
  const placeOf = (stops: typeof oldStops, key: string | null) => {
    const i = key ? Number(key.replace('stop-', '')) - 1 : -1
    return i >= 0 ? stops[i]?.place.trim() || key : null
  }
  return {
    versionNo: latest.version_no,
    crosswalk: oldStops.map((s, i) => ({ from: s.place.trim() || `Stop ${i + 1}`, to: placeOf(newStops, crosswalk[stopKeyOf(i)] ?? null) })),
    carried: carried.length,
    retired: retiredCodes,
    pinnedRuns: runs.count ?? 0,
  }
}

// ── A run against its own edition ────────────────────────────────────────────────────────────────

type RunRecord = {
  standing: 'playing' | 'record'
  editionNo: number
  editionLabel: string | null
  title: string
  graph: ReturnType<typeof assembleTrail>['graph']
  content: ReturnType<typeof assembleTrail>['content']
  credits: Credit[]
}

/**
 * The caller's own run with the rules of the edition it started on. It reads missions and rule groups
 * by the run's version id, never the Hunt's current one, so a newer edition changes nothing it returns.
 */
export async function loadRunRecord(profileId: string, runId: string): Promise<RunRecord | null> {
  if (!huntSwitchOn('enabled')) return null
  const client = db()
  const { data: runRow, error } = await client.from('hunt_runs').select('id, hunt_id, version_id, state').eq('id', runId).eq('subject_profile_id', profileId).maybeSingle()
  const run = error ? null : (runRow as { id: string; hunt_id: string; version_id: string; state: string } | null)
  if (!run) return null

  const [hunt, version, m, g, mem, progress] = await Promise.all([
    client.from('hunts').select('slug, current_version_id').eq('id', run.hunt_id).maybeSingle(),
    client.from('hunt_versions').select('id, version_no, status, policy').eq('id', run.version_id).eq('hunt_id', run.hunt_id).in('status', ['published', 'superseded']).maybeSingle(),
    client.from('hunt_missions').select('mission_key, title, visible_body, locked_teaser, opens_at, closes_at', { count: 'exact' }).eq('version_id', run.version_id),
    client.from('hunt_rule_groups').select('id, target_mission_key, target_finish, logic, min_count, group_key', { count: 'exact' }).eq('version_id', run.version_id),
    client.from('hunt_rule_group_members').select('group_id, member_mission_key', { count: 'exact' }).eq('version_id', run.version_id),
    client.from('hunt_progress').select('mission_key, disposition', { count: 'exact' }).eq('run_id', run.id),
  ])
  const h = hunt.data as { slug: string; current_version_id: string | null } | null
  const v = version.data as VersionRow | null
  const whole = (r: { data: unknown; count: number | null; error: unknown }) => !r.error && Array.isArray(r.data) && r.count === r.data.length
  if (hunt.error || version.error || !h || !v || !whole(m) || !whole(g) || !whole(mem) || !whole(progress)) return null

  const { graph, content } = assembleTrail(
    m.data as Parameters<typeof assembleTrail>[0],
    g.data as Parameters<typeof assembleTrail>[1],
    mem.data as Parameters<typeof assembleTrail>[2],
  )
  const title = parseTrailDraft(v.policy?.trail).title.trim() || h.slug
  return {
    standing: runStanding({ versionId: run.version_id, state: run.state }, { currentVersionId: h.current_version_id }),
    editionNo: v.version_no,
    editionLabel: parseEditionNote(v.policy?.edition)?.label ?? null,
    title,
    graph,
    content,
    credits: (progress.data as { mission_key: string; disposition: string }[]).filter((p) => p.disposition === 'credited').map((p) => ({ mission_key: p.mission_key })),
  }
}

// ── Imports ──────────────────────────────────────────────────────────────────────────────────────

type Imported = ReturnType<typeof importRegularsHunt>

/** A Regulars hunt this Space hosts, as a draft. `listHuntsForSpace` runs the loyalty owner gate, so only the host's owner reads it. */
export async function loadRegularsImport(input: { spaceId: string; legacyHuntId: string }): Promise<Imported | null> {
  if (!huntSwitchOn('authoring')) return null
  const source = (await listHuntsForSpace(input.spaceId)).find((h) => h.id === input.legacyHuntId && h.hostSpaceId === input.spaceId)
  return source ? importRegularsHunt(source, new Date().toISOString()) : null
}

/** A QR campaign (a qr_scan challenge and its code set), as a draft. The caller has passed the admin QR gate. */
export async function loadQrCampaignImport(challengeId: string): Promise<Imported | null> {
  if (!huntSwitchOn('authoring')) return null
  const admin = createAdminClient()
  const { data: challenge } = await admin.from('season_challenges').select('id, name, description, criteria, target').eq('id', challengeId).maybeSingle()
  if (!challenge || (challenge.criteria as { type?: unknown } | null)?.type !== 'qr_scan') return null
  const { data: links } = await admin.from('challenge_qr_codes').select('qr_code_id, created_at').eq('challenge_id', challenge.id).order('created_at', { ascending: true }).limit(200)
  const ids = (links ?? []).map((l) => l.qr_code_id)
  const { data: codes } = ids.length ? await admin.from('qr_codes').select('id, title').in('id', ids) : { data: [] }
  const titles = new Map((codes ?? []).map((c) => [c.id, c.title]))
  return importQrCampaign(
    { id: challenge.id, name: challenge.name, description: challenge.description, target: challenge.target, codes: ids.map((id) => ({ title: titles.get(id) ?? '' })) },
    new Date().toISOString(),
  )
}

/**
 * Write an import as a private draft Trail the caller owns, with the note of where it came from. It
 * writes `hunts` and one draft `hunt_versions` row and nothing else: no run, claim, credit or reward
 * exists for it, and no legacy row is changed.
 */
export async function createImportedDraft(ownerProfileId: string, imported: Imported): Promise<{ huntId: string }> {
  const made = await createTrailDraft({ ownerProfileId, draft: imported.draft })
  const client = db()
  const { error } = await client
    .from('hunt_versions')
    .update({ policy: { trail: { ...imported.draft, routeTestedAtRevision: null }, import: imported.note } })
    .eq('hunt_id', made.huntId)
    .eq('version_no', 1)
    .eq('status', 'draft')
  if (error) {
    await client.from('hunts').delete().eq('id', made.huntId)
    throw new Error(error.message)
  }
  return { huntId: made.huntId }
}

// ── Old grants ───────────────────────────────────────────────────────────────────────────────────

/**
 * The member's own rewards from before the current edition of one Hunt: Hunt rewards granted on an
 * earlier edition, and rewards from the legacy hunt this Trail was imported from. Read only, scoped to
 * `profileId`, and read from the table each was written to: nothing is copied into the new edition.
 */
export async function readOldGrants(profileId: string, huntId: string): Promise<OldGrant[]> {
  if (!huntSwitchOn('enabled')) return []
  const client = db()
  const [hunt, versionRows, grantRows] = await Promise.all([
    client.from('hunts').select('current_version_id').eq('id', huntId).maybeSingle(),
    client.from('hunt_versions').select('id, version_no, status, policy').eq('hunt_id', huntId).limit(100),
    client.from('hunt_reward_grants').select('reward_id, state, granted_at').eq('hunt_id', huntId).eq('profile_id', profileId).limit(200),
  ])
  if (hunt.error || versionRows.error || grantRows.error || !hunt.data) return []
  const current = (hunt.data as { current_version_id: string | null }).current_version_id
  const versions = (versionRows.data ?? []) as VersionRow[]
  const grants = (grantRows.data ?? []) as { reward_id: string; state: string; granted_at: string }[]
  const out: OldGrant[] = []

  if (grants.length > 0) {
    const { data } = await client.from('hunt_rewards').select('id, title, version_id').eq('hunt_id', huntId).in('id', grants.map((g) => g.reward_id))
    const rewards = new Map(((data ?? []) as { id: string; title: string; version_id: string }[]).map((r) => [r.id, r]))
    for (const g of grants) {
      const reward = rewards.get(g.reward_id)
      const version = reward ? versions.find((v) => v.id === reward.version_id) : undefined
      if (!reward || !version || version.id === current || g.state === 'revoked') continue
      out.push({ source: 'edition', title: reward.title, earnedAt: g.granted_at, state: g.state === 'granted' ? 'held' : 'used', editionNo: version.version_no })
    }
  }

  const admin = createAdminClient()
  const sources = new Map(versions.flatMap((v) => { const n = parseImportNote(v.policy?.import); return n ? [[`${n.source}:${n.sourceId}`, n] as const] : [] }))
  for (const note of sources.values()) {
    if (note.source === 'regulars') {
      const { data } = await admin.from('loyalty_rewards').select('reward_title, earned_at, redeemed_at').eq('hunt_id', note.sourceId).eq('profile_id', profileId).limit(50)
      for (const r of data ?? []) out.push({ source: 'regulars', title: r.reward_title, earnedAt: r.earned_at, state: r.redeemed_at ? 'used' : 'held', editionNo: null })
    } else {
      const { data: done } = await admin.from('challenge_progress').select('completed_at').eq('challenge_id', note.sourceId).eq('profile_id', profileId).not('completed_at', 'is', null).limit(1)
      const completedAt = done?.[0]?.completed_at
      if (!completedAt) continue
      const { data: challenge } = await admin.from('season_challenges').select('name').eq('id', note.sourceId).maybeSingle()
      out.push({ source: 'qr_campaign', title: challenge?.name ?? 'Campaign finished', earnedAt: completedAt, state: 'used', editionNo: null })
    }
  }
  return sortOldGrants(out)
}
