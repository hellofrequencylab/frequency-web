import { useCallback, useEffect, useRef, useState } from 'react'
import { router, useFocusEffect } from 'expo-router'
import { CaptureResult } from '@/components/capture-result'
import { Screen } from '@/components/screen'
import { useAuth } from '@/lib/auth'
import { useCapture } from '@/lib/capture'
import { CHECKIN_HOSTS } from '@/lib/env'
import { parseNodeLink, SITE_HOST } from '@/lib/node-link'
import { cancelTagRead, phoneNfcState, readTagOnce } from '@/lib/phone-nfc'
import { Body, Button, Card, EmptyState, Field, Meta, Notice, Panel, StageTimeline, type Stage } from '@/ui'

// Check in by tapping a venue's Frequency tag with the phone, or by pasting its link. A QR code opens the
// same /n/<id> link through the camera app and lands on n/[id].tsx. The tag holds the server-signed
// /n/<id>?s= link; the phone only reads it and posts it (APP-CONTRACT §12). The server decides.

type Nfc = 'ready' | 'off' | 'unsupported' | null

export default function CheckIn() {
  const { session } = useAuth()
  const { capture, busy, outcome, error, reset } = useCapture()
  const [nfc, setNfc] = useState<Nfc>(null)
  const [listening, setListening] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)
  const [pasted, setPasted] = useState('')
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    phoneNfcState().then((s) => alive.current && setNfc(s))
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
      <Screen edges={[]}>
        <EmptyState
          icon="checkin"
          title="Sign in to check in"
          description="Check-ins earn Zaps and stamp your Regulars cards."
          action={<Button variant="primary" label="Sign in" onPress={() => router.push('/sign-in')} />}
        />
      </Screen>
    )
  }

  const step = outcome?.ok ? 3 : busy ? 2 : listening ? 1 : 0
  const stages: Stage[] = ['Get ready', 'Tap the tag', 'Checking', 'You are in'].map((label, i) => ({ key: label, label, state: i < step ? 'done' : i === step ? 'current' : 'upcoming' }))

  return (
    <Screen edges={[]}>
      <StageTimeline stages={stages} />
      <Panel>
        <Body>Tap Ready, then hold the back of your phone on the Frequency tag at the door.</Body>
        {nfc === 'unsupported' ? (
          <Notice tone="info">This phone has no NFC reader. Scan the door QR with your camera instead, or paste the link below.</Notice>
        ) : nfc === 'off' ? (
          <Notice tone="warning" title="NFC is off">Turn on NFC in your phone settings, then tap Ready.</Notice>
        ) : null}
        <Button block variant="primary" icon="checkin" label={listening ? 'Hold the phone on the tag' : 'Ready to tap'} loading={busy} disabled={nfc !== 'ready' || listening} onPress={tap} />
        {listening ? <Button block variant="ghost" label="Cancel" onPress={cancelTagRead} /> : null}
      </Panel>

      {tagError ? <Notice tone="warning">{tagError}</Notice> : null}
      <CaptureResult outcome={outcome} error={error} />

      <Card>
        <Meta>Have the link instead? Paste it here.</Meta>
        <Field label="Check-in link" value={pasted} onChangeText={setPasted} placeholder={`https://${SITE_HOST}/n/…`} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Button block icon="link" label="Check in with the link" disabled={!pasted.trim() || busy} loading={busy && !listening} onPress={submitPasted} />
      </Card>
    </Screen>
  )
}
