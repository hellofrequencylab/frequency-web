import { useMemo, useState } from 'react'
import { Pressable, View, type GestureResponderEvent } from 'react-native'
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg'
import { DeviceScreen } from '@/components/device-gate'
import { useDeviceAction } from '@/device/DeviceProvider'
import { LED_MODES, type LedColor } from '@/device/types'
import { radius, useTheme } from '@/theme'
import { Button, Card, Meta, Notice, SectionHeader, SegmentedControl, Subheading, useToast } from '@/ui'

// The CYD's RGB LED: a colour wheel for `led.set {r,g,b}` and the modes for `led.mode`. The wheel's
// colours are the LED's own values (data sent to the device), not interface colours.

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

const MODE_LABELS: Record<(typeof LED_MODES)[number], string> = { off: 'Off', solid: 'Solid', rainbow: 'Rainbow', breathe: 'Breathe' }

export default function Led() {
  const { c } = useTheme()
  const toast = useToast()
  const { run, busy, error } = useDeviceAction()
  const [rgb, setRgb] = useState<[number, number, number]>([143, 233, 255])
  const [mode, setMode] = useState<(typeof LED_MODES)[number] | null>(null)
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
    if (out) {
      setMode('solid')
      toast(`LED set to ${hex(rgb).toUpperCase()}`)
    }
  }

  return (
    <DeviceScreen>
      <Card style={{ alignItems: 'center' }}>
        <Pressable onPress={pick} accessibilityLabel="Colour wheel. Tap a colour.">
          <Svg width={SIZE} height={SIZE}>
            <Defs>
              <RadialGradient id="white" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={c.colorWheelNeutral} stopOpacity={1} />
                <Stop offset="1" stopColor={c.colorWheelNeutral} stopOpacity={0} />
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.orb, backgroundColor: hex(rgb), boxShadow: `inset 0px 0px 0px 1px ${c.borderStrong}` }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Subheading>{hex(rgb).toUpperCase()}</Subheading>
            <Meta>
              R {rgb[0]} · G {rgb[1]} · B {rgb[2]}
            </Meta>
          </View>
        </View>
        <Button block variant="primary" icon="check" label="Set the LED" loading={busy === 'led.set'} onPress={send} />
      </Card>
      {error ? <Notice tone="broadcast">{error}</Notice> : null}
      <View style={{ gap: 14 }}>
        <SectionHeader title="Mode" />
        <SegmentedControl
          size="sm"
          value={mode}
          disabled={!!busy}
          onChange={async (m) => {
            const out = await run('led.mode', { mode: m })
            if (out) setMode(m)
          }}
          options={LED_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))}
        />
      </View>
    </DeviceScreen>
  )
}
