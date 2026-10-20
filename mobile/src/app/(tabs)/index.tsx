import { useState } from 'react'
import { View } from 'react-native'
import { router, type Href } from 'expo-router'
import { Wordmark } from '@/components/logo'
import { PageHeading, Screen } from '@/components/screen'
import { useDevice, useDeviceAction } from '@/device/DeviceProvider'
import { HAT_NAMES, type HatProbe } from '@/device/types'
import {
  Badge,
  Body,
  Button,
  ButtonRow,
  Card,
  Counter,
  EmptyState,
  LiveDot,
  Meta,
  Notice,
  Panel,
  Row,
  SectionHeader,
  Skeleton,
  Subheading,
  useConfirm,
  type IconName,
} from '@/ui'

// The CyberUnicorn 5000 dashboard, the app's home: how it is connected, what it reports, the hat, and
// the tools. No account and no network: the link is a USB cable or Bluetooth LE.

const TOOLS: { href: Href; icon: IconName; title: string; detail: string }[] = [
  { href: '/device/light-show', icon: 'sun', title: 'Light Show', detail: 'Scenes, brightness, play and stop' },
  { href: '/device/led', icon: 'photo', title: 'LED colour', detail: 'Pick a colour or a mode' },
  { href: '/device/sound', icon: 'sound', title: 'Sound', detail: 'Notes and chimes' },
  { href: '/device/sensors', icon: 'chart', title: 'Sensors', detail: 'Light, temperature and the rest' },
  { href: '/device/remote', icon: 'compass', title: 'Screen remote', detail: 'Next, back and select from the phone' },
  { href: '/device/tag-writer', icon: 'tag', title: 'Tag writer', detail: 'Write a Frequency check-in tag' },
  { href: '/device/console', icon: 'edit', title: 'Console', detail: 'Run a Bruce command' },
]

function uptime(s?: number): string | null {
  if (s == null) return null
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

export default function DeviceHome() {
  const { state, kind, label, error, status, refreshStatus, disconnect } = useDevice()
  const { run, busy, error: actionError } = useDeviceAction()
  const confirm = useConfirm()
  const [probe, setProbe] = useState<HatProbe | null>(null)
  const connected = state === 'connected'

  const askDisconnect = async () => {
    if (await confirm({ title: 'Disconnect?', body: 'The CyberUnicorn keeps running. You can connect again any time.', confirm: 'Disconnect', variant: 'ink' })) await disconnect()
  }

  return (
    <Screen>
      <Wordmark height={18} />
      <PageHeading eyebrow="Your gadget" title="CyberUnicorn 5000" description="Plug it in with a USB OTG adapter, or connect over Bluetooth. Your phone stays on its own Wi-Fi." />

      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <LiveDot on={connected} />
          <View style={{ flex: 1, gap: 2 }}>
            <Subheading>{connected ? label ?? 'Connected' : state === 'connecting' ? 'Connecting' : 'Not connected'}</Subheading>
            <Meta>{connected ? (kind === 'usb' ? 'USB cable, 115200 baud' : 'Bluetooth LE') : 'USB or Bluetooth, no account needed'}</Meta>
          </View>
          {connected ? <Badge label={kind === 'usb' ? 'USB' : 'Bluetooth'} tone="signal" /> : null}
        </View>
        {error ? <Notice tone="broadcast">{error}</Notice> : null}
        {connected ? (
          <ButtonRow>
            <Button size="sm" icon="arrow" label="Refresh" onPress={() => refreshStatus().catch(() => undefined)} />
            <Button size="sm" variant="ghost" label="Disconnect" onPress={askDisconnect} />
          </ButtonRow>
        ) : (
          <Button block variant="primary" icon="link" label="Connect" loading={state === 'connecting'} onPress={() => router.push('/device/connect')} />
        )}
      </Panel>

      {connected ? (
        <View style={{ gap: 14 }}>
          <SectionHeader title="Status" />
          <Card>
            {status ? (
              <>
                <Body>
                  {status.os ?? 'CyberUnicorn'} {status.version ?? ''}
                  {status.bruce_version ? ` · Bruce ${status.bruce_version}` : ''}
                </Body>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Counter icon="clock" label="Up" value={uptime(status.uptime_s)} />
                  <Counter icon="vault" label="Free memory" value={status.heap_free != null ? Math.round(status.heap_free / 1024) : null} unit="KB" />
                </View>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Badge label={status.wifi?.connected ? `Wi-Fi ${status.wifi.ssid ?? ''}`.trim() : 'Wi-Fi off'} tone={status.wifi?.connected ? 'signal' : 'neutral'} />
                  <Badge label={status.ble?.enabled ? 'Bluetooth on' : 'Bluetooth off'} tone={status.ble?.enabled ? 'signal' : 'neutral'} />
                </View>
              </>
            ) : (
              <>
                <Skeleton width="70%" />
                <Skeleton height={26} width="40%" />
              </>
            )}
          </Card>

          <SectionHeader title="Hat module" />
          <Card>
            <Body>
              {probe?.summary ??
                (status?.hat?.live?.length
                  ? status.hat.live.map((h) => HAT_NAMES[h] ?? h).join(', ')
                  : status?.hat?.probed_s_ago == null
                    ? 'Not checked since it started.'
                    : 'Nothing found.')}
            </Body>
            {probe?.advice ? <Meta>{probe.advice}</Meta> : null}
            {actionError ? <Notice tone="broadcast">{actionError}</Notice> : null}
            <Button size="sm" variant="soft" icon="search" label="Check the hat" loading={busy === 'hat.probe'} onPress={async () => setProbe(await run<HatProbe>('hat.probe'))} />
          </Card>
        </View>
      ) : null}

      <View style={{ gap: 14 }}>
        <SectionHeader title="Tools" count={TOOLS.length} />
        {connected ? (
          <Card padded={false} gap={0} style={{ padding: 6 }}>
            {TOOLS.map((t) => (
              <Row key={String(t.href)} icon={t.icon} title={t.title} detail={t.detail} onPress={() => router.push(t.href)} />
            ))}
          </Card>
        ) : (
          <EmptyState
            icon="link"
            title="Connect to open the tools"
            description="Light Show, the LED, sound, sensors, the screen remote, the console and the tag writer open once your CyberUnicorn is connected."
          />
        )}
      </View>
    </Screen>
  )
}
