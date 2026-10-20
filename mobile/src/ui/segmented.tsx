import { Pressable, StyleSheet, Text, View } from 'react-native'
import { fonts, radius, useTheme } from '@/theme'
import { Icon, type IconName } from './icon'

// SegmentedControl: `.mu-seg` (components/ui/segmented-control.tsx, the ONE view-switcher form, HYG-105).
// A pill track of ink at 4% with 4px padding; segments are 36pt pills (md 40) in Hanken 500 14px, muted;
// the selected one is filled solid ink with card-colour text. `vertical` stacks rows (box radius 20,
// rows 40 high, radius 16, left-aligned), which the Light Show scene list uses.

type Option<T extends string> = { value: T; label: string; icon?: IconName }

export function SegmentedControl<T extends string>({ value, options, onChange, size = 'md', vertical, disabled }: { value: T | null; options: Option<T>[]; onChange: (v: T) => void; size?: 'sm' | 'md'; vertical?: boolean; disabled?: boolean }) {
  const { c } = useTheme()
  const h = vertical ? 40 : size === 'md' ? 40 : 36
  return (
    <View style={[vertical ? styles.trackV : styles.track, { backgroundColor: c.fill, opacity: disabled ? 0.5 : 1 }]} accessibilityRole={vertical ? 'radiogroup' : 'tablist'}>
      {options.map((o) => {
        const on = o.value === value
        const fg = on ? c.card : c.textMuted
        return (
          <Pressable
            key={o.value}
            onPress={disabled ? undefined : () => onChange(o.value)}
            accessibilityRole={vertical ? 'radio' : 'tab'}
            accessibilityState={{ selected: on, checked: on, disabled: !!disabled }}
            hitSlop={{ top: (44 - h) / 2, bottom: (44 - h) / 2 }}
            style={({ pressed }) => [
              vertical ? styles.rowV : styles.seg,
              { height: h, paddingHorizontal: size === 'md' ? 16 : 14 },
              on ? { backgroundColor: c.ink } : pressed ? { backgroundColor: c.raised } : null,
            ]}
          >
            {o.icon ? <Icon name={o.icon} size={16} color={fg} /> : null}
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: fg }}>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 4, gap: 2, borderRadius: radius.orb },
  seg: { flex: 1, borderRadius: radius.orb, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  trackV: { padding: 4, gap: 2, borderRadius: 20 },
  rowV: { borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
})
