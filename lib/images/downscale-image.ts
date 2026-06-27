// Client-only image downscaler for avatars. A raw phone photo is multiple MB; as a
// base64 data URL it routinely blows past localStorage's ~5MB quota, which is exactly
// how the signed-out induction flow silently lost avatars (persistForAuth parks the
// data URL in localStorage across the magic-link hop, see app/onboarding/beta). It is
// also wasteful to upload a 4000px image for a 44px avatar.
//
// This center-crops to a square and re-encodes as a small JPEG, so the result is tens
// of KB: it fits localStorage with room to spare AND uploads fast. Best-effort: on any
// failure (odd format, no canvas, decode error) it returns the ORIGINAL file unchanged,
// so picking a photo never throws.

export async function downscaleImageFile(
  file: File,
  maxSize = 512,
  quality = 0.85,
): Promise<File> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return file
  if (!file.type.startsWith('image/')) return file
  // Animated formats lose their animation when re-encoded; leave them be (they're tiny
  // anyway relative to a camera JPEG, and rarely used as avatars).
  if (file.type === 'image/gif') return file

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    const side = Math.min(bitmap.width, bitmap.height)
    if (side <= 0) return file
    const sx = (bitmap.width - side) / 2
    const sy = (bitmap.height - side) / 2
    const target = Math.min(maxSize, side)

    const canvas = document.createElement('canvas')
    canvas.width = target
    canvas.height = target
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob) return file
    // If somehow the re-encode came out bigger than the original (already-tiny source),
    // keep whichever is smaller.
    if (blob.size >= file.size && file.size > 0) return file
    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  } finally {
    bitmap?.close?.()
  }
}
