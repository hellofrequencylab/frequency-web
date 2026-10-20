import { useState } from 'react'
import { View } from 'react-native'
import { DeviceScreen } from '@/components/device-gate'
import { Section } from '@/components/screen'
import { Meta } from '@/components/text'
import { Button, Card, Notice } from '@/components/ui'
import { useDeviceAction } from '@/device/DeviceProvider'
import { space } from '@/theme'

// `sound.tone {hz, ms}` on the CYD's speaker output. A row of notes and a few chimes; the tone returns
// once it has started.

const NOTES = [
  { label: 'C', hz: 262 },
  { label: 'D', hz: 294 },
  { label: 'E', hz: 330 },
  { label: 'G', hz: 392 },
  { label: 'A', hz: 440 },
  { label: 'C′', hz: 523 },
]

const CHIMES = [
  { label: 'Ping', hz: 1000, ms: 120 },
  { label: 'Bowl', hz: 220, ms: 1200 },
  { label: 'Alert', hz: 1800, ms: 400 },
]

export default function Sound() {
  const { run, busy, error } = useDeviceAction()
  const [ms, setMs] = useState(300)
  const tone = (hz: number, length = ms) => run('sound.tone', { hz, ms: length })

  return (
    <DeviceScreen>
      {error ? <Notice tone="live">{error}</Notice> : null}
      <Section title="Notes">
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
            {NOTES.map((n) => (
              <View key={n.label} style={{ width: '30%', flexGrow: 1 }}>
                <Button variant="secondary" label={n.label} accessibilityLabel={`Play ${n.label}, ${n.hz} hertz`} disabled={!!busy} onPress={() => tone(n.hz)} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            {[150, 300, 800].map((v) => (
              <View key={v} style={{ flex: 1 }}>
                <Button compact variant={ms === v ? 'primary' : 'ghost'} label={`${v} ms`} onPress={() => setMs(v)} />
              </View>
            ))}
          </View>
        </Card>
      </Section>
      <Section title="Chimes">
        <Card>
          {CHIMES.map((c) => (
            <Button key={c.label} variant="secondary" icon="sound" label={c.label} disabled={!!busy} onPress={() => tone(c.hz, c.ms)} />
          ))}
          <Meta>Needs a speaker on the CYD&apos;s speaker header.</Meta>
        </Card>
      </Section>
    </DeviceScreen>
  )
}
