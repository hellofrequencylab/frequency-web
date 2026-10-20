import { Animated, Pressable } from 'react-native'
import { radius, useTheme } from '@/theme'
import { Icon, type IconName } from './icon'
import { usePressScale } from './motion'

// IconButton (components/ui/icon-button.tsx): a round icon-only control, at least 44pt to tap.
//   plain     muted glyph, no fill
//   bordered  1px hairline ring
//   filled    ink fill, canvas glyph
//   tinted    accent-soft fill, accent glyph
// `label` is required: it is the accessible name (an icon alone says nothing to a screen reader).

export type IconButtonVariant = 'plain' | 'bordered' | 'filled' | 'tinted'

export function IconButton({ icon, label, onPress, variant = 'plain', size = 40, disabled }: { icon: IconName; label: string; onPress?: () => void; variant?: IconButtonVariant; size?: number; disabled?: boolean }) {
  const { c } = useTheme()
  const press = usePressScale(0.94)
  const look = {
    plain: { bg: 'transparent', fg: c.textMuted, ring: 'transparent' },
    bordered: { bg: 'transparent', fg: c.textMuted, ring: c.border },
    filled: { bg: c.ink, fg: c.onInk, ring: 'transparent' },
    tinted: { bg: c.accentSoft, fg: c.accent, ring: 'transparent' },
  }[variant]
  return (
    <Animated.View style={{ transform: [{ scale: press.scale }], opacity: disabled ? 0.5 : 1 }}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        hitSlop={size < 44 ? (44 - size) / 2 : undefined}
        style={{ width: size, height: size, borderRadius: radius.orb, alignItems: 'center', justifyContent: 'center', backgroundColor: look.bg, boxShadow: `inset 0px 0px 0px 1px ${look.ring}` }}
      >
        <Icon name={icon} size={Math.round(size / 2)} color={look.fg} />
      </Pressable>
    </Animated.View>
  )
}
