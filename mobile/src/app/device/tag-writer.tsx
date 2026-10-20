import { useState } from 'react'
import { View } from 'react-native'
import { DeviceScreen } from '@/components/device-gate'
import { useDeviceAction } from '@/device/DeviceProvider'
import { utf8Encode } from '@/device/bytes'
import { encodeRequest, MAX_REQUEST_BYTES } from '@/device/protocol'
import type { TagRead, TagWritten } from '@/device/types'
import { parseNodeLink, SITE_HOST } from '@/lib/node-link'
import { Badge, Body, BodySmall, Button, Card, Field, Meta, Notice, Panel, SectionHeader, Soft, Subheading, useConfirm } from '@/ui'

// Write a Frequency check-in tag with the CyberUnicorn's PN532. Paste the Space's check-in link (Space,
// Settings, Check in, Copy), then `frequency.write_tag {url}`. The tag holds ONE NDEF URI record and
// nothing else (docs/LOYALTY.md §6), so no label is sent. The link is never built or retyped here: it
// is the server-signed one, checked only for its /n/<id>?s= shape. `frequency.read_tag` reads a tag
// back and the screen compares its URL with the one sent.

export default function TagWriter() {
  const confirm = useConfirm()
  const { run, busy, error } = useDeviceAction()
  const [pasted, setPasted] = useState('')
  const [written, setWritten] = useState<TagWritten | null>(null)
  const [read, setRead] = useState<TagRead | null>(null)

  const url = pasted.trim()
  const link = url ? parseNodeLink(url, '*') : null
  const shapeError = url && !link ? 'That is not a Frequency check-in link. It looks like https://frequencylocal.com/n/…?s=…' : null
  const unsigned = link && !link.secret ? 'This link has no ?s= code, so it will not check anyone in. Copy it again from Check in settings.' : null
  const offSite = !!link?.host && link.host !== SITE_HOST
  const tooLong = link ? utf8Encode(encodeRequest(999999, 'frequency.write_tag', { url })).length > MAX_REQUEST_BYTES : false

  const write = async () => {
    if (!link) return
    if (
      offSite &&
      !(await confirm({ title: 'Not a frequencylocal.com link', body: `This link is from ${link.host}. Write it anyway? Fine for testing, not for a tag on the wall.`, confirm: 'Write it', variant: 'ink' }))
    )
      return
    setWritten(null)
    setRead(null)
    const r = await run<TagWritten>('frequency.write_tag', { url })
    if (r) setWritten(r)
  }

  const check = async () => {
    setRead(null)
    const r = await run<TagRead>('frequency.read_tag')
    if (r) setRead(r)
  }

  const matches = read?.url != null && read.url === url

  return (
    <DeviceScreen>
      <Soft>
        <Subheading>How it works</Subheading>
        <BodySmall>1. On Frequency, open your Space, then Settings, then Check in, and copy the check-in link.</BodySmall>
        <BodySmall>2. Paste it below and hold a blank NTAG215 sticker or card on the NFC hat (DIP 3 on).</BodySmall>
        <BodySmall>3. Write it, then read it back. Members tap it with their phone to check in.</BodySmall>
      </Soft>

      <Panel>
        <Field
          label="Check-in link"
          value={pasted}
          onChangeText={setPasted}
          placeholder={`https://${SITE_HOST}/n/…`}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          error={shapeError ?? unsigned ?? (tooLong ? 'That link is too long for one device request.' : null)}
          hint={offSite ? `From ${link?.host}, not ${SITE_HOST}.` : 'Paste the whole link, including the ?s= part.'}
        />
        <Button block variant="primary" icon="tag" label="Write the tag" loading={busy === 'frequency.write_tag'} disabled={!link || !!unsigned || tooLong || !!busy} onPress={write} />
        <Button block icon="checkin" label="Read a tag back" loading={busy === 'frequency.read_tag'} disabled={!!busy} onPress={check} />
      </Panel>

      {error ? <Notice tone="broadcast">{error}</Notice> : null}

      {written ? (
        <Notice tone={written.written ? 'success' : 'danger'} title={written.written ? 'Tag written' : 'Not written'}>
          {written.uid ? `Tag ${written.uid}. Read it back to check it.` : 'The device did not report the tag id.'}
        </Notice>
      ) : null}

      {read ? (
        <View style={{ gap: 14 }}>
          <SectionHeader title="On the tag" />
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {url ? <Badge label={matches ? 'Matches the link' : 'Does not match'} tone={matches ? 'success' : 'warning'} icon={matches ? 'check' : undefined} /> : null}
              {read.type ? <Badge label={read.type} /> : null}
            </View>
            {read.uid ? <Meta>Tag {read.uid}</Meta> : null}
            <Body selectable>{read.url ?? read.label ?? 'No link on this tag.'}</Body>
            {read.url && !parseNodeLink(read.url, '*') ? <Meta>This is not a Frequency check-in link.</Meta> : null}
          </Card>
        </View>
      ) : null}
    </DeviceScreen>
  )
}
