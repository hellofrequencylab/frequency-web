import type { ReactNode } from 'react'
import type { Config } from '@/lib/page-editor/types'
import { SITE_DESIGN } from '@/lib/theme/design'
import { SiteBlocks } from '@/components/page-editor/site-blocks'

// The ONE root render both block configs share (lib/page-editor/config.tsx, the whole library the editor
// and Space pages use, and lib/page-editor/platform-config.tsx, the platform marketing pages' subset).
// Moved out of config.tsx unchanged (PERF-031) so the platform subset does not import config.tsx.

// ROOT render: on a SPACE page (identified by the injected `metadata.space`) the profile blocks are
// a FLAT top-level list (no SpaceLayout wrapper — so each block is individually editable), so the
// root supplies the vertical rhythm between them here. Every OTHER surface (marketing, splash, member
// Spotlight) passes children straight through untouched, so their self-spacing sections are unchanged.
export const rootConfig: NonNullable<Config['root']> = {
  render: ({ children, puck }: { children: ReactNode; puck?: { metadata?: Record<string, unknown> } }) => {
    const space = puck?.metadata?.space as { layoutPreset?: string } | undefined
    // Under the Frequency design a non-Space document carries the website scope (SiteBlocks), which
    // dresses the blocks in the site kit's idiom inside the public site shell only. SITE_DESIGN is a
    // build-time constant, so DAWN never takes this branch and its markup is unchanged.
    if (!space) return SITE_DESIGN === 'frequency' ? <SiteBlocks>{children}</SiteBlocks> : <>{children}</>
    // The DISPLAY rhythm per layout preset: `sections` is airier (a landing-page feel); `stack` and
    // `main-rail` share the standard rhythm (main-rail wraps into one SpaceLayout child that owns its
    // own grid, so the space-y just seats it). Content is identical; only the rhythm differs.
    const airy = space.layoutPreset === 'sections'
    const cls = airy ? 'space-y-16 py-10 sm:space-y-20 sm:py-14' : 'space-y-12 py-8 sm:space-y-14 sm:py-10'
    return <div className={cls}>{children}</div>
  },
}
