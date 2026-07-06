import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceFaqBlock } from '@/components/page-editor/blocks/spaces'
import { ModuleSection } from './section'

// FAQ — the operator Q and A, as an accordion (also emits FAQPage structured data via the reused
// block). Reads the live rows off the data bag; FAIL-SAFE: no questions, no section.
export function FaqBlock({
  data,
  header,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
}) {
  if (data.faqs.length === 0) return null
  return (
    <ModuleSection anchor="faq">
      <SpaceFaqBlock eyebrow={header?.eyebrow ?? 'FAQ'} heading={header?.heading ?? 'Common questions'} faqs={data.faqs} />
    </ModuleSection>
  )
}
