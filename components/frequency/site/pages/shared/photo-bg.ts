import type { CSSProperties } from 'react'

// CSS background stills through the optimizer (LIVE-2000). No other imports: the timer-runtime probe
// loads funnel/parts.tsx with an explicit dependency map and loads this module for real.
// A hero `.bg` is a `background-image`, so a srcset cannot reach it and every visitor downloaded the
// 1600px JPEG (285 to 420KB each; /pricing shipped 2MB of them). The optimizer that already serves the
// `<img>` renditions takes a plain GET, so a background can point at one too. The element carries the
// two renditions as custom properties and the kit's `.bg` rules pick one by viewport (the inline style
// cannot read a media query, the stylesheet can). A remote photo (Supabase storage) passes through
// untouched: the optimizer needs its host in next.config's remotePatterns, and the brand photos are
// the ones that weigh anything.
// The site gathering photos in /images/site are local stills too, so they take the same route.
const OPTIMIZED_PREFIXES = ['/brand/', '/images/site/']
export function optimizedPhoto(src: string, w: 256 | 384 | 640 | 1080 | 1920): string {
  if (!OPTIMIZED_PREFIXES.some((p) => src.startsWith(p))) return src
  return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`
}
/** Inline style for a full-bleed `.bg`: the 1920px rendition, and 1080px under 860px wide. */
export function photoBg(src: string): CSSProperties {
  return {
    '--fq-bg': `url('${optimizedPhoto(src, 1920)}')`,
    '--fq-bg-sm': `url('${optimizedPhoto(src, 1080)}')`,
  } as CSSProperties
}
