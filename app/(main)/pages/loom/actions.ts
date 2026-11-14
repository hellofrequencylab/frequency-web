'use server'

import { revalidatePath } from 'next/cache'
import { getJanitor } from '@/lib/page-editor/guard'
import { resolveSpaceId } from '@/lib/page-editor/data'
import { loomFunctionsEnabled } from '@/lib/loom/functions/run'
import { saveLoomFunction } from '@/lib/loom/store'

// The Loom composer's one write (PROG-E9 part 3). Staff only, dark behind EDITOR_CANVAS. The declaration goes
// to the store as data; the store validates it (validateLoomFunction) and writes nothing unless it holds.

export type ComposerState = { ok: boolean; message: string; problems: string[] }

const SPACE = /^[0-9a-f-]{8,64}$/i

export async function saveLoomFunctionAction(_prev: ComposerState, form: FormData): Promise<ComposerState> {
  if (!loomFunctionsEnabled()) return { ok: false, message: 'Loom functions are switched off.', problems: [] }
  const janitor = await getJanitor()
  if (!janitor) return { ok: false, message: 'Only staff can save a Loom function.', problems: [] }

  const rawSpace = form.get('space')
  const spaceId = await resolveSpaceId(typeof rawSpace === 'string' && SPACE.test(rawSpace) ? rawSpace.toLowerCase() : null)
  if (!spaceId) return { ok: false, message: 'No Space to save into.', problems: [] }

  const surface = String(form.get('surface') ?? '').trim()
  let declaration: unknown
  try {
    declaration = JSON.parse(String(form.get('declaration') ?? ''))
  } catch {
    return { ok: false, message: 'The declaration is not valid JSON.', problems: [] }
  }

  const saved = await saveLoomFunction({ spaceId, surface, declaration, profileId: janitor.profileId })
  if (!saved.ok) return { ok: false, message: 'Not saved. Fix these and try again.', problems: saved.problems }
  revalidatePath('/pages/loom')
  return { ok: true, message: `Saved, version ${saved.version}.`, problems: [] }
}
