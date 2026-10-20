import { useEffect, type ReactNode, useState } from 'react'
import { Animated, StyleSheet, Text, View, type DimensionValue } from 'react-native'
import { fonts, radius, useTheme } from '@/theme'
import { Icon, type IconName } from './icon'
import { useReducedMotion } from './motion'

// The honest states: EmptyState, Skeleton and Notice (components/ui/empty-state.tsx, skeleton.tsx;
// members-ui.css). Never a blank pane: an empty state says why and gives the one next step.

/** EmptyState: a centred column on ink at 2.5%, the 48pt pastel-soft icon chip, an Unbounded 17 title,
 *  a muted line (42ch) and one action. `tone` swaps the chip for the error or cleared look. */
export function EmptyState({ icon, title, description, action, tone = 'default' }: { icon: IconName; title: string; description: string; action?: ReactNode; tone?: 'default' | 'error' | 'cleared' }) {
  const { c } = useTheme()
  const chip =
    tone === 'error'
      ? { backgroundColor: `${c.danger}24`, fg: c.danger }
      : tone === 'cleared'
        ? { backgroundColor: `${c.success}24`, fg: c.success }
        : { backgroundImage: `linear-gradient(120deg, ${c.paSoft[0]}, ${c.paSoft[1]} 50%, ${c.paSoft[2]})`, fg: c.textStrong }
  const { fg, ...chipStyle } = chip
  return (
    <View style={[styles.empty, { backgroundColor: c.fill }]}>
      <View style={[styles.chip, chipStyle]}>
        <Icon name={icon} size={22} color={fg} />
      </View>
      <Text style={{ fontFamily: fonts.display, fontSize: 17, lineHeight: 20, letterSpacing: -0.43, color: c.textStrong, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: c.textMuted, textAlign: 'center', maxWidth: 320 }}>{description}</Text>
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  )
}

/** Skeleton: ink at 6%, pulsing to .55 over 1.6s ease-out (`fq-sk-pulse`); still under reduced motion. */
export function Skeleton({ width = '100%', height = 16, round = radius.m }: { width?: DimensionValue; height?: number; round?: number }) {
  const { c } = useTheme()
  const reduced = useReducedMotion()
  const o = useState(() => new Animated.Value(1))[0]
  useEffect(() => {
    if (reduced) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 0.55, duration: 800, useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [reduced, o])
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, height, borderRadius: round, backgroundColor: c.track, opacity: o }} />
}

/** Notice: one quiet line of status on a soft tint, with an optional bold first line. */
export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'signal' | 'broadcast' | 'warning' | 'danger' | 'success'; title?: string; children?: ReactNode }) {
  const { c } = useTheme()
  const t = {
    info: { bg: c.accentSoft, fg: c.accent },
    signal: { bg: c.presenceSoft, fg: c.presence },
    broadcast: { bg: c.liveSoft, fg: c.live },
    warning: { bg: `${c.warning}24`, fg: c.warning },
    danger: { bg: `${c.danger}24`, fg: c.danger },
    success: { bg: `${c.success}24`, fg: c.success },
  }[tone]
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      {title ? <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: t.fg }}>{title}</Text> : null}
      {typeof children === 'string' ? <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: c.text }}>{children}</Text> : children}
    </View>
  )
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 24, borderRadius: radius.l },
  chip: { width: 48, height: 48, borderRadius: radius.orb, alignItems: 'center', justifyContent: 'center' },
  notice: { borderRadius: radius.m, paddingVertical: 12, paddingHorizontal: 16, gap: 4 },
})
