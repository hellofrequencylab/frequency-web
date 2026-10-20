import type { ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { gutter, space, useTheme } from '@/theme'
import { Body, Label, Title } from './text'

// The member room's canvas: Commons sand with the background wash (`--wash`, three soft radial orbs at
// the top left, top right and bottom), then the content column with the phone gutter.

const ORBS = [
  { cx: '6%', cy: '0%', rx: '60%', ry: '50%' },
  { cx: '98%', cy: '14%', rx: '50%', ry: '50%' },
  { cx: '70%', cy: '100%', rx: '55%', ry: '50%' },
] as const

export function Wash() {
  const { c } = useTheme()
  const { width, height } = useWindowDimensions()
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        {c.wash.map(([color, opacity], i) => {
          const o = ORBS[i]
          if (!o) return null
          return (
            <RadialGradient key={i} id={`wash${i}`} cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry} gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor={color} stopOpacity={opacity} />
              <Stop offset="0.7" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          )
        })}
      </Defs>
      {c.wash.map((_, i) => (
        <Rect key={i} x="0" y="0" width={width} height={height} fill={`url(#wash${i})`} />
      ))}
    </Svg>
  )
}

type ScreenProps = {
  children: ReactNode
  scroll?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  edges?: Edge[]
}

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

/** The one page header: eyebrow, title, one line of description. */
export function PageHeading({ eyebrow, title, description, right }: { eyebrow?: string; title: string; description?: string; right?: ReactNode }) {
  return (
    <View style={styles.heading}>
      <View style={{ flex: 1, gap: space[3] }}>
        {eyebrow ? <Label>{eyebrow}</Label> : null}
        <Title>{title}</Title>
        {description ? <Body>{description}</Body> : null}
      </View>
      {right}
    </View>
  )
}

/** A titled section within a page (`SectionHeader`). */
export function Section({ title, count, children, action }: { title: string; count?: number; children: ReactNode; action?: ReactNode }) {
  const { c } = useTheme()
  return (
    <View style={{ gap: space[4] }}>
      <View style={styles.sectionHead}>
        <Label color={c.textStrong}>
          {title}
          {count != null ? `  ${count}` : ''}
        </Label>
        {action}
      </View>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  column: { paddingHorizontal: gutter, paddingTop: space[6], paddingBottom: space[11], gap: space[8] },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: space[5] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
