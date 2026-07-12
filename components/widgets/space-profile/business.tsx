import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceBusinessBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// BUSINESS PRESENCE — the space's social / business links only, as a LinkedIn/Yelp-style strip. The
// operator-entered RATING moved to its own Reviews block (ADR-529 item 3), so "Find us online" is now
// links-only. Reads the central profile data off the data bag; FAIL-SAFE: with no links, renders nothing.
export function BusinessBlock({
  data,
  header,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
}) {
  const p = data.profile
  const links = p?.socials ?? []
  if (links.length === 0) return null
  return (
    <ModuleSection anchor="business">
      <SpaceBusinessBlock eyebrow={header?.eyebrow ?? 'Online'} heading={header?.heading ?? 'Find us online'} links={links} />
    </ModuleSection>
  )
}
