import type { ReactNode } from 'react'
import { MembersBody, SerifTail } from '@/components/frequency/members/shared/members-body'
import { MemberHead } from '@/components/frequency/members/shared/member-head'

// The Frequency face of a Focus page (LIVE-935): the members kit frame, the shared MemberHead, then
// the page's own content untouched. A page keeps its FocusTemplate for DAWN and swaps to this under
// SITE_DESIGN === 'frequency', so no Frequency route draws DAWN's PageHeading. Server-safe.
export function FqFocusPage({
  kicker,
  title,
  meta,
  actions,
  children,
}: {
  kicker: string
  title: string
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <MembersBody>
      <MemberHead kicker={kicker} title={<SerifTail text={title} />} meta={meta} actions={actions} />
      {children}
    </MembersBody>
  )
}
