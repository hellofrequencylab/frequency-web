import { useState } from 'react'
import { router } from 'expo-router'
import { RoundMark } from '@/components/logo'
import { PageHeading, Screen } from '@/components/screen'
import { BodySmall } from '@/components/text'
import { Button, Card, Field, Notice } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { memberConfigured } from '@/lib/env'

// Email sign-in for an existing Frequency account. Supabase sends one email: type its code here, or tap
// its link, which opens frequency://auth/callback. New accounts start on the web (onboarding).

export default function SignIn() {
  const { sendCode, verifyCode } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await sendCode(email)
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the email.')
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setBusy(true)
    setError(null)
    try {
      await verifyCode(email, code)
      router.dismissAll()
      router.replace('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen edges={['bottom']}>
      <RoundMark size={48} />
      <PageHeading title="Sign in" description="Use the email on your Frequency account." />
      {!memberConfigured ? <Notice tone="info">This build is not connected to Frequency yet. See mobile/.env.example.</Notice> : null}
      <Card>
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" editable={!sent} />
        {!sent ? (
          <Button label="Email me a sign-in code" icon="send" busy={busy} disabled={!email.includes('@') || !memberConfigured} onPress={send} />
        ) : (
          <>
            <BodySmall>Check your inbox. Type the code from the email, or tap its link on this phone.</BodySmall>
            <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" />
            <Button label="Sign in" busy={busy} disabled={code.trim().length < 6} onPress={verify} />
            <Button variant="ghost" label="Use a different email" onPress={() => (setSent(false), setCode(''))} />
          </>
        )}
      </Card>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <BodySmall>New to Frequency? Make your account on the web first, then sign in here.</BodySmall>
    </Screen>
  )
}
