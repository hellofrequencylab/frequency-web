import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { fonts, radius, useTheme } from '@/theme'
import { Icon, type IconName } from './icon'

// SectionHeader, Row, Counter and StageTimeline (components/ui/section-header.tsx, counter.tsx,
// stage-timeline.tsx; kit-members.css `.sec-h`).

/** `.sec-h`: an Unbounded 22 title, a muted tabular count, and an optional action at the right. */
export function SectionHeader({ title, count, action }: { title: string; count?: number; action?: ReactNode }) {
  const { c } = useTheme()
  return (
    <View style={styles.secH}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flex: 1 }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 24, letterSpacing: -0.77, color: c.textStrong }}>
          {title}
        </Text>
        {count != null ? <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: c.textMuted, fontVariant: ['tabular-nums'] }}>{count}</Text> : null}
      </View>
      {action}
    </View>
  )
}

/** A dense list row (`RowCard`, link-row mode): the 40pt icon tile, a title and one muted line, and a
 *  passive trailing element. The whole row is the target. */
export function Row({ icon, title, detail, trailing, onPress, selected }: { icon?: IconName; title: string; detail?: string; trailing?: ReactNode; onPress?: () => void; selected?: boolean }) {
  const { c } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={selected != null ? { selected } : undefined}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed || selected ? c.fill : 'transparent' }]}
    >
      {icon ? (
        <View style={[styles.tile, { backgroundColor: c.raised, boxShadow: `inset 0px 0px 0px 1px ${c.border}, 0px 0px 24px -6px ${c.accent2}55` }]}>
          <Icon name={icon} size={20} color={c.accent2} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, lineHeight: 20, color: c.textStrong }}>{title}</Text>
        {detail ? <Text style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: c.textMuted }}>{detail}</Text> : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron" size={16} color={c.textFaint} /> : null)}
    </Pressable>
  )
}

/** Counter: a stacked number with its label and glyph. A zero is muted, never red. */
export function Counter({ value, label, icon, unit }: { value: number | string | null; label: string; icon?: IconName; unit?: string }) {
  const { c } = useTheme()
  const zero = value === 0 || value == null
  return (
    <View style={{ gap: 4, flex: 1 }} accessibilityLabel={`${label}: ${value ?? 'none'}${unit ?? ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <Icon name={icon} size={14} color={c.textMuted} /> : null}
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: c.textMuted }}>{label}</Text>
      </View>
      <Text style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.8, color: zero ? c.textMuted : c.textStrong, fontVariant: ['tabular-nums'] }}>
        {value ?? '–'}
        {value != null && unit ? <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: c.textMuted }}> {unit}</Text> : null}
      </Text>
    </View>
  )
}

export type Stage = { key: string; label: string; state: 'done' | 'current' | 'upcoming' }

/** StageTimeline: pills at the small button size. Current is accent-soft with an ink ring; done is
 *  surface with a hairline and a success check; upcoming is dashed and muted. */
export function StageTimeline({ stages }: { stages: Stage[] }) {
  const { c } = useTheme()
  return (
    <View style={styles.stages} accessibilityRole="list">
      {stages.map((s) => {
        const look =
          s.state === 'current'
            ? { bg: c.accentSoft, fg: c.accent, border: c.ink, style: 'solid' as const, glyphBg: c.ink, glyphFg: c.onInk }
            : s.state === 'done'
              ? { bg: c.raised, fg: c.text, border: c.border, style: 'solid' as const, glyphBg: `${c.success}24`, glyphFg: c.success }
              : { bg: 'transparent', fg: c.textMuted, border: c.borderStrong, style: 'dashed' as const, glyphBg: c.fill, glyphFg: c.textMuted }
        return (
          <View key={s.key} style={[styles.stage, { backgroundColor: look.bg, borderColor: look.border, borderStyle: look.style }]} accessibilityLabel={`${s.label}, ${s.state}`}>
            <View style={[styles.glyph, { backgroundColor: look.glyphBg }]}>{s.state === 'done' ? <Icon name="check" size={11} color={look.glyphFg} /> : null}</View>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: look.fg }}>
              {s.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  secH: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.m },
  tile: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stages: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stage: { height: 36, paddingHorizontal: 14, borderRadius: radius.orb, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  glyph: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
})
