// THE APP HEADER HAS ONE HEIGHT, AND IT IS A TOKEN (LIVE-492).
//
// `--app-header-h` is `calc(3.5rem + env(safe-area-inset-top))` (app/globals.css). Four places had
// re-derived that geometry by hand, and the hand-written copies had drifted in the one way that
// matters: they kept the 3.5rem and DROPPED the inset.
//
// What that cost, and it was never only a screenshot: the shell root is `min-h-dvh`, the header
// occupies `3.5rem + inset`, and the content row asked for `100vh - 3.5rem`. So the shell's minimum
// height was
//
//     (3.5rem + inset) + (100vh - 3.5rem)  =  100vh + inset
//
// -- every page taller than the viewport by the inset, on every device that has one. A phantom
// scrollbar on a page with nothing to scroll. It also mixed UNITS: the root measured in `dvh` and
// the row in `vh`, so while a mobile toolbar animates the two disagree about what a viewport is.
//
// Under a full-page screenshot the same arithmetic is what made /admin/content/practices flip
// height between consecutive frames: the capture expands the viewport to the document height, the
// row re-resolves against it, and `100vh + inset` is a height that cannot sit still. Measuring
// both off ONE token makes header + content exactly 100dvh, so there is nothing left to oscillate.
//
// This module exists so the rule can be RUN rather than remembered: the guard below reads the
// source and fails on a hand-written header offset, which is how the drift got in.

/** The token every header offset must be measured from. */
export const APP_HEADER_H = 'var(--app-header-h)'

/** Files that legitimately DEFINE the header's geometry rather than consume it. */
export const HEADER_GEOMETRY_OWNERS = ['app/globals.css'] as const

/** A hand-written header offset: 3.5rem combined with the top inset, or a viewport-height calc
 *  that subtracts a bare 3.5rem/4.5rem instead of the token. Both are the drift LIVE-492 fixed. */
export const HAND_WRITTEN_HEADER_OFFSET =
  /calc\(\s*3\.5rem\s*\+\s*env\(safe-area-inset-top\)\s*\)|calc\(\s*100v?dvh?\s*-\s*[34]\.5rem\s*\)|calc\(100vh-[34]\.5rem\)|calc\(3\.5rem\+env\(safe-area-inset-top\)\)/

/** True when `source` re-derives the app header's height by hand instead of using the token. */
export function reDerivesHeaderHeight(source: string): boolean {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
  return HAND_WRITTEN_HEADER_OFFSET.test(withoutComments)
}
