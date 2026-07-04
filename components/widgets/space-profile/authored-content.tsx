import { BlockRender } from '@/lib/page-editor/block-render'
import { config } from '@/lib/page-editor/config'
import type { Data } from '@/lib/page-editor/types'
import type {
  AuthoredContentBlock,
  SpaceAuthoredContent,
  SpaceContentBlockId,
} from '@/lib/spaces/authored-content'
import { ModuleSection } from './section'

// AUTHORED SPACE CONTENT renderers (ADR-508 U3) — the space mirror of the member AuthoredBlockGroup
// (components/widgets/member-profile/authored-group.tsx). The unified grid keys content by TYPE, so an
// operator's many authored instances of one type render together here, each through the EXISTING in-house
// Puck <BlockRender> on a single-type doc — the SAME renderer the public Space page uses — so no block UI
// is re-implemented. FAIL-SAFE: an empty slice renders nothing (no section, no gap); malformed blocks are
// dropped upstream by the pure adapter.

/** Render one content id's authored blocks. Passes just this type's blocks as a mini Puck doc: with no
 *  `space` metadata the shared config root adds no wrapper, so BlockRender emits them as plain siblings;
 *  ModuleSection supplies the deep-link anchor + the honest-empty (`empty:hidden`) collapse. */
export function SpaceAuthoredGroup({
  blocks,
  anchor,
}: {
  blocks: AuthoredContentBlock[]
  anchor: string
}) {
  if (!blocks || blocks.length === 0) return null
  const data = { root: {}, content: blocks } as Data
  return (
    <ModuleSection anchor={anchor}>
      <div className="space-y-4">
        <BlockRender config={config} data={data} />
      </div>
    </ModuleSection>
  )
}

/** The content-id -> renderer map (parity with the member content blocks). Each pulls ONLY its slice from
 *  the authored bag and fail-safes to null when empty. Wired into SPACE_PROFILE render alongside the
 *  live-data section blocks. */
export type SpaceContentBlockComponent = (props: { content: SpaceAuthoredContent }) => React.ReactNode

export const SPACE_CONTENT_BLOCKS: Record<SpaceContentBlockId, SpaceContentBlockComponent> = {
  heading: ({ content }) => <SpaceAuthoredGroup blocks={content.heading} anchor="heading" />,
  text: ({ content }) => <SpaceAuthoredGroup blocks={content.text} anchor="text" />,
  image: ({ content }) => <SpaceAuthoredGroup blocks={content.image} anchor="image" />,
  gallery: ({ content }) => <SpaceAuthoredGroup blocks={content.gallery} anchor="gallery" />,
  quote: ({ content }) => <SpaceAuthoredGroup blocks={content.quote} anchor="quote" />,
  embed: ({ content }) => <SpaceAuthoredGroup blocks={content.embed} anchor="embed" />,
  divider: ({ content }) => <SpaceAuthoredGroup blocks={content.divider} anchor="divider" />,
}
