// A SCREENSHOT FOR VERA (LIVE-2162, owner ask 2026-11-04 05:40Z "upload screenshots by dropping them in Vera"). The
// owner drops, pastes or picks a picture in Vera's tab; the browser shrinks it to a JPEG that fits well under the
// server's cap and sends it once, with the ask. It is never stored: it rides one request and is gone.
//
// Browser only (canvas). The picture is the owner's own; the model is told text inside it is data.

import { MAX_VERA_SCREENSHOT } from './vera-guide'

const LONGEST = 1600

/** Shrink an image file to a JPEG data URL under the cap, or say plainly why it cannot be used. */
export async function veraScreenshotFrom(file: File): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return { ok: false, error: 'Vera can look at a PNG, JPEG or WebP picture.' }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, LONGEST / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      if (dataUrl.length <= MAX_VERA_SCREENSHOT) return { ok: true, dataUrl }
    }
    return { ok: false, error: 'That picture is too big for Vera. Try a smaller screenshot.' }
  } catch {
    return { ok: false, error: 'Vera could not open that picture. Try another screenshot.' }
  }
}

/** The first image in a drop or a paste, if there is one. */
export function veraImageFrom(items: DataTransfer | null): File | null {
  if (!items) return null
  for (const file of Array.from(items.files ?? [])) if (file.type.startsWith('image/')) return file
  return null
}
