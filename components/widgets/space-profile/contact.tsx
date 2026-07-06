import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceContactBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// CONTACT AND HOURS — address, hours, phone, email, and website, as an info card. Reads the central
// business facts off the data bag (profileData); FAIL-SAFE: with no facts the reused block renders
// nothing.
export function ContactBlock({
  data,
  header,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
}) {
  const p = data.profile
  if (!p) return null
  return (
    <ModuleSection anchor="contact">
      <SpaceContactBlock
        eyebrow={header?.eyebrow ?? 'Contact'}
        heading={header?.heading ?? 'Contact and hours'}
        address={p.address}
        hours={p.hours}
        phone={p.phone}
        email={p.email}
        linkHref={p.website}
        linkLabel={p.website ? 'Visit website' : undefined}
      />
    </ModuleSection>
  )
}
