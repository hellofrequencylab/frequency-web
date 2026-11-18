import 'server-only'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { newSearchOAuthState, parseSearchOAuthState } from '@/lib/ai/discovery-oauth-state'
import { openCalendarSecret, sealCalendarSecret, type CalendarSealBinding } from './seal'
import type { CalendarProvider, CalendarTokens } from './oauth'
import type { BusyBlock, MirroredBlock, SyncConflict } from './plan'

// CALENDAR SYNC STORAGE (LIVE-1179, ADR-1976). Every read and write rides the CALLER'S OWN session:
// space_calendar_sync_connections is locked to the Space's owner and admins by RLS
// (private.is_space_admin), and the mirrored busy blocks are ordinary rows of the private calendar
// layer (space_calendar_entries, source_kind 'calendar_sync'), locked by its own team policies. No
// admin client. Tokens are sealed before they are written and opened only here, on the server.
//
// Both tables are reached through a narrow untyped seam until lib/database.types.ts regenerates
// (ADR-246). Every function fails safe: null, false or [] on any error.

export interface SyncConnection {
  id: string
  spaceId: string
  provider: CalendarProvider
  state: 'pending' | 'connected'
  calendarId: string
  calendarLabel: string | null
  conflicts: SyncConflict[]
  lastSyncedAt: string | null
  lastError: string | null
}

type Row = {
  id: string
  space_id: string
  provider: CalendarProvider
  state: 'pending' | 'connected'
  calendar_id: string
  calendar_label: string | null
  pending_ciphertext: string | null
  tokens_ciphertext: string | null
  conflicts: unknown
  last_synced_at: string | null
  last_error: string | null
}
type Res<T> = { data: T | null; error: unknown }
interface Query<T> extends PromiseLike<Res<T>> {
  select(columns: string): Query<T>
  eq(column: string, value: unknown): Query<T>
  in(column: string, values: string[]): Query<T>
  is(column: string, value: null): Query<T>
  gt(column: string, value: string): Query<T>
  gte(column: string, value: string): Query<T>
  limit(n: number): Query<T>
  maybeSingle(): Promise<Res<T extends (infer U)[] ? U : T>>
}
type Table = {
  select(columns: string): Query<Row[]>
  upsert(value: Record<string, unknown>, options: { onConflict: string }): Query<Row[]>
  update(value: Record<string, unknown>): Query<Row[]>
  delete(): Query<Row[]>
  insert(rows: Record<string, unknown>[]): Query<Row[]>
}
type EntryTable = {
  select(columns: string): Query<{ id: string; starts_at: string; ends_at: string; source_id: string | null; metadata: unknown }[]>
  insert(rows: Record<string, unknown>[]): PromiseLike<{ error: unknown }>
  update(value: Record<string, unknown>): Query<unknown[]>
}

async function table<T>(name: 'space_calendar_sync_connections' | 'space_calendar_entries'): Promise<T> {
  return ((await createClient()) as unknown as { from(t: string): T }).from(name)
}
const connections = () => table<Table>('space_calendar_sync_connections')
const entries = () => table<EntryTable>('space_calendar_entries')

const COLS = 'id,space_id,provider,state,calendar_id,calendar_label,pending_ciphertext,tokens_ciphertext,conflicts,last_synced_at,last_error'
const MIRROR_KIND = 'calendar_sync'

function binding(row: Pick<Row, 'id' | 'space_id' | 'provider'>): CalendarSealBinding {
  return { spaceId: row.space_id, provider: row.provider, connectionId: row.id }
}

function conflictList(raw: unknown): SyncConflict[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (c): c is SyncConflict =>
      !!c && typeof c === 'object' && typeof c.eventId === 'string' && typeof c.remoteId === 'string' && typeof c.title === 'string' &&
      (c.kind === 'edited_there' || c.kind === 'removed_here_edited_there'),
  )
}

function view(row: Row): SyncConnection {
  return {
    id: row.id,
    spaceId: row.space_id,
    provider: row.provider,
    state: row.state,
    calendarId: row.calendar_id,
    calendarLabel: row.calendar_label,
    conflicts: conflictList(row.conflicts),
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
  }
}

function tokensFrom(raw: unknown): CalendarTokens | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  if (typeof v.accessToken !== 'string' || typeof v.expiresAt !== 'string' || (v.refreshToken !== undefined && typeof v.refreshToken !== 'string')) return null
  return { accessToken: v.accessToken, expiresAt: v.expiresAt, ...(typeof v.refreshToken === 'string' ? { refreshToken: v.refreshToken } : {}) }
}

export async function readSyncConnection(spaceId: string, provider: CalendarProvider): Promise<SyncConnection | null> {
  try {
    const { data, error } = await (await connections()).select(COLS).eq('space_id', spaceId).eq('provider', provider).maybeSingle()
    return error || !data ? null : view(data)
  } catch {
    return null
  }
}

/** Start a connect. A new generation replaces any earlier row for this Space and provider. */
export async function beginSyncConnection(spaceId: string, provider: CalendarProvider, actorId: string): Promise<{ state: string; challenge: string } | null> {
  try {
    const id = randomUUID()
    const oauth = newSearchOAuthState(id)
    const pending = sealCalendarSecret({ spaceId, provider, connectionId: id }, 'pending', { verifier: oauth.verifier })
    if (!pending) return null
    const now = new Date()
    const { error } = await (await connections()).upsert(
      {
        id, space_id: spaceId, provider, state: 'pending', calendar_id: 'primary', calendar_label: null,
        nonce_hash: oauth.nonceHash, nonce_expires_at: new Date(now.getTime() + 600_000).toISOString(),
        pending_ciphertext: pending, tokens_ciphertext: null, conflicts: [], last_error: null,
        connected_by: actorId, updated_at: now.toISOString(),
      },
      { onConflict: 'space_id,provider' },
    )
    return error ? null : { state: oauth.state, challenge: oauth.challenge }
  } catch {
    return null
  }
}

/** Find the pending connect a callback answers. RLS already limits this to the Space's admins, so a
 *  state started by someone else's Space never matches. */
export async function findPendingConnection(provider: CalendarProvider, state: string): Promise<{ connection: SyncConnection; verifier: string; nonceHash: string } | null> {
  try {
    const parsed = parseSearchOAuthState(state)
    if (!parsed) return null
    const { data, error } = await (await connections())
      .select(COLS).eq('id', parsed.connectionId).eq('provider', provider).eq('state', 'pending')
      .eq('nonce_hash', parsed.nonceHash).gt('nonce_expires_at', new Date().toISOString()).maybeSingle()
    if (error || !data) return null
    const secret = openCalendarSecret(binding(data), 'pending', data.pending_ciphertext) as { verifier?: unknown } | null
    if (!secret || typeof secret.verifier !== 'string') return null
    return { connection: view(data), verifier: secret.verifier, nonceHash: parsed.nonceHash }
  } catch {
    return null
  }
}

/** Seal and store tokens. Compare-and-swap on the pending nonce, so a replayed callback writes nothing. */
export async function completeSyncConnection(connection: SyncConnection, nonceHash: string, tokens: CalendarTokens): Promise<boolean> {
  try {
    const sealed = sealCalendarSecret(binding({ id: connection.id, space_id: connection.spaceId, provider: connection.provider }), 'tokens', tokens)
    if (!sealed) return false
    const { data, error } = await (await connections())
      .update({ state: 'connected', tokens_ciphertext: sealed, pending_ciphertext: null, nonce_hash: null, nonce_expires_at: null, updated_at: new Date().toISOString() })
      .eq('id', connection.id).eq('state', 'pending').eq('nonce_hash', nonceHash).select('id')
    return !error && !!data?.length
  } catch {
    return false
  }
}

/** The sealed tokens of a connected calendar. Server-only; never return them to a client. */
export async function openSyncTokens(connection: SyncConnection): Promise<CalendarTokens | null> {
  try {
    const { data, error } = await (await connections()).select(COLS).eq('id', connection.id).eq('state', 'connected').maybeSingle()
    if (error || !data) return null
    return tokensFrom(openCalendarSecret(binding(data), 'tokens', data.tokens_ciphertext))
  } catch {
    return null
  }
}

/** Record what a sync found. `tokens` is set when they were refreshed on the way. */
export async function recordSyncResult(
  connection: SyncConnection,
  result: { conflicts: SyncConflict[]; label: string | null; error: string | null; tokens?: CalendarTokens },
): Promise<void> {
  try {
    const sealed = result.tokens
      ? sealCalendarSecret(binding({ id: connection.id, space_id: connection.spaceId, provider: connection.provider }), 'tokens', result.tokens)
      : null
    await (await connections())
      .update({
        conflicts: result.conflicts,
        ...(result.label ? { calendar_label: result.label } : {}),
        last_error: result.error,
        ...(result.error ? {} : { last_synced_at: new Date().toISOString() }),
        ...(sealed ? { tokens_ciphertext: sealed } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id).eq('state', 'connected')
  } catch {
    // The next sync writes it again.
  }
}

/** Disconnect: the row goes, and the busy blocks it mirrored leave the calendar. */
export async function deleteSyncConnection(spaceId: string, provider: CalendarProvider): Promise<boolean> {
  try {
    const { error } = await (await connections()).delete().eq('space_id', spaceId).eq('provider', provider)
    if (error) return false
    const mirrored = await listMirroredBlocks(spaceId, provider, null)
    return removeMirroredBlocks(spaceId, mirrored.map((m) => m.id))
  } catch {
    return false
  }
}

/** The busy blocks this provider mirrored onto the Space calendar, from `fromWall` on (all when null).
 *  Each carries the connection that wrote it, so a block left by an earlier connection is removed. */
export async function listMirroredBlocks(spaceId: string, provider: CalendarProvider, fromWall: string | null): Promise<(MirroredBlock & { connectionId: string | null })[]> {
  try {
    let q = (await entries()).select('id,starts_at,ends_at,source_id,metadata').eq('space_id', spaceId).eq('source_kind', MIRROR_KIND).is('removed_at', null)
    if (fromWall) q = q.gte('starts_at', fromWall)
    const { data, error } = await q.limit(2000)
    if (error || !data) return []
    return data.flatMap((r) => {
      const meta = r.metadata && typeof r.metadata === 'object' ? (r.metadata as Record<string, unknown>) : {}
      if (meta.provider !== provider || typeof meta.external_id !== 'string') return []
      return [{ id: r.id, externalId: meta.external_id, startsAt: r.starts_at, endsAt: r.ends_at, connectionId: r.source_id }]
    })
  } catch {
    return []
  }
}

export async function insertMirroredBlocks(connection: SyncConnection, blocks: BusyBlock[], timeZone: string, actorId: string): Promise<boolean> {
  if (blocks.length === 0) return true
  try {
    const { error } = await (await entries()).insert(
      blocks.map((b) => ({
        space_id: connection.spaceId,
        kind: 'unavailable',
        title: 'Busy',
        all_day: b.allDay,
        starts_at: b.startsAt,
        ends_at: b.endsAt,
        time_zone: timeZone,
        status: 'confirmed',
        blocks_time: true,
        visibility: 'team',
        source_kind: MIRROR_KIND,
        source_id: connection.id,
        metadata: { provider: connection.provider, external_id: b.externalId },
        created_by: actorId,
      })),
    )
    return !error
  } catch {
    return false
  }
}

/** Tombstone mirrored blocks (removed_at), the private layer's delete (LIVE-536). */
export async function removeMirroredBlocks(spaceId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true
  try {
    const { error } = await (await entries())
      .update({ removed_at: new Date().toISOString() })
      .eq('space_id', spaceId).eq('source_kind', MIRROR_KIND).in('id', ids)
    return !error
  } catch {
    return false
  }
}
