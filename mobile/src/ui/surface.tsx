import type { ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { radius, shadow, useTheme } from '@/theme'

// The three surfaces of the members kit (kit-members.css):
//   Panel  `.panel`  the glass panel: a warm translucent gradient, the long soft lift and a white inset
//                    rim (radius 24, padding 24, 18 on a phone). Native has no backdrop blur on Android,
//                    so the gradient and rim carry it, which is how the web degrades too.
//   Card   `.card`   solid raised surface, radius 24, the card lift and a hairline rim.
//   Soft   `.soft`   the soft pastel block, radius 28, for a quiet callout.

type Props = { children: ReactNode; style?: ViewStyle; padded?: boolean; gap?: number }

export function Panel({ children, style, padded = true, gap = 14 }: Props) {
  const { c, scheme } = useTheme()
  return (
    <View
      style={[
        styles.round,
        {
          backgroundImage: `linear-gradient(150deg, ${c.glass[0]}, ${c.glass[1]})`,
          boxShadow: `${scheme === 'dark' ? shadow.panelNight : shadow.panel}, inset 0px 0px 0px 1px ${c.glassRim}`,
          gap,
        },
        padded && styles.pad,
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function Card({ children, style, padded = true, gap = 14 }: Props) {
  const { c } = useTheme()
  return <View style={[styles.round, { backgroundColor: c.raised, boxShadow: `${shadow.card}, inset 0px 0px 0px 1px ${c.border}`, gap }, padded && styles.pad, style]}>{children}</View>
}

export function Soft({ children, style, gap = 10 }: Omit<Props, 'padded'>) {
  const { c } = useTheme()
  return (
    <View style={[{ borderRadius: radius.sheet, padding: 22, gap, backgroundImage: `linear-gradient(120deg, ${c.paSoft[0]}, ${c.paSoft[1]} 50%, ${c.paSoft[2]})` }, style]}>{children}</View>
  )
}

const styles = StyleSheet.create({
  round: { borderRadius: radius.l },
  pad: { padding: 18 },
})
