import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { DeviceScreen } from '@/components/device-gate'
import { useDevice, useDeviceAction } from '@/device/DeviceProvider'
import { LIGHTSHOW_LEVELS, type LightShowState } from '@/device/types'
import { Badge, Button, LiveDot, Meta, Meter, Notice, Panel, SectionHeader, SegmentedControl, Subheading } from '@/ui'

// Light Show remote: `lightshow.state` / `lightshow.set {scene?, level?, running?}`, kept live by the
// `lightshow.state` event (the device's own buttons change it too). Scenes are a vertical segmented
// list, brightness is a segmented row with its meter, play and stop is the one primary action.

export default function LightShow() {
  const { onEvent, call } = useDevice()
  const { run, busy, error } = useDeviceAction()
  const [show, setShow] = useState<LightShowState | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    call<LightShowState>('lightshow.state').then(setShow, (e: unknown) => setNote(e instanceof Error ? e.message : 'Could not read the show.'))
    return onEvent((e) => {
      if (e.event === 'lightshow.state' && e.data && typeof e.data === 'object') setShow(e.data as LightShowState)
      if (e.event === 'lightshow.error') setNote((e.data as { message?: string } | null)?.message ?? 'The show could not start.')
    })
  }, [call, onEvent])

  const set = async (args: Record<string, unknown>) => {
    setNote(null)
    const s = await run<LightShowState>('lightshow.set', args)
    if (s) setShow(s)
  }

  const scenes = show?.scenes ?? []
  const levels = LIGHTSHOW_LEVELS.slice(0, show?.level_count ?? LIGHTSHOW_LEVELS.length)
  const level = show?.level ?? 0

  return (
    <DeviceScreen>
      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <LiveDot on={!!show?.running} />
          <View style={{ flex: 1, gap: 2 }}>
            <Subheading>{show?.scene_name ?? 'Light Show'}</Subheading>
            <Meta>{show?.pin != null && show.pin >= 0 ? `LED strip on pin ${show.pin}` : 'Screen only'}</Meta>
          </View>
          <Badge label={show?.running ? 'Playing' : 'Stopped'} tone={show?.running ? 'broadcast' : 'neutral'} />
        </View>
        <Button
          block
          variant={show?.running ? 'ink' : 'primary'}
          icon={show?.running ? 'close' : 'sun'}
          label={show?.running ? 'Stop the show' : 'Play the show'}
          loading={busy === 'lightshow.set'}
          onPress={() => set({ running: !show?.running })}
        />
        <Meta>Play works from the device&apos;s main menu. If it says busy, press Back on the screen remote a few times first.</Meta>
      </Panel>
      {error ? <Notice tone="broadcast">{error}</Notice> : null}
      {note ? <Notice tone="broadcast">{note}</Notice> : null}

      <View style={{ gap: 14 }}>
        <SectionHeader title="Brightness" />
        <SegmentedControl value={String(level)} onChange={(v) => set({ level: Number(v) })} options={levels.map((pct, i) => ({ value: String(i), label: `${pct}%` }))} />
        <Meter label="Brightness" value={levels[level] ?? 0} max={40} reading={`${show?.level_percent ?? levels[level] ?? 0}%`} />
      </View>

      <View style={{ gap: 14 }}>
        <SectionHeader title="Scenes" count={scenes.length} />
        {scenes.length ? (
          <SegmentedControl
            vertical
            value={show?.scene != null ? String(show.scene) : null}
            onChange={(v) => set({ scene: Number(v) })}
            options={scenes.map((name, i) => ({ value: String(i), label: name, icon: 'sun' }))}
          />
        ) : (
          <Meta>No scenes reported yet.</Meta>
        )}
      </View>
    </DeviceScreen>
  )
}
