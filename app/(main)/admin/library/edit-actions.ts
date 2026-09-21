'use server'

// The Loom image editor's save (HYG-109, ADR-1506). One thin door onto the replace-file flow:
// the crop/rotate result is a new master for the SAME asset id, versioned first
// (replaceLibraryAssetFile calls recordVersion before the swap) and uploaded to the same bucket
// and path scheme an ordinary replace uses. Nothing here re-implements the non-destructive half;
// it names the edit in the version note and carries the new pixel size onto the row. Studio-gated
// with the page's own gate (LIVE-289).

import { requireAdmin } from '@/lib/admin/guard'
import { replaceLibraryAssetFile } from './replace-actions'

const FRAME_RE = /^[a-z]+$/
const DEGREES_RE = /^\d{1,3}$/

function num(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string') return null
  const n = Number(v)
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : null
}

export async function saveEditedImage(
  assetId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { error: string }> {
  await requireAdmin('janitor', { staff: 'marketing' })
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Nothing to save.' }
  if (!file.type.startsWith('image/')) return { error: 'Only an image can be edited here.' }

  const frame = String(formData.get('frame') ?? 'free')
  const degrees = String(formData.get('degrees') ?? '0')
  const note = `Crop / rotate (native editor: ${FRAME_RE.test(frame) ? frame : 'free'}, ${DEGREES_RE.test(degrees) ? degrees : '0'}°)`

  return replaceLibraryAssetFile(assetId, formData, {
    note,
    width: num(formData.get('width')),
    height: num(formData.get('height')),
  })
}
