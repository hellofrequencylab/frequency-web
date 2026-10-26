'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { FqMessagesError } from '@/components/frequency/members/messages/messages-states'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
    // Report, don't just log: server renders are covered by instrumentation.ts
    // onRequestError, but a client-side throw caught HERE never reaches the root
    // reporting boundary (nearest-boundary-wins) - without this it was invisible.
    Sentry.captureException(error)
  }, [error])
  return <FqMessagesError reset={reset} />
}
