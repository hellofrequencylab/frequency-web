/**
 * Guard for rendering a LOCAL file preview.
 *
 * The image composer creates a transient `blob:` object URL from the file the
 * user just picked (`URL.createObjectURL(file)`) and shows it in an `<img>`
 * before upload. This helper only ever returns such a `blob:` URL and drops
 * anything else, so a value that flowed from a DOM source can never reach the
 * `src` sink as another scheme — closing the CodeQL `js/xss-through-dom`
 * data flow (scheme allow-list is the recommended remediation).
 */
export function blobPreviewSrc(url: string | null | undefined): string | undefined {
  return typeof url === 'string' && url.startsWith('blob:') ? url : undefined
}
