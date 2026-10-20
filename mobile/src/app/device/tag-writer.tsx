import { useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { router } from 'expo-router'
import { DeviceScreen } from '@/components/device-gate'
import { Icon } from '@/components/icon'
import { Section } from '@/components/screen'
import { Body, BodySmall, Meta, Subheading } from '@/components/text'
import { Button, Card, Chip, Field, Notice, Row } from '@/components/ui'
import { useDeviceAction } from '@/device/DeviceProvider'
import { utf8Encode } from '@/device/bytes'
import { encodeRequest, MAX_REQUEST_BYTES } from '@/device/protocol'
import type { TagRead, TagWritten } from '@/device/types'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { CHECKIN_HOSTS, WEB_HOST } from '@/lib/env'
import { parseNodeLink } from '@/lib/node-link'
import { useRemote } from '@/lib/use-remote'
import { space, useTheme } from '@/theme'

// Write a Frequency check-in tag with the CyberUnicorn's PN532: pick the check-in link of a Space you
// run (GET /api/v1/spaces/checkin-links) or paste one, then `frequency.write_tag {url}`. Only Frequency
// /n/ links are written, so a tag made here always checks someone in. The tag spec (docs/LOYALTY.md §6)
// is ONE NDEF URI record and nothing else, so no label is sent: the name shown here stays on the phone.
// The link is never built or retyped on the phone; it is the server-signed one. `frequency.read_tag`
// reads a tag back and the screen compares its URL to the one sent.

type Target = { url: string; label: string }

export default function TagWriter() {
  const { c } = useTheme()
  const { session } = useAuth()
  const { run, busy, error, setError } = useDeviceAction()
  const { data: links, error: linksError } = useRemote(session ? session.user.id : null, api.checkinLinks)
  const [target, setTarget] = useState<Target | null>(null)
  const [pasted, setPasted] = useState('')
  const [written, setWritten] = useState<TagWritten | null>(null)
  const [read, setRead] = useState<TagRead | null>(null)

  const usePasted = () => {
    const link = parseNodeLink(pasted, CHECKIN_HOSTS)
    if (!link) {
      setError('Paste a Frequency check-in link, the kind that starts with https://' + WEB_HOST + '/n/.')
      return
    }
    setError(null)
    setTarget({ url: pasted.trim(), label: 'Frequency check-in' })
  }

  const tooLong = target ? utf8Encode(encodeRequest(999999, 'frequency.write_tag', { url: target.url })).length > MAX_REQUEST_BYTES : false

  const write = async () => {
    if (!target) return
    setWritten(null)
    setRead(null)
    const r = await run<TagWritten>('frequency.write_tag', { url: target.url })
    if (r) setWritten(r)
  }

  const check = async () => {
    setRead(null)
    const r = await run<TagRead>('frequency.read_tag')
    if (r) setRead(r)
  }

  const readMatches = read?.url && target ? read.url === target.url : null

  return (
    <DeviceScreen>
      <Card>
        <BodySmall>Hold a blank NTAG sticker or card on the CyberUnicorn&apos;s NFC hat (DIP 3 on), pick a link, and write it. Members tap the tag with their phone to check in.</BodySmall>
      </Card>

      <Section title="Your Spaces">
        {!session ? (
          <Notice tone="info" title="Sign in to use your Spaces">
            The check-in links of the Spaces you run appear here. You can still paste a link below.
          </Notice>
        ) : linksError ? (
          <Notice tone="live">{linksError}</Notice>
        ) : links == null ? (
          <ActivityIndicator color={c.accent} />
        ) : links.length === 0 ? (
          <Notice tone="info">You do not run a Space with check-in yet. Paste a link from a Space&apos;s check-in settings instead.</Notice>
        ) : (
          <Card padded={false} style={{ padding: space[3] }}>
            {links.map((l) => (
              <Row
                key={l.spaceId}
                icon="space"
                title={l.spaceName}
                detail="Door check-in link"
                onPress={() => setTarget({ url: l.url, label: `${l.spaceName} check-in` })}
                trailing={target?.url === l.url ? <Chip label="Picked" tone="presence" /> : undefined}
              />
            ))}
          </Card>
        )}
      </Section>

      <Section title="Or paste a link">
        <Card>
          <Field label="Check-in link" value={pasted} onChangeText={setPasted} placeholder={`https://${WEB_HOST}/n/…`} autoCapitalize="none" autoCorrect={false} />
          <Button variant="secondary" label="Use this link" disabled={!pasted.trim()} onPress={usePasted} />
        </Card>
      </Section>

      {target ? (
        <Card>
          <Subheading>{target.label}</Subheading>
          <Meta selectable numberOfLines={2}>
            {target.url}
          </Meta>
          {tooLong ? <Notice tone="live">That link is too long for one device request.</Notice> : null}
          <Button label="Write the tag" icon="tag" busy={busy === 'frequency.write_tag'} disabled={tooLong || !!busy} onPress={write} />
          <Button variant="secondary" label="Read a tag back" icon="checkin" busy={busy === 'frequency.read_tag'} disabled={!!busy} onPress={check} />
        </Card>
      ) : null}

      {error ? <Notice tone="live">{error}</Notice> : null}

      {written ? (
        <Notice tone={written.written ? 'presence' : 'live'} title={written.written ? 'Tag written' : 'Not written'}>
          {written.uid ? `Tag ${written.uid}` : 'The device did not report the tag id.'}
        </Notice>
      ) : null}

      {read ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Icon name={readMatches ? 'check' : 'tag'} size={20} color={readMatches ? c.presence : c.textMuted} />
            <Subheading>{readMatches ? 'This tag checks in to your Space' : 'Tag read'}</Subheading>
          </View>
          {read.uid ? <Meta>Tag {read.uid}{read.type ? ` · ${read.type}` : ''}</Meta> : null}
          <Body selectable>{read.url ?? read.label ?? 'No link on this tag.'}</Body>
          {read.url && !parseNodeLink(read.url, CHECKIN_HOSTS) ? <Meta>This is not a Frequency check-in link.</Meta> : null}
        </Card>
      ) : null}

      {!session ? <Button variant="ghost" label="Sign in" onPress={() => router.push('/sign-in')} /> : null}
    </DeviceScreen>
  )
}
