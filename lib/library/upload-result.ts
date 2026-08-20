// What a SERVER upload action hands back, and how an image control turns that into the value its
// column stores. Pure (no React, no Supabase) so the seam is unit-testable on its own.
//
// The seam exists because the two image controls store two different things:
//   • mode 'url'  — the column holds a full public URL (journey cover_image, space brand_logo_url).
//   • mode 'path' — the column holds a storage PATH resolved with getPublicUrl at render
//                   (events.cover_image_path).
// Before LIVE-072 the uploadFn branch in components/ui/image-upload.tsx assumed URL mode and did
// `onChange(`${res.url}?t=…`)` unconditionally, so routing a path-mode control through a server
// action would have written the string "undefined?t=1787…" into cover_image_path. Every mode-aware
// decision lives here instead, so adding a server upload to a path-mode control cannot silently
// corrupt its value.

/** A server upload action's result. An action may return either shape, or both. */
export type ServerUploadResult =
  | { url: string; path?: string }
  | { path: string; url?: string }
  | { error: string }

/**
 * The value a control's `onChange` must receive for `mode`, or a member-readable error when the
 * action returned a shape this mode cannot store.
 *
 * URL mode cache-busts with `?t=${now}` so replacing an image shows the new one immediately. PATH
 * mode never does: the value is a storage key, and a query string on it would break getPublicUrl.
 */
export function valueFromServerUpload(
  mode: 'url' | 'path',
  res: ServerUploadResult,
  now: number,
): { value: string } | { error: string } {
  if ('error' in res) return { error: res.error }

  if (mode === 'path') {
    const path = 'path' in res ? res.path : undefined
    if (!path) return { error: 'That upload did not come back with a storage path.' }
    return { value: path }
  }

  const url = 'url' in res ? res.url : undefined
  if (!url) return { error: 'That upload did not come back with an image address.' }
  return { value: `${url}?t=${now}` }
}
