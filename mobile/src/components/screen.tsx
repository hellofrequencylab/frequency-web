import type { ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { gutter, useTheme } from '@/theme'
import { Body, Label, Title } from '@/ui'

// The member room's canvas: the Commons canvas with the background wash (`--wash`, soft radial orbs at
// the top left, top right and bottom, `.fq-wash`), then the content column with the phone gutter.

const ORB_AT = ['6% 0%', '98% 14%', '70% 100%']

export function Wash() {
  const { c } = useTheme()
  const layers = c.wash
    .map(([color, opacity], i) => {
      const a = Math.round(opacity * 255)
        .toString(16)
        .padStart(2, '0')
      return `radial-gradient(circle at ${ORB_AT[i] ?? '50% 50%'}, ${color}${a} 0%, ${color}00 60%)`
    })
    .join(', ')
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundImage: layers }]} />
}

type ScreenProps = { children: ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; edges?: Edge[] }

export function Screen({ children, scroll = true, refreshing, onRefresh, edges = ['top'] }: ScreenProps) {
  const { c } = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <Wash />
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.column}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} /> : undefined}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.column, { flex: 1 }]}>{children}</View>
        )}
      </SafeAreaView>
    </View>
  )
}

/** The one page header: `.k` eyebrow, the title, one line of description, an optional action. */
export function PageHeading({ eyebrow, title, description, right }: { eyebrow?: string; title: string; description?: string; right?: ReactNode }) {
  const { c } = useTheme()
  return (
    <View style={styles.heading}>
      <View style={{ flex: 1, gap: 8 }}>
        {eyebrow ? <Label>{eyebrow}</Label> : null}
        <Title>{title}</Title>
        {description ? <Body color={c.textMuted}>{description}</Body> : null}
      </View>
      {right}
    </View>
  )
}

const styles = StyleSheet.create({
  column: { paddingHorizontal: gutter, paddingTop: 20, paddingBottom: 64, gap: 24 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
})
