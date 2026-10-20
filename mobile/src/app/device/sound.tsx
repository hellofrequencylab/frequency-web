import { useState } from 'react'
import { View } from 'react-native'
import { DeviceScreen } from '@/components/device-gate'
import { useDeviceAction } from '@/device/DeviceProvider'
import { Button, Card, Meta, Notice, SectionHeader, SegmentedControl } from '@/ui'

// `sound.tone {hz, ms}` on the CYD's speaker output: a row of notes with a length switch, and a few
// chimes. The tone returns once it has started.

const NOTES = [
  { label: 'C', hz: 262 },
  { label: 'D', hz: 294 },
  { label: 'E', hz: 330 },
  { label: 'G', hz: 392 },
  { label: 'A', hz: 440 },
  { label: 'High C', hz: 523 },
]

const CHIMES = [
  { label: 'Ping', hz: 1000, ms: 120 },
  { label: 'Bowl', hz: 220, ms: 1200 },
  { label: 'Alert', hz: 1800, ms: 400 },
]

export default function Sound() {
  const { run, busy, error } = useDeviceAction()
  const [ms, setMs] = useState('300')
  const tone = (hz: number, length = Number(ms)) => run('sound.tone', { hz, ms: length })

  return (
    <DeviceScreen>
      {error ? <Notice tone="broadcast">{error}</Notice> : null}
      <View style={{ gap: 14 }}>
        <SectionHeader title="Notes" />
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {NOTES.map((n) => (
              <View key={n.label} style={{ width: '31%', flexGrow: 1 }}>
                <Button block label={n.label} accessibilityLabel={`Play ${n.label}, ${n.hz} hertz`} disabled={!!busy} onPress={() => tone(n.hz)} />
              </View>
            ))}
          </View>
          <SegmentedControl
            size="sm"
            value={ms}
            onChange={setMs}
            options={[
              { value: '150', label: 'Short' },
              { value: '300', label: 'Medium' },
              { value: '800', label: 'Long' },
            ]}
          />
        </Card>
      </View>
      <View style={{ gap: 14 }}>
        <SectionHeader title="Chimes" />
        <Card>
          {CHIMES.map((c) => (
            <Button key={c.label} block variant="soft" icon="sound" label={c.label} disabled={!!busy} onPress={() => tone(c.hz, c.ms)} />
          ))}
          <Meta>Needs a speaker on the CYD&apos;s speaker header.</Meta>
        </Card>
      </View>
    </DeviceScreen>
  )
}
