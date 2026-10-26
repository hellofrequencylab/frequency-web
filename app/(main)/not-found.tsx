import { NOT_FOUND_METADATA } from '@/lib/seo/not-found-metadata'
import { MemberNotFound } from '@/components/frequency/members/member-status'

// One robots directive in the head, never two (LIVE-214, ADR-1276): see the module.
export const metadata = NOT_FOUND_METADATA

export default function NotFound() {
  return <MemberNotFound />
}
