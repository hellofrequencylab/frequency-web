// ─────────────────────────────────────────────────────────────────────────────
// WHICH CHANNELS A CIRCLE CARRIES, READ AND WRITTEN (LIVE-666, ADR-1679).
//
// A Circle carries one to three Channels: rows in `circle_channels` (migration 20270345011400) at
// position 1, 2 and 3, with position 1 mirrored onto `circles.topical_channel_id` as the primary.
// The column stays because the feed and RLS arms still read it (widening them is LIVE-730).
//
// Three things live here, and nowhere else:
//   * the READ of one Circle's list, primary first;
//   * the WRITE that replaces it and keeps the column equal to position 1 (the only such write);
//   * the READ of which Circles carry a Channel SECOND or THIRD. A primary is already found by a
//     column match, so this is what every "which Circles are in this Channel" reader widens with,
//     through `anyChannelFilter` (lib/circles/channels.ts).
//
// Every function takes the caller's client rather than opening one: the callers (the Programs data
// layer, the Channel pages, the Channels list, the Channel delete) already hold the service-role
// handle they read with, and this module adds no importer of it. AUTHZ IS THE CALLER'S JOB.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { circleChannelIds } from './channels'

/** Every Channel a Circle carries, primary first. Null when the Circle does not exist. */
export async function readCircleChannelIds(client: SupabaseClient, circleId: string): Promise<string[] | null> {
  const [{ data: circle }, { data: links }] = await Promise.all([
    client.from('circles').select('id, topical_channel_id').eq('id', circleId).maybeSingle(),
    client.from('circle_channels').select('topical_channel_id, position').eq('circle_id', circleId).order('position'),
  ])
  if (!circle) return null
  return circleChannelIds({
    topical_channel_id: (circle as { topical_channel_id: string | null }).topical_channel_id,
    circle_channels: (links ?? []) as { topical_channel_id: string; position: number }[],
  })
}

/**
 * Replace a Circle's Channels with `ids` (already checked, primary first; see
 * `normalizeCircleChannelIds`). No transaction spans PostgREST calls, so the order is chosen for the
 * failure: the join is rewritten, and a failed insert puts `previous` back before throwing; the
 * primary column moves last, so a Circle is never left with a primary the join does not also carry.
 */
export async function writeCircleChannels(
  client: SupabaseClient,
  circleId: string,
  ids: readonly string[],
  previous: readonly string[],
): Promise<void> {
  const rows = (list: readonly string[]) =>
    list.map((topical_channel_id, i) => ({ circle_id: circleId, topical_channel_id, position: i + 1 }))

  const { error: clearError } = await client.from('circle_channels').delete().eq('circle_id', circleId)
  if (clearError) throw new Error(clearError.message)
  if (ids.length > 0) {
    const { error: insertError } = await client.from('circle_channels').insert(rows(ids))
    if (insertError) {
      if (previous.length > 0) {
        const { error: restoreError } = await client.from('circle_channels').insert(rows(previous))
        if (restoreError) {
          console.error('[writeCircleChannels] restore after a failed write also failed', {
            circleId,
            message: restoreError.message,
          })
        }
      }
      throw new Error(insertError.message)
    }
  }
  const { error } = await client
    .from('circles')
    .update({ topical_channel_id: ids[0] ?? null })
    .eq('id', circleId)
  if (error) throw new Error(error.message)
}

/**
 * After a Channel is deleted: its `circle_channels` rows CASCADE and `circles.topical_channel_id`
 * is SET NULL, so a Circle whose primary it was is left with no primary while its second and third
 * Channels remain. This moves the next one up for each Circle given. Best effort: a Circle that
 * fails is logged and the rest still settle; readers find it under its remaining Channels either way.
 */
export async function promoteNextChannels(client: SupabaseClient, circleIds: readonly string[]): Promise<void> {
  for (const circleId of circleIds) {
    try {
      const current = await readCircleChannelIds(client, circleId)
      if (current && current.length > 0) await writeCircleChannels(client, circleId, current, current)
    } catch (err) {
      console.error('[promoteNextChannels] could not move the next Channel up', {
        circleId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/** One (Circle, Channel) pair where the Channel sits in position 2 or 3. */
export interface SecondaryCarrier {
  circle_id: string
  topical_channel_id: string
}

/**
 * Every Circle carrying one of these Channels in position 2 or 3. Position 1 is the primary, which
 * the column already answers for. Fail-soft: a read error returns no extra carriers and logs it, so
 * a Channel page falls back to what it showed before this table existed rather than going blank.
 */
export async function listSecondaryCarriers(
  client: SupabaseClient,
  channelIds: readonly string[],
): Promise<SecondaryCarrier[]> {
  if (channelIds.length === 0) return []
  const { data, error } = await client
    .from('circle_channels')
    .select('circle_id, topical_channel_id')
    .in('topical_channel_id', [...channelIds])
    .gt('position', 1)
  if (error) {
    console.error('[listSecondaryCarriers] circle_channels read failed', { message: error.message })
    return []
  }
  return (data ?? []) as SecondaryCarrier[]
}

/** The Circle ids that carry one Channel second or third. */
export async function secondaryCircleIds(client: SupabaseClient, channelId: string): Promise<string[]> {
  return (await listSecondaryCarriers(client, [channelId])).map((r) => r.circle_id)
}
