// ─────────────────────────────────────────────────────────────────────────────
// THE STAGED SPARK DRAFT (docs/adr-drafts/1001-draft-sync.md, ADR-991 phase 2).
//
// The server half of Spark autosave. The local half
// (components/studio/spark/draft/draft-store.ts) is the fast one and stays the fast one; this is
// the one that makes a draft follow the AUTHOR instead of being stranded in one browser.
//
// SERVER-ONLY. It holds the admin (service-role) client. The one table it touches,
// `studio_draft`, is RLS-on-no-policy: this file IS its access path.
//
// OWNER SCOPING IS THE WHOLE ACCESS CONTROL, exactly as in lib/privacy/export.ts. The admin
// client bypasses RLS, so the `profile_id` filter in every query here is the gate. That id always
// arrives from the SESSION (lib/studio/draft-actions.ts resolves it via getMyProfileId) and never
// from the client. A caller can only ever read back what that same person wrote.
//
// FAIL-SOFT on purpose. Every call is wrapped and every failure is silent. If the table is not
// there yet (the migration ships unapplied, by design), if the network drops, or if a write loses
// a race, the Spark keeps working on the local copy alone. Storage must never be the thing that
// blocks typing.
//
// SEVEN DAYS, enforced twice: the retention cron sweeps rows past the window
// (lib/consent/retention.ts) and every read filters on the window too, so a late sweep can never
// cause a month-old draft to be offered.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  DRAFT_TTL_MS,
  DRAFT_VERSION,
  capValues,
  refuseNamedSecrets,
} from '@/components/studio/spark/draft/draft-store'

/** Untyped admin handle — `studio_draft` is newer than the generated types (ADR-246). */
function db(): SupabaseClient {
  return createAdminClient()
}

/** A scope is a route-derived key (`journeys-new.new-journey`). Anything longer is not one. */
const MAX_SCOPE_CHARS = 200

/** The most drafts one author may hold at once. A Spark per surface, not a filing cabinet. */
const MAX_DRAFTS_PER_AUTHOR = 40

export interface StagedDraft {
  scope: string
  step: number
  values: Record<string, string>
  /** Epoch ms of the row's `updated_at`, so the caller compares like with like. */
  savedAt: number
  /** Where to send the author back to. Null on a row written before the shell knew to say. */
  route: string | null
  /** What to call it in a list ("New Journey"). The Spark's eyebrow, nothing derived. */
  label: string | null
}

/** A route is a same-origin path. Anything else is not one, and must never become an href. */
const MAX_ROUTE_CHARS = 300
const MAX_LABEL_CHARS = 80

/**
 * Keep a route only if it is a plain in-app path. `//evil.example` is a protocol-relative URL that
 * a browser treats as another origin, so it is refused along with anything that is not rooted.
 */
function safeRoute(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const route = raw.trim()
  if (!route.startsWith('/') || route.startsWith('//')) return null
  if (route.length > MAX_ROUTE_CHARS) return null
  return route
}

function safeLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const label = raw.trim().slice(0, MAX_LABEL_CHARS)
  return label || null
}

const cutoff = (now: number): string => new Date(now - DRAFT_TTL_MS).toISOString()

interface StagedRow {
  scope: string
  step: number | null
  answers: unknown
  version: number | null
  route: unknown
  label: unknown
  updated_at: string
}

/** Only strings survive: the column is jsonb and nothing stops a bad caller putting a number in. */
function readValues(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

/**
 * Everything a payload has to survive before it is allowed near the database, in one place:
 * the key-level refusal list (a named secret never reaches a row), then the same size caps the
 * local copy uses. Returns the answers to store, which may be empty.
 */
function clean(values: Record<string, string>): Record<string, string> {
  return capValues(refuseNamedSecrets(values))
}

/**
 * This author's staged draft for this Spark, or null when there is none, it is older than the
 * window, it was written at a version this build does not read, or anything at all went wrong.
 */
export async function loadStagedDraft(
  profileId: string,
  scope: string,
  now: number = Date.now(),
): Promise<StagedDraft | null> {
  if (!profileId || !scope || scope.length > MAX_SCOPE_CHARS) return null
  try {
    const { data } = await db()
      .from('studio_draft')
      .select('scope, step, answers, version, route, label, updated_at')
      .eq('profile_id', profileId)
      .eq('scope', scope)
      .gte('updated_at', cutoff(now))
      .maybeSingle()
    if (!data) return null
    const row = data as StagedRow
    if ((row.version ?? 0) !== DRAFT_VERSION) return null
    const savedAt = Date.parse(row.updated_at)
    if (Number.isNaN(savedAt)) return null
    const values = readValues(row.answers)
    if (Object.keys(values).length === 0) return null
    return {
      scope: row.scope,
      step: row.step ?? 1,
      values,
      savedAt,
      route: safeRoute(row.route),
      label: safeLabel(row.label),
    }
  } catch {
    return null
  }
}

/**
 * Stage what this author has typed into this Spark. An empty payload DISCARDS the row rather than
 * writing emptiness, so someone who clears every field is not offered their own blank later.
 *
 * Returns true when the row is now what the caller asked for. False means the sync layer should
 * fall back to local-only, which is its normal degraded state and not an error the author sees.
 */
export async function saveStagedDraft(
  profileId: string,
  scope: string,
  input: { step: number; values: Record<string, string>; route?: string | null; label?: string | null },
  now: number = Date.now(),
): Promise<boolean> {
  if (!profileId || !scope || scope.length > MAX_SCOPE_CHARS) return false
  const values = clean(input.values)
  if (Object.keys(values).length === 0) {
    await discardStagedDraft(profileId, scope)
    return true
  }
  try {
    await db()
      .from('studio_draft')
      .upsert(
        {
          profile_id: profileId,
          scope,
          version: DRAFT_VERSION,
          step: Number.isFinite(input.step) ? Math.max(1, Math.trunc(input.step)) : 1,
          answers: values,
          route: safeRoute(input.route),
          label: safeLabel(input.label),
          updated_at: new Date(now).toISOString(),
        },
        { onConflict: 'profile_id,scope' },
      )
    // Keep one author's staging area bounded. Only ever prunes their OWN oldest rows, and only
    // after a successful write, so a failure here cannot cost anyone a draft they still want.
    await trimToCap(profileId)
    return true
  } catch {
    return false
  }
}

/** Throw away one staged draft. Called on commit, on "start fresh", and on an empty payload. */
export async function discardStagedDraft(profileId: string, scope: string): Promise<void> {
  if (!profileId || !scope) return
  try {
    await db().from('studio_draft').delete().eq('profile_id', profileId).eq('scope', scope)
  } catch {
    /* the local copy is already gone; nothing here is worth failing a commit over */
  }
}

// ── The member's own view of what is staged ──────────────────────────────────────────────────
//
// `ai_member_context` set the posture (docs/AI-VERA.md section 5): what we hold about a member is
// readable by them and erasable by them in one click. Unfinished writing earns the same treatment,
// so these two exist and are wired to Settings and to the data export.

/** Every staged draft this author holds, newest first. Owner-scoped; there is nothing else to read. */
export async function listStagedDrafts(
  profileId: string,
  now: number = Date.now(),
): Promise<StagedDraft[]> {
  if (!profileId) return []
  try {
    const { data } = await db()
      .from('studio_draft')
      .select('scope, step, answers, version, route, label, updated_at')
      .eq('profile_id', profileId)
      .gte('updated_at', cutoff(now))
      .order('updated_at', { ascending: false })
      .limit(MAX_DRAFTS_PER_AUTHOR)
    const rows = (data ?? []) as StagedRow[]
    return rows.flatMap((row) => {
      const savedAt = Date.parse(row.updated_at)
      if (Number.isNaN(savedAt) || (row.version ?? 0) !== DRAFT_VERSION) return []
      const values = readValues(row.answers)
      if (Object.keys(values).length === 0) return []
      return [
        {
          scope: row.scope,
          step: row.step ?? 1,
          values,
          savedAt,
          route: safeRoute(row.route),
          label: safeLabel(row.label),
        },
      ]
    })
  } catch {
    return []
  }
}

/** Erase every staged draft this author holds. Returns how many rows went. */
export async function eraseStagedDrafts(profileId: string): Promise<number> {
  if (!profileId) return 0
  try {
    const { data } = await db()
      .from('studio_draft')
      .delete()
      .eq('profile_id', profileId)
      .select('scope')
    return (data ?? []).length
  } catch {
    return 0
  }
}

// ── Retention ────────────────────────────────────────────────────────────────────────────────

/**
 * Delete every staged draft past the seven-day window, whoever owns it. Driven by the nightly
 * retention cron (lib/consent/retention.ts) so abandoned drafts do not accumulate. Reads filter on
 * the same window regardless, so a missed night changes nothing an author can see.
 */
export async function purgeExpiredStudioDrafts(now: number = Date.now()): Promise<number> {
  try {
    const { data } = await db()
      .from('studio_draft')
      .delete()
      .lt('updated_at', cutoff(now))
      .select('scope')
    return (data ?? []).length
  } catch {
    return 0
  }
}

/** Drop this author's oldest rows once they hold more than the cap. Best effort, never throws. */
async function trimToCap(profileId: string): Promise<void> {
  try {
    const { data } = await db()
      .from('studio_draft')
      .select('scope, updated_at')
      .eq('profile_id', profileId)
      .order('updated_at', { ascending: false })
    const rows = (data ?? []) as { scope: string }[]
    if (rows.length <= MAX_DRAFTS_PER_AUTHOR) return
    const doomed = rows.slice(MAX_DRAFTS_PER_AUTHOR).map((r) => r.scope)
    await db().from('studio_draft').delete().eq('profile_id', profileId).in('scope', doomed)
  } catch {
    /* over the cap by a few rows is harmless; the sweep gets them within the week */
  }
}
