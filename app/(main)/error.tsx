'use client'

import { MemberError } from '@/components/frequency/members/member-status'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <MemberError error={error} reset={reset} />
}

