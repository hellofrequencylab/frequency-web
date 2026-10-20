import { useState } from 'react'
import { View } from 'react-native'
import { router, type Href } from 'expo-router'
import { PageHeading, Screen, Section } from '@/components/screen'
import { Body, Meta, Subheading } from '@/components/text'
import { Button, Card, Chip, EmptyState, LiveDot, Notice, Row } from '@/components/ui'
import type { IconName } from '@/components/icon'
import { useDevice, useDeviceAction } from '@/device/DeviceProvider'
import { HAT_NAMES, type HatProbe } from '@/device/types'
import { space } from '@/theme'

// The CyberUnicorn 5000 dashboard: how it is connected, what it reports, and the tools. The phone
// keeps its own Wi-Fi throughout; the link is a USB cable or Bluetooth LE.

const TOOLS: { href: Href; icon: IconName; title: string; detail: string }[] = [
  { href: '/device/light-show', icon: 'sun', title: 'Light Show', detail: 'Scenes, brightness, play and stop' },
  { href: '/device/led', icon: 'photo', title: 'LED colour', detail: 'Pick a colour or a mode' },
  { href: '/device/sound', icon: 'sound', title: 'Sound', detail: 'Tones and chimes' },
  { href: '/device/sensors', icon: 'chart', title: 'Sensors', detail: 'Light, temperature and the rest' },
  { href: '/device/remote', icon: 'compass', title: 'Screen remote', detail: 'Next, back, select from the phone' },
  { href: '/device/tag-writer', icon: 'tag', title: 'Tag writer', detail: 'Write a Frequency check-in tag' },
  { href: '/device/console', icon: 'edit', title: 'Console', detail: 'Run a Bruce command' },
]

function uptime(s?: number): string | null {
  if (s == null) return null
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

export default function DeviceTab() {
  const { state, kind, label, error, status, refreshStatus, disconnect } = useDevice()
  const { run, busy, error: actionError } = useDeviceAction()
  const [probe, setProbe] = useState<HatProbe | null>(null)
  const connected = state === 'connected'

  return (
    <Screen>
      <PageHeading eyebrow="Your gadget" title="CyberUnicorn 5000" description="Plug it in with a USB OTG adapter, or connect over Bluetooth. Your phone stays on its own Wi-Fi." />

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
          <LiveDot on={connected} />
          <View style={{ flex: 1 }}>
            <Subheading>{connected ? label ?? 'Connected' : state === 'connecting' ? 'Connecting…' : 'Not connected'}</Subheading>
            {connected ? <Meta>{kind === 'usb' ? 'USB cable, 115200 baud' : 'Bluetooth LE'}</Meta> : null}
          </View>
          {connected ? <Chip label={kind === 'usb' ? 'USB' : 'Bluetooth'} tone="presence" /> : null}
        </View>
        {error ? <Notice tone="live">{error}</Notice> : null}
        {connected ? (
          <View style={{ flexDirection: 'row', gap: space[4] }}>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" compact label="Refresh" onPress={() => refreshStatus().catch(() => undefined)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="danger" compact label="Disconnect" onPress={disconnect} />
            </View>
          </View>
        ) : (
          <Button label="Connect" icon="link" busy={state === 'connecting'} onPress={() => router.push('/device/connect')} />
        )}
      </Card>

      {connected && status ? (
        <Section title="Status">
          <Card>
            <Body>
              {status.os ?? 'CyberUnicorn'} {status.version ?? ''}
              {status.bruce_version ? ` · Bruce ${status.bruce_version}` : ''}
            </Body>
            <Meta>
              {[
                uptime(status.uptime_s) && `Up ${uptime(status.uptime_s)}`,
                status.heap_free != null && `${Math.round(status.heap_free / 1024)} KB free`,
                status.wifi?.connected ? `Wi-Fi ${status.wifi.ssid ?? ''}` : 'Wi-Fi off',
                status.ble?.enabled ? 'Bluetooth on' : 'Bluetooth off',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Meta>
          </Card>
        </Section>
      ) : null}

      {connected ? (
        <Section title="Hat module">
          <Card>
            <Body>
              {probe?.summary ??
                (status?.hat?.live?.length ? status.hat.live.map((h) => HAT_NAMES[h] ?? h).join(', ') : status?.hat?.probed_s_ago == null ? 'Not checked since it started.' : 'Nothing found.')}
            </Body>
            {probe?.advice ? <Meta>{probe.advice}</Meta> : null}
            {actionError ? <Notice tone="live">{actionError}</Notice> : null}
            <Button variant="secondary" compact label="Check the hat" busy={busy === 'hat.probe'} onPress={async () => setProbe(await run<HatProbe>('hat.probe'))} />
          </Card>
        </Section>
      ) : null}

      <Section title="Tools">
        {connected ? (
          <Card padded={false} style={{ padding: space[3] }}>
            {TOOLS.map((t) => (
              <Row key={String(t.href)} icon={t.icon} title={t.title} detail={t.detail} onPress={() => router.push(t.href)} />
            ))}
          </Card>
        ) : (
          <EmptyState icon="link" title="Connect your CyberUnicorn first." description="Light Show, the LED, sound, sensors, the screen remote and the tag writer open once it is connected." />
        )}
      </Section>
    </Screen>
  )
}
