import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native'
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg'
import { DeviceScreen } from '@/components/device-gate'
import { Section } from '@/components/screen'
import { Meta, Subheading } from '@/components/text'
import { Button, Card, Notice, Segmented } from '@/components/ui'
import { useDeviceAction } from '@/device/DeviceProvider'
import { LED_MODES, type LedColor } from '@/device/types'
import { space, useTheme } from '@/theme'

// The CYD's RGB LED: a colour wheel for `led.set {r,g,b}` and the modes for `led.mode`. The colours
// here are the LED's own values (data sent to the device), not interface colours.

const SIZE = 260
const R = SIZE / 2
const SEGMENTS = 72

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))))
  }
  return [f(5), f(3), f(1)]
}

const hex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`

function wedge(i: number): string {
  const a0 = ((i - 0.5) / SEGMENTS) * 2 * Math.PI
  const a1 = ((i + 0.6) / SEGMENTS) * 2 * Math.PI
  return `M${R},${R} L${R + R * Math.cos(a0)},${R + R * Math.sin(a0)} A${R},${R} 0 0 1 ${R + R * Math.cos(a1)},${R + R * Math.sin(a1)} Z`
}

export default function Led() {
  const { c } = useTheme()
  const { run, busy, error } = useDeviceAction()
  const [rgb, setRgb] = useState<[number, number, number]>([255, 43, 214])
  const [mode, setMode] = useState<(typeof LED_MODES)[number]>('solid')
  const wedges = useMemo(() => Array.from({ length: SEGMENTS }, (_, i) => ({ d: wedge(i), fill: hex(hsvToRgb((i / SEGMENTS) * 360, 1, 1)) })), [])

  const pick = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX - R
    const y = e.nativeEvent.locationY - R
    const dist = Math.min(1, Math.hypot(x, y) / R)
    const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
    setRgb(hsvToRgb(hue, dist, 1))
  }

  const send = async () => {
    const out = await run<LedColor>('led.set', { r: rgb[0], g: rgb[1], b: rgb[2] })
    if (out) setMode('solid')
  }

  return (
    <DeviceScreen>
      <Card style={{ alignItems: 'center' }}>
        <Pressable onPress={pick} accessibilityLabel="Colour wheel. Tap a colour.">
          <Svg width={SIZE} height={SIZE}>
            <Defs>
              <RadialGradient id="white" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <G>
              {wedges.map((w, i) => (
                <Path key={i} d={w.d} fill={w.fill} />
              ))}
            </G>
            <Circle cx={R} cy={R} r={R} fill="url(#white)" />
          </Svg>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], alignSelf: 'stretch' }}>
          <View style={[styles.swatch, { backgroundColor: hex(rgb), borderColor: c.borderStrong }]} />
          <View style={{ flex: 1 }}>
            <Subheading>{hex(rgb).toUpperCase()}</Subheading>
            <Meta>
              R {rgb[0]} · G {rgb[1]} · B {rgb[2]}
            </Meta>
          </View>
        </View>
        <View style={{ alignSelf: 'stretch' }}>
          <Button label="Set the LED" busy={busy === 'led.set'} onPress={send} />
        </View>
      </Card>
      {error ? <Notice tone="live">{error}</Notice> : null}
      <Section title="Mode">
        <Segmented
          value={mode}
          onChange={async (m) => {
            const out = await run('led.mode', { mode: m })
            if (out) setMode(m)
          }}
          options={LED_MODES.map((m) => ({ value: m, label: m[0]!.toUpperCase() + m.slice(1) }))}
        />
      </Section>
    </DeviceScreen>
  )
}

const styles = StyleSheet.create({
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 1 },
})
