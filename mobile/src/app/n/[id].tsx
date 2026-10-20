import { useEffect, useRef } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { CaptureResult } from '@/components/capture-result'
import { PageHeading, Screen } from '@/components/screen'
import { Button, EmptyState, Notice } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useCapture } from '@/lib/capture'
import { parseNodeLink } from '@/lib/node-link'

// The deep link a QR code, an NFC tag or a shared link opens: https://frequencylocal.com/n/<id>?s=<code>
// or frequency://n/<id>?s=<code>. Checks in once, as soon as the member is signed in.

export default function NodeLinkScreen() {
  const { id, s } = useLocalSearchParams<{ id: string; s?: string }>()
  const { session, ready } = useAuth()
  const { capture, busy, outcome, error } = useCapture()
  const link = parseNodeLink(`/n/${id ?? ''}${s ? `?s=${encodeURIComponent(s)}` : ''}`, [])
  const fired = useRef(false)

  useEffect(() => {
    if (!link || !session || fired.current) return
    fired.current = true
    void capture(link)
  }, [link, session, capture])

  return (
    <Screen edges={[]}>
      <PageHeading title="Check in" />
      {!link ? (
        <Notice tone="live">That is not a Frequency check-in link.</Notice>
      ) : ready && !session ? (
        <EmptyState icon="checkin" title="Sign in to check in." description="Sign in, then open the link again." action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />} />
      ) : busy ? (
        <Notice tone="presence">Checking you in…</Notice>
      ) : (
        <CaptureResult outcome={outcome} error={error} />
      )}
    </Screen>
  )
}
