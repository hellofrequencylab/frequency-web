// Does the scanner need its own document before it can ask for the camera? (LIVE-713, ADR-1641)
//
// next.config.ts serves `camera=(self)` on /scan and `camera=()` everywhere else. A
// Permissions-Policy is fixed when a DOCUMENT loads, though, and a <Link> into /scan is a soft
// navigation: the scanner then runs inside the document the member started on (/partners, the
// feed), still under `camera=()`, and getUserMedia is refused exactly as it was before the fix.
// The refusal is a NotAllowedError, the same one a member's own "Block" gives, so the scanner
// cannot tell them apart after the fact. It has to ask the policy first.
//
// Chromium exposes the policy (`document.permissionsPolicy`, or the older
// `document.featurePolicy`). Firefox and Safari expose neither and do not enforce the header's
// camera directive either, so "unknown" there means "go ahead".

/** The slice of the Permissions Policy JS API this reads. */
interface PolicyApi {
  allowsFeature: (feature: string) => boolean
}

/** The slice of `document` this reads. */
export interface PolicyDocument {
  permissionsPolicy?: PolicyApi
  featurePolicy?: PolicyApi
}

/** `true` when this document's policy refuses the camera, `false` when it allows it, `null` when
 *  the browser does not say (it then does not enforce the header either). */
export function documentRefusesCamera(doc: PolicyDocument): boolean | null {
  const api = doc.permissionsPolicy ?? doc.featurePolicy
  if (!api || typeof api.allowsFeature !== 'function') return null
  try {
    return !api.allowsFeature('camera')
  } catch {
    return null
  }
}

/**
 * Should the scanner re-load the current URL as its own document before asking for the camera?
 *
 * Only when the policy refuses the camera AND this document was NOT loaded at this path. The
 * second half is the loop guard: a document that was already served for /scan and still refuses
 * the camera would refuse it again after a reload (a header regression, an extension), so the
 * scanner falls through to getUserMedia and its denied card instead of reloading forever.
 *
 * @param loadedUrl the URL the document was loaded from (the navigation timing entry's `name`),
 *   or undefined when the browser does not report it.
 */
export function shouldReloadForCamera(
  refuses: boolean | null,
  loadedUrl: string | undefined,
  currentPathname: string,
): boolean {
  if (refuses !== true) return false
  if (!loadedUrl) return false
  let loadedPath: string
  try {
    loadedPath = new URL(loadedUrl).pathname
  } catch {
    return false
  }
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p).toLowerCase()
  return norm(loadedPath) !== norm(currentPathname)
}
