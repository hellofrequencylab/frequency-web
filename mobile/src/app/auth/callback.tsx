import { useEffect, useRef, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { PageHeading, Screen } from '@/components/screen'
import { useAuth } from '@/lib/auth'
import { Button, Notice, Skeleton } from '@/ui'

// frequency://auth/callback?code=… : a magic link (or the web's /auth/native/open hand-off) lands here.
// The PKCE verifier is in this app, so the code is exchanged here and never at the web callback.

export default function AuthCallback() {
  const { code, error_description } = useLocalSearchParams<{ code?: string; error_description?: string }>()
  const { exchangeCode } = useAuth()
  const [error, setError] = useState<string | null>(error_description ?? null)
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !code) return
    done.current = true
    exchangeCode(code)
      .then(() => router.replace('/frequency'))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'That sign-in link did not work.'))
  }, [code, exchangeCode])

  return (
    <Screen edges={[]}>
      <PageHeading title="Signing you in" />
      {error || !code ? (
        <>
          <Notice tone="danger">{error ?? 'That sign-in link is missing its code. Ask for a new one.'}</Notice>
          <Button variant="primary" label="Try again" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <Skeleton height={20} width="60%" />
      )}
    </Screen>
  )
}
