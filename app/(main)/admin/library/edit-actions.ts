'use server'

// The Loom image editor's save (HYG-109, ADR-1506). One thin door onto the replace-file flow:
// the crop/rotate result is a new master for the SAME asset id, versioned first
// (replaceLibraryAssetFile calls recordVersion before the swap) and uploaded to the same bucket
// and path scheme an ordinary replace uses. Nothing here re-implements the non-destructive half;
// it names the edit in the version note and carries the new pixel size onto the row. Studio-gated
// with the page's own gate (LIVE-289).

import { requireAdmin } from '@/lib/admin/guard'
import { parseInput, z } from '@/lib/validation'
import { replaceLibraryAssetFile } from './replace-actions'

// parse-don't-validate (HYG-101): the id, the frame key, the angle and the pixel size all come from
// the editor; the file itself is checked by replaceLibraryAssetFile (type, size, bucket).
const PIXELS = z.coerce.number().int().positive().max(100000).optional().catch(undefined)
const EDIT = z.object({
  assetId: z.string().uuid(),
  frame: z.string().regex(/^[a-z]+$/).catch('free'),
  degrees: z.coerce.number().int().min(0).max(359).catch(0),
  width: PIXELS,
  height: PIXELS,
})

export async function saveEditedImage(
  assetId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { error: string }> {
  await requireAdmin('janitor', { staff: 'marketing' })
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Nothing to save.' }
  if (!file.type.startsWith('image/')) return { error: 'Only an image can be edited here.' }

  let edit: z.infer<typeof EDIT>
  try {
    edit = parseInput(EDIT, {
      assetId,
      frame: formData.get('frame') ?? 'free',
      degrees: formData.get('degrees') ?? '0',
      width: formData.get('width') ?? undefined,
      height: formData.get('height') ?? undefined,
    })
  } catch {
    return { error: 'That edit could not be read. Try again.' }
  }

  return replaceLibraryAssetFile(edit.assetId, formData, {
    note: `Crop / rotate (native editor: ${edit.frame}, ${edit.degrees}°)`,
    width: edit.width ?? null,
    height: edit.height ?? null,
  })
}
