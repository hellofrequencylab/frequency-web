import { useState } from 'react'
import { router } from 'expo-router'
import { RoundMark } from '@/components/logo'
import { PageHeading, Screen } from '@/components/screen'
import { useAuth } from '@/lib/auth'
import { memberConfigured } from '@/lib/env'
import { Button, Field, Meta, Notice, Panel } from '@/ui'

// Email sign-in for an existing Frequency account (APP-CONTRACT §11). Supabase sends one email: type its
// code here, or tap its link, which opens frequency://auth/callback. New accounts start on the web.

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
      router.replace('/frequency')
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
      <Panel>
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" editable={!sent} />
        {!sent ? (
          <Button block variant="primary" icon="send" label="Email me a sign-in code" loading={busy} disabled={!email.includes('@') || !memberConfigured} onPress={send} />
        ) : (
          <>
            <Meta>Check your inbox. Type the code from the email, or tap its link on this phone.</Meta>
            <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" />
            <Button block variant="primary" label="Sign in" loading={busy} disabled={code.trim().length < 6} onPress={verify} />
            <Button block variant="ghost" label="Use a different email" onPress={() => (setSent(false), setCode(''))} />
          </>
        )}
      </Panel>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Meta>New to Frequency? Make your account on the web first, then sign in here.</Meta>
    </Screen>
  )
}
