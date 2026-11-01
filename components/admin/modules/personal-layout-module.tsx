'use client'

import { usePathname } from 'next/navigation'
import { MemberPageBuilderSwitch } from '@/components/entity-blocks/member-page-builder-switch'

// Personal "You" module — the Layout slot (ADR-516 Phase C). The member's profile PAGE BUILDER, mounted
// INLINE in the rail on their own /people/<handle> (the `account.layout` surface predicate already gates
// the mount to /people/*). It replaces the old link-row out to /people/<handle>/profile-preview/edit: the
// full rows/slots outline now lives here, editing the shared ProfileLayoutContext so the page behind the
// slide-over previews every change live. The builder self-fetches the owner's handle + saved layout and
// renders NOTHING unless the page's handle is the viewer's own (self-owner gate, fail-safe).

/** Anchor the Spotlight module's "Build your page" button scrolls to when already on the profile. */
export const MEMBER_LAYOUT_BUILDER_ID = 'member-layout-builder'

/** Extract the handle from a `/people/<handle>` path, else null. */
function handleFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/people\/([^/]+)/)
  return m ? m[1] : null
}

export function PersonalLayoutModule() {
  const pathname = usePathname()
  const handle = handleFromPath(pathname)
  if (!handle) return null
  return (
    <div id={MEMBER_LAYOUT_BUILDER_ID} className="scroll-mt-4">
      <MemberPageBuilderSwitch pageHandle={handle} />
    </div>
  )
}
