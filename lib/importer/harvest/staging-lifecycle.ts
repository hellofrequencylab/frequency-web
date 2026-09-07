// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER: the STAGING LIFECYCLE for `site-media/importer/<intakeId>/`
// (LIVE-120, ADR-1251 in docs/DECISIONS.md).
//
// The harvest stage (./media.ts) copies a business's logo, hero and a small gallery into the
// public `site-media` bucket under the intake's own prefix. Until this module existed nothing
// ever removed them: an intake nobody approved kept its harvested media in the bucket forever,
// and an applied intake kept every capture its draft had stopped pointing at. The 2026-08-25
// census (ADR-1130) counted eight such objects with no catalog row and no owner.
//
// THE POLICY, in three verdicts, decided by ONE pure planner so a test can hold it without a
// bucket:
//   • materialized: the intake was applied. The seeded Space stores the draft's logo / hero /
//     gallery URLs AS-IS (lib/importer/map.ts mapIdentity, materialize.ts), so every staging
//     object the draft still references is LIVE and stays; the rest of the prefix goes.
//   • abandoned: the intake row is gone, or it never reached `applied` and has not been touched
//     for STAGING_ABANDON_DAYS. The whole prefix goes.
//   • live: a draft still in flight. Nothing is touched.
//
// TENANCY + SAFETY. Every path this module removes is proven to sit under `importer/<intakeId>/`
// for a well-formed intake id before it reaches the storage client; a malformed id plans nothing.
// Staging files are NEVER catalogued into the Loom: they are drafts nobody accepted, and the
// backlog row forbids presenting harvested third-party imagery as house assets.
//
// FAIL-SAFE + LOUD. A storage error is logged (AGENTS.md: a swallowed error is an invisible
// regression) and reported in the result; it never fails an apply or a cron run. SERVER-ONLY.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import { log, briefError } from '@/lib/log'
import { getIntake } from '../store'
import type { IntakeStatus } from '../intake'

/** The bucket the harvest uploads into (./media.ts BUCKET). */
export const STAGING_BUCKET = 'site-media'
/** The root folder every intake's staging prefix sits under. */
export const STAGING_ROOT = 'importer'
/** An intake that never reached `applied` and has not been touched for this long is abandoned. */
export const STAGING_ABANDON_DAYS = 30
/** Per-invocation caps for the nightly age-out (LIVE-190 spirit: bounded work per run). */
export const STAGING_SWEEP_MAX_FOLDERS = 50
export const STAGING_SWEEP_MAX_OBJECTS = 200
/** One list call reads at most this many objects of a prefix; a harvest writes far fewer. */
const LIST_PAGE = 1000

/** An intake id is a UUID (business_intake.id, migration 20261022000000); anything else is refused
 *  so a path can never escape the prefix, and a stray folder under importer/ is never a target. */
const SAFE_INTAKE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The storage prefix an intake's harvested media lives under, or null for an unsafe id. PURE. */
export function stagingPrefix(intakeId: string): string | null {
  if (!SAFE_INTAKE_ID.test(intakeId)) return null
  return `${STAGING_ROOT}/${intakeId}/`
}

/** One object under a staging prefix: its full bucket path plus when it was written. */
export interface StagingObject {
  path: string
  createdAt: string | null
}

export type StagingMode = 'materialized' | 'abandoned'
export type StagingVerdict = StagingMode | 'live'

/**
 * Walk any JSON-shaped value (a draft, an inputs bag, a raw-sources cache) and collect every
 * bucket path under this intake's staging prefix that it references by public URL. PURE + total:
 * a string is a reference when it carries `/site-media/importer/<intakeId>/`; the query string
 * and fragment are dropped so a cache-busted URL still names its object.
 */
export function collectStagingRefs(intakeId: string, value: unknown): Set<string> {
  const refs = new Set<string>()
  const prefix = stagingPrefix(intakeId)
  if (!prefix) return refs
  const marker = `/${STAGING_BUCKET}/${prefix}`
  const seen = new Set<object>()
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      const at = v.indexOf(marker)
      if (at < 0) return
      const rest = v.slice(at + `/${STAGING_BUCKET}/`.length).split(/[?#]/)[0]
      if (rest.length > prefix.length) refs.add(rest)
      return
    }
    if (!v || typeof v !== 'object') return
    if (seen.has(v)) return
    seen.add(v)
    for (const item of Array.isArray(v) ? v : Object.values(v)) walk(item)
  }
  walk(value)
  return refs
}

/**
 * Decide what one intake's staging prefix deserves, from the row as the store reads it (or null
 * when the row no longer exists). PURE. `now` is the clock the age test runs against.
 */
export function judgeIntakeStaging(
  row: { status: IntakeStatus; updatedAt: string } | null,
  now: Date,
): StagingVerdict {
  if (!row) return 'abandoned'
  if (row.status === 'applied') return 'materialized'
  const touched = Date.parse(row.updatedAt)
  if (Number.isNaN(touched)) return 'live' // an unreadable clock is not evidence of abandonment
  const ageMs = now.getTime() - touched
  return ageMs >= STAGING_ABANDON_DAYS * 24 * 60 * 60 * 1000 ? 'abandoned' : 'live'
}

/**
 * THE PLANNER. Given the objects that sit under an intake's prefix and the paths the intake still
 * references, return the paths to remove, in listing order. PURE.
 *   • `materialized` keeps every referenced path and removes the rest.
 *   • `abandoned` removes everything.
 * Every returned path is under `importer/<intakeId>/`; an object listed outside it (which the
 * storage client should never hand back) is dropped rather than removed, and a malformed intake
 * id plans nothing at all.
 */
export function planStagingSweep(input: {
  intakeId: string
  objects: readonly StagingObject[]
  keep: Iterable<string>
  mode: StagingMode
}): string[] {
  const prefix = stagingPrefix(input.intakeId)
  if (!prefix) return []
  const keep = new Set(input.keep)
  const out: string[] = []
  for (const o of input.objects) {
    if (!o.path.startsWith(prefix) || o.path.length === prefix.length) continue
    if (o.path.includes('..')) continue
    if (input.mode === 'materialized' && keep.has(o.path)) continue
    out.push(o.path)
  }
  return out
}

// ── IO: the storage client seam ─────────────────────────────────────────────────────

/** The two storage calls this module makes, shaped so a test can hand in a fake. */
export interface StagingStorage {
  list: (
    prefix: string,
    options?: { limit?: number; offset?: number },
  ) => Promise<{
    data: { name: string; id: string | null; created_at: string | null }[] | null
    error: { message: string } | null
  }>
  remove: (paths: string[]) => Promise<{ error: { message: string } | null }>
}

/** A reader for the intake row's lifecycle facts (the store's getIntake by default). */
export type StagingIntakeReader = (
  intakeId: string,
) => Promise<{ status: IntakeStatus; updatedAt: string; draft: unknown; inputs: unknown } | null>

function defaultStorage(): StagingStorage {
  return createAdminClient().storage.from(STAGING_BUCKET) as unknown as StagingStorage
}

/** Every object directly under the intake's prefix (the harvest writes flat files, no subfolders). */
async function listStagingObjects(storage: StagingStorage, prefix: string): Promise<StagingObject[]> {
  const folder = prefix.slice(0, -1)
  const { data, error } = await storage.list(folder, { limit: LIST_PAGE })
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter((f) => f.id !== null) // a folder entry has no id; only files are objects
    .map((f) => ({ path: `${prefix}${f.name}`, createdAt: f.created_at }))
}

export interface StagingSweepResult {
  removed: number
  kept: number
  /** Set when the storage client refused; the sweep is best-effort and the caller carries on. */
  error?: string
}

/**
 * Sweep ONE intake's staging prefix under the given mode. `keepFrom` is the JSON the intake still
 * publishes from (its draft, and its inputs); under `materialized` every staging URL found in it
 * stays. Best-effort: a storage failure is logged and returned, never thrown. `cap` bounds how
 * many objects one call removes (the nightly age-out passes its remaining budget).
 */
export async function sweepIntakeStaging(
  intakeId: string,
  opts: { mode: StagingMode; keepFrom?: unknown; cap?: number; storage?: StagingStorage },
): Promise<StagingSweepResult> {
  const prefix = stagingPrefix(intakeId)
  if (!prefix) return { removed: 0, kept: 0, error: 'unsafe intake id' }
  const storage = opts.storage ?? defaultStorage()
  try {
    const objects = await listStagingObjects(storage, prefix)
    const keep = opts.mode === 'materialized' ? collectStagingRefs(intakeId, opts.keepFrom) : []
    const planned = planStagingSweep({ intakeId, objects, keep, mode: opts.mode })
    const cap = Math.max(0, opts.cap ?? Number.POSITIVE_INFINITY)
    const toRemove = planned.slice(0, cap)
    if (toRemove.length > 0) {
      const { error } = await storage.remove(toRemove)
      if (error) throw new Error(error.message)
    }
    const result = { removed: toRemove.length, kept: objects.length - toRemove.length }
    log.info('importer.staging.swept', { intakeId, mode: opts.mode, ...result })
    return result
  } catch (e) {
    const error = briefError(e)
    log.error('importer.staging.sweep_failed', { intakeId, mode: opts.mode, error })
    return { removed: 0, kept: 0, error }
  }
}

export interface StagingAgeOutResult {
  foldersSeen: number
  removed: number
  kept: number
  errors: number
}

/**
 * The nightly AGE-OUT (runs inside the existing enforce-retention cron; no new route). Lists the
 * intake folders under `importer/`, judges each against its row, and sweeps the abandoned and
 * materialized ones. BOUNDED per invocation: at most `maxFolders` folders are examined and at
 * most `maxObjects` objects removed; a folder swept empty stops being listed, so what one night
 * cannot reach the next night does. Never throws.
 */
export async function sweepStaleImporterStaging(
  opts: {
    now?: Date
    maxFolders?: number
    maxObjects?: number
    storage?: StagingStorage
    readIntake?: StagingIntakeReader
  } = {},
): Promise<StagingAgeOutResult> {
  const now = opts.now ?? new Date()
  const maxFolders = opts.maxFolders ?? STAGING_SWEEP_MAX_FOLDERS
  let budget = opts.maxObjects ?? STAGING_SWEEP_MAX_OBJECTS
  const readIntake = opts.readIntake ?? getIntake
  const result: StagingAgeOutResult = { foldersSeen: 0, removed: 0, kept: 0, errors: 0 }
  let storage: StagingStorage
  try {
    storage = opts.storage ?? defaultStorage()
  } catch (e) {
    log.error('importer.staging.age_out_failed', { error: briefError(e) })
    return { ...result, errors: 1 }
  }

  const { data, error } = await storage.list(STAGING_ROOT, { limit: maxFolders })
  if (error) {
    log.error('importer.staging.age_out_failed', { error: error.message })
    return { ...result, errors: 1 }
  }
  const folders = (data ?? []).filter((f) => f.id === null && stagingPrefix(f.name)).map((f) => f.name)

  for (const intakeId of folders) {
    if (budget <= 0) break
    result.foldersSeen += 1
    let row: Awaited<ReturnType<StagingIntakeReader>>
    try {
      row = await readIntake(intakeId)
    } catch (e) {
      result.errors += 1
      log.error('importer.staging.age_out_read_failed', { intakeId, error: briefError(e) })
      continue
    }
    const verdict = judgeIntakeStaging(row, now)
    if (verdict === 'live') continue
    const swept = await sweepIntakeStaging(intakeId, {
      mode: verdict,
      keepFrom: row ? { draft: row.draft, inputs: row.inputs } : undefined,
      cap: budget,
      storage,
    })
    if (swept.error) result.errors += 1
    result.removed += swept.removed
    result.kept += swept.kept
    budget -= swept.removed
  }
  log.info('importer.staging.age_out', { ...result, maxFolders, maxObjects: opts.maxObjects ?? STAGING_SWEEP_MAX_OBJECTS })
  return result
}
