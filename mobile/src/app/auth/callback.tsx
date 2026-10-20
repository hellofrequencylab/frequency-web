import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { PageHeading, Screen } from '@/components/screen'
import { Button, Notice } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/theme'

// frequency://auth/callback?code=… : a magic link (or the web's /auth/native/open hand-off) lands here.
// The PKCE verifier is in this app, so the code is exchanged here and never at the web callback.

export default function AuthCallback() {
  const { code, error_description } = useLocalSearchParams<{ code?: string; error_description?: string }>()
  const { exchangeCode } = useAuth()
  const { c } = useTheme()
  const [error, setError] = useState<string | null>(error_description ?? null)
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !code) return
    done.current = true
    exchangeCode(code)
      .then(() => router.replace('/'))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'That sign-in link did not work.'))
  }, [code, exchangeCode])

  return (
    <Screen edges={[]}>
      <PageHeading title="Signing you in" />
      {error || !code ? (
        <>
          <Notice tone="danger">{error ?? 'That sign-in link is missing its code. Ask for a new one.'}</Notice>
          <Button label="Try again" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <ActivityIndicator color={c.accent} />
      )}
    </Screen>
  )
}
