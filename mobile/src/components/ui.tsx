import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'
import { fonts, hitMin, radius, shadow, space, type, useTheme } from '@/theme'
import { Icon, type IconName } from './icon'
import { Body, BodySmall, Meta, Subheading } from './text'

// The kit, in the member register: warm canvas, linen cards with a hairline and the soft lift,
// one violet action per view, sentence case everywhere.

export function Card({ children, style, padded = true }: { children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  const { c } = useTheme()
  return (
    <View style={[styles.card, shadow[1], { backgroundColor: c.card, borderColor: c.border }, padded && styles.cardPad, style]}>{children}</View>
  )
}

type ButtonProps = {
  label: string
  onPress?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: IconName
  busy?: boolean
  disabled?: boolean
  compact?: boolean
  accessibilityLabel?: string
}

export function Button({ label, onPress, variant = 'primary', icon, busy, disabled, compact, accessibilityLabel }: ButtonProps) {
  const { c } = useTheme()
  const palette = {
    primary: { bg: c.action, fg: c.actionText, border: c.action },
    secondary: { bg: c.raised, fg: c.textStrong, border: c.borderStrong },
    ghost: { bg: 'transparent', fg: c.link, border: 'transparent' },
    danger: { bg: 'transparent', fg: c.danger, border: c.danger },
  }[variant]
  const off = disabled || busy
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={palette.fg} /> : icon ? <Icon name={icon} size={18} color={palette.fg} /> : null}
      <Body style={{ fontFamily: fonts.sansSemiBold, color: palette.fg }}>{label}</Body>
    </Pressable>
  )
}

/** A dense list row (`RowCard` link-row mode): the whole row is the target. */
export function Row({ icon, title, detail, trailing, onPress, tint }: { icon?: IconName; title: string; detail?: string; trailing?: ReactNode; onPress?: () => void; tint?: string }) {
  const { c } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.sunken : 'transparent' }]}
    >
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: c.accentSoft }]}>
          <Icon name={icon} size={20} color={tint ?? c.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Body style={{ fontFamily: fonts.sansSemiBold, color: c.textStrong }}>{title}</Body>
        {detail ? <Meta>{detail}</Meta> : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron" size={18} color={c.textFaint} /> : null)}
    </Pressable>
  )
}

/** Quiet inline status. `tone` picks the crossover hue that means it. */
export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'live' | 'reward' | 'danger' | 'presence'; title?: string; children?: ReactNode }) {
  const { c } = useTheme()
  const t = {
    info: { bg: c.accentSoft, fg: c.accent },
    live: { bg: c.liveSoft, fg: c.live },
    reward: { bg: c.rewardSoft, fg: c.reward },
    presence: { bg: c.presenceSoft, fg: c.presence },
    danger: { bg: c.liveSoft, fg: c.danger },
  }[tone]
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }]} accessibilityRole="alert">
      {title ? <Body style={{ fontFamily: fonts.sansSemiBold, color: t.fg }}>{title}</Body> : null}
      {typeof children === 'string' ? <BodySmall>{children}</BodySmall> : children}
    </View>
  )
}

/** Never a blank pane: say what is missing and the one next step. */
export function EmptyState({ icon, title, description, action }: { icon: IconName; title: string; description: string; action?: ReactNode }) {
  const { c } = useTheme()
  return (
    <Card style={{ alignItems: 'center', gap: space[4], paddingVertical: space[9] }}>
      <View style={[styles.emptyOrb, { backgroundColor: c.accentSoft }]}>
        <Icon name={icon} size={26} color={c.accent} />
      </View>
      <Subheading align="center">{title}</Subheading>
      <BodySmall align="center" color={c.textMuted}>
        {description}
      </BodySmall>
      {action}
    </Card>
  )
}

/** The one view switcher (`SegmentedControl`): one bordered box, the selected segment filled. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; icon?: IconName }[]; onChange: (v: T) => void }) {
  const { c } = useTheme()
  return (
    <View style={[styles.segmented, { borderColor: c.borderStrong, backgroundColor: c.raised }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.segment, on && { backgroundColor: c.action }]}
          >
            {o.icon ? <Icon name={o.icon} size={16} color={on ? c.actionText : c.text} /> : null}
            <BodySmall style={{ fontFamily: fonts.sansSemiBold, color: on ? c.actionText : c.text }}>{o.label}</BodySmall>
          </Pressable>
        )
      })}
    </View>
  )
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { c } = useTheme()
  return (
    <View style={{ gap: space[3] }}>
      <Meta color={c.textStrong}>{label}</Meta>
      <TextInput
        placeholderTextColor={c.textFaint}
        accessibilityLabel={label}
        {...props}
        style={[styles.input, { borderColor: c.borderStrong, backgroundColor: c.raised, color: c.textStrong }, props.style]}
      />
    </View>
  )
}

/** A small rounded tag (`Pill`). */
export function Chip({ label, tone = 'info' }: { label: string; tone?: 'info' | 'live' | 'reward' | 'presence' | 'muted' }) {
  const { c } = useTheme()
  const t = {
    info: { bg: c.accentSoft, fg: c.accent },
    live: { bg: c.liveSoft, fg: c.live },
    reward: { bg: c.rewardSoft, fg: c.reward },
    presence: { bg: c.presenceSoft, fg: c.presence },
    muted: { bg: c.sunken, fg: c.textMuted },
  }[tone]
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      <Meta style={{ color: t.fg, fontFamily: fonts.sansSemiBold }}>{label}</Meta>
    </View>
  )
}

/** A live dot: the pastel accent's job (presence, connection). */
export function LiveDot({ on }: { on: boolean }) {
  const { c } = useTheme()
  return <View style={[styles.dot, { backgroundColor: on ? c.presence : c.textFaint }]} />
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.l, borderWidth: StyleSheet.hairlineWidth },
  cardPad: { padding: space[6], gap: space[5] },
  button: {
    minHeight: hitMin + 4,
    borderRadius: radius.orb,
    borderWidth: 1,
    paddingHorizontal: space[7],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  buttonCompact: { minHeight: hitMin, paddingHorizontal: space[5] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[5], minHeight: hitMin + 12, paddingVertical: space[3], paddingHorizontal: space[3], borderRadius: radius.m },
  rowIcon: { width: 40, height: 40, borderRadius: radius.orb, alignItems: 'center', justifyContent: 'center' },
  notice: { borderRadius: radius.m, padding: space[5], gap: space[2] },
  emptyOrb: { width: 56, height: 56, borderRadius: radius.orb, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.m, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: hitMin - 4, borderRadius: radius.m - 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  input: { minHeight: hitMin + 4, borderWidth: 1, borderRadius: radius.m, paddingHorizontal: space[5], fontFamily: fonts.sans, fontSize: type.body.fontSize },
  chip: { borderRadius: radius.orb, paddingHorizontal: space[4], paddingVertical: space[2], alignSelf: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4 },
})
