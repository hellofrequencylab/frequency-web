import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { DeviceScreen } from '@/components/device-gate'
import { Section } from '@/components/screen'
import { Meta, Subheading } from '@/components/text'
import { Button, Card, Chip, Notice, Row, Segmented } from '@/components/ui'
import { useDevice, useDeviceAction } from '@/device/DeviceProvider'
import { LIGHTSHOW_LEVELS, type LightShowState } from '@/device/types'
import { space, useTheme } from '@/theme'

// Light Show remote: `lightshow.state` / `lightshow.set {scene?, level?, running?}`, kept live by the
// `lightshow.state` event (the device's own buttons change it too).

export default function LightShow() {
  const { onEvent, call } = useDevice()
  const { run, busy, error } = useDeviceAction()
  const { c } = useTheme()
  const [show, setShow] = useState<LightShowState | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    call<LightShowState>('lightshow.state').then(setShow, (e: unknown) => setNote(e instanceof Error ? e.message : 'Could not read the show.'))
    return onEvent((e) => {
      if (e.event === 'lightshow.state' && e.data && typeof e.data === 'object') setShow(e.data as LightShowState)
      if (e.event === 'lightshow.error') setNote(((e.data as { message?: string } | null)?.message ?? 'The show could not start.') as string)
    })
  }, [call, onEvent])

  const set = async (args: Record<string, unknown>) => {
    setNote(null)
    const s = await run<LightShowState>('lightshow.set', args)
    if (s) setShow(s)
  }

  const scenes = show?.scenes ?? []
  const levels = LIGHTSHOW_LEVELS.slice(0, show?.level_count ?? LIGHTSHOW_LEVELS.length)

  return (
    <DeviceScreen>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
          <View style={{ flex: 1, gap: space[2] }}>
            <Subheading>{show?.scene_name ?? 'Light Show'}</Subheading>
            <Meta>{show?.running ? 'Playing' : 'Stopped'}{show?.pin != null && show.pin >= 0 ? ` · LED strip on pin ${show.pin}` : ' · screen only'}</Meta>
          </View>
          <Chip label={show?.running ? 'Live' : 'Off'} tone={show?.running ? 'live' : 'muted'} />
        </View>
        <Button
          label={show?.running ? 'Stop' : 'Play'}
          icon={show?.running ? 'close' : 'sun'}
          busy={busy === 'lightshow.set'}
          onPress={() => set({ running: !show?.running })}
        />
        <Meta>Play works from the device&apos;s main menu. If it says busy, press Back on the screen remote a few times first.</Meta>
      </Card>
      {error ? <Notice tone="live">{error}</Notice> : null}
      {note ? <Notice tone="live">{note}</Notice> : null}

      <Section title="Brightness">
        <Segmented
          value={String(show?.level ?? 0)}
          onChange={(v) => set({ level: Number(v) })}
          options={levels.map((pct, i) => ({ value: String(i), label: `${pct}%` }))}
        />
      </Section>

      <Section title="Scenes" count={scenes.length}>
        <Card padded={false} style={{ padding: space[3] }}>
          {scenes.map((name, i) => (
            <Row
              key={name}
              icon={i === show?.scene ? 'check' : 'sun'}
              tint={i === show?.scene ? c.live : undefined}
              title={name}
              onPress={() => set({ scene: i })}
              trailing={i === show?.scene ? <Chip label="Now" tone="live" /> : undefined}
            />
          ))}
          {scenes.length === 0 ? <Meta style={{ padding: space[4] }}>No scenes reported yet.</Meta> : null}
        </Card>
      </Section>
    </DeviceScreen>
  )
}
