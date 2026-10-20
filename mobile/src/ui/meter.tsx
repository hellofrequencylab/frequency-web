import { useEffect, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { fonts, radius, useTheme, type Palette } from '@/theme'
import { ease, useReducedMotion } from './motion'

// ProgressTrack and Meter (components/ui/progress-track.tsx, meter.tsx; kit-members.css `.meter`).
// A pill track in `--fq-track` with the pastel fill; the width animates over 500ms ease-out.
// Heights sm 4 / md 6 / lg 8 / xl 10 / 2xl 12. Tones swap the pastel for a status hue. Meter adds the
// label and the tabular reading, and turns warning at 80% and danger at 100%.

export type TrackTone = 'pastel' | 'success' | 'warning' | 'danger' | 'signal' | 'broadcast' | 'neutral'
const HEIGHTS = { sm: 4, md: 6, lg: 8, xl: 10, '2xl': 12 } as const

function fill(tone: TrackTone, c: Palette) {
  switch (tone) {
    case 'pastel':
      return { backgroundImage: `linear-gradient(120deg, ${c.pa[0]} 0%, ${c.pa[1]} 60%, ${c.pa[2]} 100%)` }
    case 'signal':
      return { backgroundColor: c.presence }
    case 'broadcast':
      return { backgroundColor: c.live }
    case 'neutral':
      return { backgroundColor: c.borderStrong }
    default:
      return { backgroundColor: c[tone] }
  }
}

export function ProgressTrack({ value, max = 100, size = 'md', tone = 'pastel', label }: { value: number; max?: number; size?: keyof typeof HEIGHTS; tone?: TrackTone; label: string }) {
  const { c } = useTheme()
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const reduced = useReducedMotion()
  const width = useState(() => new Animated.Value(pct))[0]
  useEffect(() => {
    Animated.timing(width, { toValue: pct, duration: reduced ? 0 : 500, easing: ease.out, useNativeDriver: false }).start()
  }, [pct, reduced, width])
  return (
    <View
      style={[styles.track, { height: HEIGHTS[size], backgroundColor: c.track }]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: Math.round(value) }}
    >
      <Animated.View style={[styles.fill, fill(tone, c), { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
    </View>
  )
}

export function Meter({ label, value, max, reading }: { label: string; value: number; max: number; reading?: string }) {
  const { c } = useTheme()
  const ratio = max > 0 ? value / max : 0
  const tone: TrackTone = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warning' : 'pastel'
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.head}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: c.textMuted }}>{label}</Text>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: c.textStrong, fontVariant: ['tabular-nums'] }}>{reading ?? `${value} of ${max}`}</Text>
      </View>
      <ProgressTrack value={value} max={max} size="sm" tone={tone} label={label} />
    </View>
  )
}

const styles = StyleSheet.create({
  track: { borderRadius: radius.orb, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.orb },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
})
