import { useEffect, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { fonts, radius, useTheme } from '@/theme'
import { ease, useDuration } from './motion'

// Field (components/ui/field.tsx, kit-members.css `.field` / `.input` / `.sw`).
// A column with an 8px gap: the label (Hanken 500 13 muted), the input, then a hint or an error.
// The input is 48pt, radius 16, no border, filled with ink at 4%, Hanken 16 on a phone. Focus draws a
// 2px ring in the focus colour; an error draws it in danger at 55%.

type FieldProps = TextInputProps & { label: string; hint?: string; error?: string | null; trailing?: React.ReactNode }

export function Field({ label, hint, error, trailing, multiline, style, ...input }: FieldProps) {
  const { c } = useTheme()
  const [focused, setFocused] = useState(false)
  const ring = error ? `${c.danger}8C` : focused ? c.focus : 'transparent'
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: c.textMuted }}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={c.textFaint}
          multiline={multiline}
          {...input}
          onFocus={(e) => {
            setFocused(true)
            input.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            input.onBlur?.(e)
          }}
          style={[
            styles.input,
            multiline ? styles.textarea : null,
            { backgroundColor: c.fill, color: c.textStrong, boxShadow: `0px 0px 0px 2px ${ring}` },
            style,
          ]}
        />
        {trailing}
      </View>
      {error ? (
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18, color: c.danger }} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: c.textMuted }}>{hint}</Text>
      ) : null}
    </View>
  )
}

/** Switch `.sw`: a 46×28 track, a 22pt white knob; on, the track turns pastel and the knob slides 18. */
export function Switch({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const { c } = useTheme()
  const ms = useDuration('base')
  const x = useState(() => new Animated.Value(value ? 18 : 0))[0]
  useEffect(() => {
    Animated.timing(x, { toValue: value ? 18 : 0, duration: ms, easing: ease.out, useNativeDriver: true }).start()
  }, [value, ms, x])
  return (
    <Pressable
      onPress={disabled ? undefined : () => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      hitSlop={8}
      style={[
        styles.sw,
        { opacity: disabled ? 0.5 : 1 },
        value ? { backgroundImage: `linear-gradient(120deg, ${c.pa[0]}, ${c.pa[1]} 60%, ${c.pa[2]})` } : { backgroundColor: c.track },
      ]}
    >
      <Animated.View style={[styles.knob, { transform: [{ translateX: x }] }]} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, height: 48, borderRadius: radius.m, paddingHorizontal: 18, fontFamily: fonts.sans, fontSize: 16 },
  textarea: { height: undefined, minHeight: 110, paddingVertical: 14, lineHeight: 24, textAlignVertical: 'top' },
  sw: { width: 46, height: 28, borderRadius: radius.orb, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, marginLeft: 3, backgroundColor: '#FFFFFF', boxShadow: '0px 1px 3px rgba(30,27,24,0.25)' },
})
