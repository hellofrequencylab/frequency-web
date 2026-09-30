// ─────────────────────────────────────────────────────────────────────────────
// THE CHANNELS A CIRCLE CARRIES (LIVE-666, ADR-1679).
//
// A Circle carries one to three Channels (owner ruling 2026-09-29, "Up to 3 Channels"). They live
// in `circle_channels` (migration 20270345011400), one row per Channel with a `position` of 1, 2 or
// 3. Position 1 is the PRIMARY, and the primary also stays on `circles.topical_channel_id`, because
// the feed and RLS arms still read that column (widening them is LIVE-730).
//
// This file is the vocabulary every surface shares: the cap, the check a pick passes before it is
// written, the reading of a row into its ordered list, and the filter a reader uses to find every
// Circle that carries a Channel. PURE: no Supabase, no Next, no React. The manifest imports the cap
// from here, so the Studio field, the write door and the database agree on one number.
// ─────────────────────────────────────────────────────────────────────────────

/** The most Channels one Circle may carry. The database holds the same line (position 1..3). */
export const CIRCLE_MAX_CHANNELS = 3

/** Refusal copy, member facing (docs/CONTENT-VOICE.md). */
export const TOO_MANY_CHANNELS = 'A Circle can carry up to three Channels.'

/**
 * Check a pick before it is written. Trims, drops blanks and repeats (the first mention keeps its
 * place, so the order a Host picked is the order stored), and refuses more than three. The first id
 * is the primary. An empty list is a Circle with no Channel, which is allowed. PURE + total.
 */
export function normalizeCircleChannelIds(raw: readonly unknown[]): { ids: string[] } | { problem: string } {
  const ids: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') return { problem: 'That Channel is not available.' }
    const id = v.trim()
    if (id && !ids.includes(id)) ids.push(id)
  }
  if (ids.length > CIRCLE_MAX_CHANNELS) return { problem: TOO_MANY_CHANNELS }
  return { ids }
}

/** One `circle_channels` row as a reader embeds it. */
export interface CircleChannelLink {
  topical_channel_id: string
  position?: number | null
}

/**
 * Every Channel a Circle carries, primary first, then the others by position. Reads the column AND
 * the join, so a Circle written before the join existed (or by a door that only sets the column,
 * like a brand-new draft) still reads as carrying its primary. PURE + total.
 */
export function circleChannelIds(row: {
  topical_channel_id?: string | null
  circle_channels?: readonly CircleChannelLink[] | null
}): string[] {
  const out: string[] = []
  if (row.topical_channel_id) out.push(row.topical_channel_id)
  const links = [...(row.circle_channels ?? [])].sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
  for (const l of links) if (l.topical_channel_id && !out.includes(l.topical_channel_id)) out.push(l.topical_channel_id)
  return out.slice(0, CIRCLE_MAX_CHANNELS)
}

/** Whether a Circle carries a Channel, in any position. PURE. */
export function carriesChannel(
  row: { topical_channel_id?: string | null; circle_channels?: readonly CircleChannelLink[] | null },
  channelId: string,
): boolean {
  return circleChannelIds(row).includes(channelId)
}

/**
 * The `.or()` filter that finds every Circle carrying a Channel: its primary on the column, or one
 * of the Circles that carry it second or third (`secondaryCircleIds`, read from the join by the
 * caller). With no secondary carriers it is the plain column match, so a Channel nobody carries
 * second reads exactly as it always did. PURE.
 */
export function anyChannelFilter(channelId: string, secondaryCircleIds: readonly string[]): string {
  // The ids go into a PostgREST filter STRING, where `,` `.` `(` `)` `"` and spaces are syntax, so
  // only a plain id (a uuid) may reach it. A Channel id that is not one is refused outright; a
  // carrier id that is not one is dropped. `.eq()` used to parameterize this; the string cannot.
  if (!PLAIN_ID.test(channelId)) throw new Error('That Channel is not available.')
  const secondary = secondaryCircleIds.filter((id) => PLAIN_ID.test(id))
  const primary = `topical_channel_id.eq.${channelId}`
  return secondary.length > 0 ? `${primary},id.in.(${secondary.join(',')})` : primary
}

/** Letters, digits and hyphens: every uuid, and nothing PostgREST reads as filter syntax. */
const PLAIN_ID = /^[A-Za-z0-9-]+$/

/**
 * The next list after one Channel is taken out, so the next one moves up to primary. PURE.
 */
export function withoutChannel(current: readonly string[], channelId: string): string[] {
  return current.filter((id) => id !== channelId)
}

/**
 * The list after a Channel is put FIRST: the Program stamp (a Chapter's primary is its Program).
 * Keeps the others behind it, and at three drops the last so the stamp always lands. PURE.
 */
export function withChannelFirst(current: readonly string[], channelId: string): string[] {
  return [channelId, ...current.filter((id) => id !== channelId)].slice(0, CIRCLE_MAX_CHANNELS)
}

/**
 * The list after a Channel is ADDED at the end (a Channel steward adds a Circle to their Channel):
 * unchanged when it is already carried, refused when the Circle already carries three. PURE.
 */
export function withChannelAdded(current: readonly string[], channelId: string): { ids: string[] } | { problem: string } {
  if (current.includes(channelId)) return { ids: [...current] }
  if (current.length >= CIRCLE_MAX_CHANNELS) return { problem: TOO_MANY_CHANNELS }
  return { ids: [...current, channelId] }
}

/**
 * Count distinct Circles per Channel from (circle, channel) pairs read off the column and the join.
 * A Circle counted under its primary is not counted again for the same Channel. PURE.
 */
export function countCirclesPerChannel(pairs: readonly { circle_id: string; topical_channel_id: string | null }[]): Record<string, number> {
  const seen = new Set<string>()
  const out: Record<string, number> = {}
  for (const p of pairs) {
    if (!p.topical_channel_id) continue
    const key = `${p.circle_id}:${p.topical_channel_id}`
    if (seen.has(key)) continue
    seen.add(key)
    out[p.topical_channel_id] = (out[p.topical_channel_id] ?? 0) + 1
  }
  return out
}
