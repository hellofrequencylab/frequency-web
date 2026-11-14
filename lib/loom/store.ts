import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/database.types'
import { loomContext } from './functions/context'
import { loomFunctionsEnabled } from './functions/run'
import { validateLoomFunction } from './functions/validate'

// THE LOOM FUNCTION STORE (PROG-E9 part 2; docs/EDITOR-GATES.md section 4). The ONE file that touches
// `loom_functions` (check:loom-integrity M4), and every write here calls validateLoomFunction first and persists
// nothing unless it returns ok (M5). There is no other way in: no raw insert, no bypass, no "save anyway".
//
// Dark: with EDITOR_CANVAS off, reads return nothing and writes refuse. Server only (service-role client; the
// table is RLS on with no policy, migration 20270346048000). The caller gates the operator (staff only).
//
// A stored row is NOT trusted on the way out: the read side (./functions/run.ts) re-validates it against
// today's manifest and schemas before it runs, so a later primitive retirement strands it safely.

export interface StoredLoomFunction {
  id: string
  surface: string
  slug: string
  version: number
  declaration: unknown
  updatedAt: string
}

export type LoomSaveResult = { ok: true; id: string; version: number } | { ok: false; problems: string[] }

const SURFACE = /^[a-z][a-z0-9-]{1,39}$/
const OFF = 'Loom functions are switched off.'

/** A Space's stored functions, newest edit first. Empty when the switch is off or the read fails. */
export async function listLoomFunctions(spaceId: string): Promise<StoredLoomFunction[]> {
  if (!loomFunctionsEnabled()) return []
  const { data, error } = await createAdminClient()
    .from('loom_functions')
    .select('id, surface, slug, version, declaration, updated_at')
    .eq('space_id', spaceId)
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error || !data) return []
  return data.map((r) => ({ id: r.id, surface: r.surface, slug: r.slug, version: r.version, declaration: r.declaration, updatedAt: r.updated_at }))
}

/** Validate, then insert or update one function, keyed by (Space, surface, declaration id). Fail-closed: a
 *  declaration the validator rejects is never written, and every problem comes back. An update only lands on
 *  the version it read, so two operators saving at once cannot silently overwrite each other. */
export async function saveLoomFunction(args: {
  spaceId: string
  surface: string
  declaration: unknown
  profileId: string | null
}): Promise<LoomSaveResult> {
  if (!loomFunctionsEnabled()) return { ok: false, problems: [OFF] }
  if (!SURFACE.test(args.surface)) return { ok: false, problems: ['surface: use lowercase letters, numbers and dashes'] }
  const checked = validateLoomFunction(args.declaration, loomContext())
  if (!checked.ok) return { ok: false, problems: checked.problems }
  const fn = checked.fn
  const declaration = fn as unknown as Json

  const db = createAdminClient()
  const { data: existing, error: readError } = await db
    .from('loom_functions')
    .select('id, version')
    .eq('space_id', args.spaceId)
    .eq('surface', args.surface)
    .eq('slug', fn.id)
    .maybeSingle()
  if (readError) return { ok: false, problems: ['The function could not be saved. Try again.'] }

  if (existing) {
    const { data, error } = await db
      .from('loom_functions')
      .update({ declaration, version: existing.version + 1, updated_by: args.profileId, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('version', existing.version)
      .select('id, version')
      .maybeSingle()
    if (error) return { ok: false, problems: ['The function could not be saved. Try again.'] }
    if (!data) return { ok: false, problems: ['Someone saved this function a moment ago. Reload and try again.'] }
    return { ok: true, id: data.id, version: data.version }
  }

  const { data, error } = await db
    .from('loom_functions')
    .insert({ space_id: args.spaceId, surface: args.surface, slug: fn.id, declaration, created_by: args.profileId, updated_by: args.profileId })
    .select('id, version')
    .single()
  if (error?.code === '23505') return { ok: false, problems: ['Someone saved this function a moment ago. Reload and try again.'] }
  if (error || !data) return { ok: false, problems: ['The function could not be saved. Try again.'] }
  return { ok: true, id: data.id, version: data.version }
}
