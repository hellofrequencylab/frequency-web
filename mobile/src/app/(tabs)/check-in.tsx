import { useCallback, useEffect, useRef, useState } from 'react'
import { router, useFocusEffect } from 'expo-router'
import { CaptureResult } from '@/components/capture-result'
import { PageHeading, Screen } from '@/components/screen'
import { BodySmall } from '@/components/text'
import { Button, Card, EmptyState, Field, Notice } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useCapture } from '@/lib/capture'
import { CHECKIN_HOSTS, WEB_HOST } from '@/lib/env'
import { parseNodeLink } from '@/lib/node-link'
import { cancelTagRead, phoneNfcState, readTagOnce } from '@/lib/phone-nfc'

// Check in by tapping a venue's NFC tag with the phone, or by pasting its link. A QR code opens the
// same /n/<id> link through the camera app and lands on n/[id].tsx.

export default function CheckIn() {
  const { session } = useAuth()
  const { capture, busy, outcome, error, reset } = useCapture()
  const [nfc, setNfc] = useState<'ready' | 'off' | 'unsupported' | null>(null)
  const [listening, setListening] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)
  const [pasted, setPasted] = useState('')
  const alive = useRef(true)

  useEffect(() => {
    phoneNfcState().then(setNfc)
    return () => {
      alive.current = false
      cancelTagRead()
    }
  }, [])

  useFocusEffect(useCallback(() => () => cancelTagRead(), []))

  const tap = async () => {
    reset()
    setTagError(null)
    setListening(true)
    try {
      const { texts } = await readTagOnce()
      const link = texts.map((t) => parseNodeLink(t, CHECKIN_HOSTS)).find((l) => l != null)
      if (!alive.current) return
      if (!link) {
        setTagError(texts.length ? 'That tag is not a Frequency check-in.' : 'No tag read. Hold the phone on the tag a little longer.')
        return
      }
      await capture(link)
    } catch {
      if (alive.current) setTagError('No tag read. Try again.')
    } finally {
      if (alive.current) setListening(false)
    }
  }

  const submitPasted = async () => {
    const link = parseNodeLink(pasted, CHECKIN_HOSTS)
    if (!link) {
      setTagError('That is not a Frequency check-in link.')
      return
    }
    setTagError(null)
    await capture(link)
  }

  if (!session) {
    return (
      <Screen>
        <PageHeading title="Check in" />
        <EmptyState icon="checkin" title="Sign in to check in." description="Check-ins earn Zaps and stamp your Regulars cards." action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />} />
      </Screen>
    )
  }

  return (
    <Screen>
      <PageHeading title="Check in" description="Tap the Frequency tag at the door with the back of your phone." />
      <Card>
        {nfc === 'unsupported' ? (
          <Notice tone="info">This phone has no NFC reader. Scan the door QR with your camera instead, or paste the link below.</Notice>
        ) : nfc === 'off' ? (
          <Notice tone="reward" title="NFC is off">Turn on NFC in your phone settings, then tap Ready.</Notice>
        ) : null}
        <Button
          label={listening ? 'Hold the phone on the tag…' : 'Ready to tap'}
          icon="checkin"
          busy={busy}
          disabled={nfc !== 'ready' || listening}
          onPress={tap}
        />
        {listening ? <Button variant="ghost" label="Cancel" onPress={cancelTagRead} /> : null}
      </Card>

      {tagError ? <Notice tone="live">{tagError}</Notice> : null}
      <CaptureResult outcome={outcome} error={error} />

      <Card>
        <BodySmall>Have the link instead? Paste it here.</BodySmall>
        <Field label="Check-in link" value={pasted} onChangeText={setPasted} placeholder={`https://${WEB_HOST}/n/…`} autoCapitalize="none" autoCorrect={false} />
        <Button variant="secondary" label="Check in with link" disabled={!pasted.trim()} busy={busy} onPress={submitPasted} />
      </Card>
    </Screen>
  )
}
