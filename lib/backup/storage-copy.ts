import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { putR2Object, type R2Config } from '@/lib/backup/r2'

// The nightly copy of Storage files to a second provider (HYG-144, ADR-1636).
//
// WHY. Supabase's daily backup restores the storage.objects rows and not the files (OWN-082's
// rehearsal, docs/RUNBOOKS.md §7). The owner ruled "Nightly copy elsewhere" and picked Cloudflare
// R2. This module is the loop; app/api/cron/storage-backup is the schedule.
//
// THE LOOP, in the campaign-runner shape lib/cron/budget.ts describes:
//   1. read the cursor (platform_settings.storage_backup_cursor: the last object that landed);
//   2. list objects in every bucket changed strictly after it, oldest first, at most the item
//      budget (public.backup_storage_objects_since, migration 20270345010400);
//   3. for each: stop on the clock or the byte cap, else stream it from Storage to R2 under
//      `<bucket>/<path>`, then move the cursor to it. The cursor is written after EVERY object, so
//      a run killed at the platform ceiling resumes after the last object that landed;
//   4. a failed copy stops the run with the cursor on the last success, so tomorrow retries it.
//
// IDEMPOTENT. A PUT to the same key replaces the object, so copying an object twice (a crash
// between the PUT and the cursor write) costs bandwidth and nothing else. An object overwritten in
// Storage gets a new updated_at, passes the cursor again, and replaces its copy.
//
// NOT MIRRORED: deletes. A file deleted from Storage stays in R2. That is the point of a backup;
// pruning is a lifecycle rule on the R2 bucket if the owner ever wants one.
//
// STREAMED. The body goes from the Storage response to the R2 request without being held in
// memory, so a 500 MB recording costs its transfer time, not 500 MB of function memory.

export const BACKUP_CURSOR_KEY = 'storage_backup_cursor'

/** The last object that landed: its change time (exactly as the database printed it, never
 *  round-tripped through a Date, which would drop the microseconds) and its id. */
export interface BackupCursor {
  at: string
  id: string
}

export interface ChangedObject {
  id: string
  bucket_id: string
  name: string
  changed_at: string
  size: number | null
  mimetype: string | null
}

export interface FetchedObject {
  body: ReadableStream<Uint8Array>
  length: number
  contentType: string | null
}

export interface StorageCopyDeps {
  readCursor(): Promise<BackupCursor | null>
  writeCursor(cursor: BackupCursor): Promise<void>
  listChanged(after: BackupCursor | null, limit: number): Promise<ChangedObject[]>
  /** The object's bytes, or null when it no longer exists (deleted after it was listed). */
  fetchObject(object: ChangedObject): Promise<FetchedObject | null>
  putObject(key: string, object: FetchedObject): Promise<void>
  /** True once the run's clock is spent (the cron budget's `exhausted`). */
  exhausted(): boolean
}

export interface StorageCopyLimits {
  /** Objects listed per run (the cron budget's items). */
  maxItems: number
  /** Bytes copied per run. The first object is always taken, whatever its size, so one object
   *  larger than the cap still moves the cursor instead of blocking every run after it. */
  maxBytes: number
}

export type StorageCopyStop = 'caught_up' | 'items' | 'bytes' | 'time' | 'error'

export interface StorageCopyReport {
  listed: number
  copied: number
  /** Listed, then gone from Storage before it could be read. Passed over; nothing to keep. */
  gone: number
  bytes: number
  stopped: StorageCopyStop
  /** Whether the next run has work waiting. */
  more: boolean
  cursor_before: BackupCursor | null
  cursor_after: BackupCursor | null
  error?: string
  /** The object the run failed on, as `<bucket>/<path>`. */
  failed_key?: string
}

/** The object's key in the backup bucket. */
export function backupKey(object: Pick<ChangedObject, 'bucket_id' | 'name'>): string {
  return `${object.bucket_id}/${object.name}`
}

/** The stored cursor, or null for "from the beginning". A value that does not parse is also
 *  null: the worst a lost cursor costs is one full re-copy, which the PUT makes harmless. */
export function parseCursor(raw: string | null | undefined): BackupCursor | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as unknown
    if (v && typeof v === 'object') {
      const { at, id } = v as Record<string, unknown>
      if (typeof at === 'string' && at && typeof id === 'string' && id) return { at, id }
    }
  } catch {
    // fall through
  }
  return null
}

export function serializeCursor(cursor: BackupCursor): string {
  return JSON.stringify({ at: cursor.at, id: cursor.id })
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** One run of the copy. Never throws for a copy failure: it stops and says so in the report. */
export async function runStorageCopy(deps: StorageCopyDeps, limits: StorageCopyLimits): Promise<StorageCopyReport> {
  const before = await deps.readCursor()
  const rows = await deps.listChanged(before, limits.maxItems)

  let cursor = before
  let copied = 0
  let gone = 0
  let bytes = 0
  let stopped: StorageCopyStop | null = null
  let error: string | undefined
  let failedKey: string | undefined

  for (const row of rows) {
    if (deps.exhausted()) {
      stopped = 'time'
      break
    }
    const processed = copied + gone
    if (processed > 0 && bytes + (row.size ?? 0) > limits.maxBytes) {
      stopped = 'bytes'
      break
    }
    const key = backupKey(row)
    try {
      const fetched = await deps.fetchObject(row)
      if (fetched) {
        await deps.putObject(key, fetched)
        copied += 1
        bytes += fetched.length
      } else {
        gone += 1
      }
      const next = { at: row.changed_at, id: row.id }
      await deps.writeCursor(next)
      cursor = next
    } catch (e) {
      stopped = 'error'
      error = message(e)
      failedKey = key
      break
    }
  }

  if (stopped === null) stopped = rows.length >= limits.maxItems ? 'items' : 'caught_up'
  return {
    listed: rows.length,
    copied,
    gone,
    bytes,
    stopped,
    more: stopped !== 'caught_up',
    cursor_before: before,
    cursor_after: cursor,
    ...(error !== undefined ? { error, failed_key: failedKey } : {}),
  }
}

// ── The production wiring: Supabase Storage in, R2 out ──────────────────────────────────────

/** Lifetime of the signed URL one object is read through. Long enough for the largest bucket's
 *  cap (500 MB) on a slow link; the URL never leaves this process. */
const SIGNED_URL_TTL_SECONDS = 900

interface SupabaseR2Options {
  exhausted: () => boolean
  fetchImpl?: typeof fetch
}

/**
 * The deps for a real run. `admin` is the service-role client: the cursor lives in
 * platform_settings (no client policies), the listing RPC is granted to service_role only, and
 * private buckets are read through a signed URL only the service role can mint.
 */
export function supabaseToR2Deps(
  admin: SupabaseClient<Database>,
  r2: R2Config,
  opts: SupabaseR2Options,
): StorageCopyDeps {
  const fetchImpl = opts.fetchImpl ?? fetch
  return {
    async readCursor() {
      const { data, error } = await admin
        .from('platform_settings')
        .select('value')
        .eq('key', BACKUP_CURSOR_KEY)
        .maybeSingle()
      if (error) throw new Error(`reading the backup cursor failed: ${error.message}`)
      return parseCursor(data?.value ?? null)
    },

    async writeCursor(cursor) {
      const { error } = await admin
        .from('platform_settings')
        .upsert({ key: BACKUP_CURSOR_KEY, value: serializeCursor(cursor), updated_at: new Date().toISOString() })
      if (error) throw new Error(`writing the backup cursor failed: ${error.message}`)
    },

    async listChanged(after, limit) {
      const { data, error } = await admin.rpc('backup_storage_objects_since', {
        p_after_at: after?.at,
        p_after_id: after?.id,
        p_limit: limit,
      })
      if (error) throw new Error(`listing changed storage objects failed: ${error.message}`)
      return (data ?? []).map((r) => ({
        id: r.id,
        bucket_id: r.bucket_id,
        name: r.name,
        changed_at: r.changed_at,
        size: r.size === null || r.size === undefined ? null : Number(r.size),
        mimetype: r.mimetype ?? null,
      }))
    },

    async fetchObject(object) {
      const { data, error } = await admin.storage
        .from(object.bucket_id)
        .createSignedUrl(object.name, SIGNED_URL_TTL_SECONDS)
      if (error || !data?.signedUrl) {
        if (error && /not.?found/i.test(error.message)) return null
        throw new Error(`signing ${backupKey(object)} failed: ${error?.message ?? 'no url'}`)
      }
      // identity: the bytes as stored. A compressed response would be decoded by fetch while its
      // content-length still counted the compressed bytes, and R2 would get the wrong length.
      const res = await fetchImpl(data.signedUrl, { cache: 'no-store', headers: { 'accept-encoding': 'identity' } })
      if (res.status === 404) {
        await res.body?.cancel().catch(() => {})
        return null
      }
      if (!res.ok || !res.body) {
        await res.body?.cancel().catch(() => {})
        throw new Error(`reading ${backupKey(object)} from Storage failed: HTTP ${res.status}`)
      }
      const contentType = res.headers.get('content-type') ?? object.mimetype
      const encoding = res.headers.get('content-encoding')
      if (encoding && encoding.toLowerCase() !== 'identity') {
        // Served encoded anyway: the decoded length is only known by reading it. Only small text
        // types are ever compressed, so this buffers kilobytes, never a recording.
        const bytes = new Uint8Array(await res.arrayBuffer())
        return {
          body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close() } }),
          length: bytes.byteLength,
          contentType,
        }
      }
      const header = res.headers.get('content-length')
      const length = header !== null && header !== '' ? Number(header) : object.size
      if (length === null || !Number.isFinite(length) || length < 0) {
        await res.body.cancel().catch(() => {})
        throw new Error(`reading ${backupKey(object)} from Storage failed: no content length`)
      }
      return { body: res.body, length, contentType }
    },

    async putObject(key, object) {
      await putR2Object(
        r2,
        { key, body: object.body, contentLength: object.length, contentType: object.contentType },
        fetchImpl,
      )
    },

    exhausted: opts.exhausted,
  }
}
