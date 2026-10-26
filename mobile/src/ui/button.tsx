import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { fonts, radius, useTheme, type Palette } from '@/theme'
import { Icon, type IconName } from './icon'
import { usePressScale } from './motion'

// Button: the web's `.btn` (components/ui/button.tsx under the Frequency design, kit-members.css).
// A pill with no border. Variants:
//   primary    `.pa`        the pastel with ink text and its glow. ONE per screen.
//   soft       `mu-soft`    the soft pastel, ink text.
//   secondary  `.btn`       transparent with a 1px inset ring in border-strong.
//   ink        `.ink`       solid ink, card-colour text.
//   ghost      `.txt`       muted text only; turns strong on press.
//   danger / dangerOutline  the status hue, solid or as a ring.
// Sizes xs 32 / sm 36 / md 44 / lg 48. Press scales to .97 (fast, ease-out). Disabled fades to .4.
// Loading keeps the label (and the width) and adds a small spinner: it never swaps the label out.

export type ButtonVariant = 'primary' | 'soft' | 'secondary' | 'ink' | 'ghost' | 'danger' | 'dangerOutline'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

const SIZES: Record<ButtonSize, { height: number; padding: number; font: number; icon: number }> = {
  xs: { height: 32, padding: 12, font: 13, icon: 14 },
  sm: { height: 36, padding: 14, font: 14, icon: 15 },
  md: { height: 44, padding: 20, font: 15, icon: 16 },
  lg: { height: 48, padding: 24, font: 15, icon: 16 },
}

function recipe(v: ButtonVariant, c: Palette): { style: ViewStyle; fg: string; weight: string } {
  switch (v) {
    case 'primary':
      return {
        style: {
          backgroundImage: `linear-gradient(120deg, ${c.pa[0]} 0%, ${c.pa[1]} 60%, ${c.pa[2]} 100%)`,
          boxShadow: `0px 12px 28px -14px ${c.paGlow}, inset 0px 0px 0px 1px ${c.paRim}`,
        },
        fg: c.onPa,
        weight: fonts.sansSemiBold,
      }
    case 'soft':
      return { style: { backgroundImage: `linear-gradient(120deg, ${c.paSoft[0]}, ${c.paSoft[1]} 50%, ${c.paSoft[2]})` }, fg: c.textStrong, weight: fonts.sansMedium }
    case 'secondary':
      return { style: { boxShadow: `inset 0px 0px 0px 1px ${c.borderStrong}` }, fg: c.textStrong, weight: fonts.sansMedium }
    case 'ink':
      return { style: { backgroundColor: c.ink }, fg: c.card, weight: fonts.sansMedium }
    case 'ghost':
      return { style: {}, fg: c.textMuted, weight: fonts.sansMedium }
    case 'danger':
      return { style: { backgroundColor: c.danger }, fg: c.onStatus, weight: fonts.sansMedium }
    case 'dangerOutline':
      return { style: { boxShadow: `inset 0px 0px 0px 1px ${c.danger}` }, fg: c.danger, weight: fonts.sansMedium }
  }
}

type Props = {
  label: string
  onPress?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  loading?: boolean
  disabled?: boolean
  /** Stretch to the row's width. */
  block?: boolean
  accessibilityLabel?: string
}

export function Button({ label, onPress, variant = 'secondary', size = 'md', icon, loading, disabled, block, accessibilityLabel }: Props) {
  const { c } = useTheme()
  const s = SIZES[size]
  const r = recipe(variant, c)
  const off = !!disabled || !!loading
  const press = usePressScale()
  return (
    <Animated.View style={[{ transform: [{ scale: press.scale }], opacity: disabled ? 0.4 : 1 }, block ? styles.block : styles.inline]}>
      <Pressable
        onPress={off ? undefined : onPress}
        onPressIn={off ? undefined : press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: off, busy: !!loading }}
        hitSlop={s.height < 44 ? (44 - s.height) / 2 : undefined}
        style={[styles.base, { height: s.height, paddingHorizontal: variant === 'ghost' ? 10 : s.padding }, r.style]}
      >
        {loading ? <ActivityIndicator size="small" color={r.fg} /> : icon ? <Icon name={icon} size={s.icon} color={r.fg} /> : null}
        <Text style={{ fontFamily: r.weight, fontSize: s.font, lineHeight: s.font + 2, color: r.fg }}>{label}</Text>
      </Pressable>
    </Animated.View>
  )
}

/** A row of buttons with the kit's 8px gap; each child takes an equal share. */
export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.orb, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  inline: { alignSelf: 'flex-start' },
  block: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
})
