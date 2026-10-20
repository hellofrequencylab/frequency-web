import { useEffect, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { fonts, radius, useTheme, type Palette } from '@/theme'
import { Icon, type IconName } from './icon'
import { ease, useReducedMotion } from './motion'

// Badge: `.tag` (components/ui/badge.tsx; kit-members.css). A 24pt pill (sm 20) in Hanken 500 12px,
// sentence case, never caps. Base is white at 70% with a hairline ring; tints sit on their soft hue with
// no ring; solids fill. LiveDot is the kit's 7px pastel dot, breathing while something is live.

export type BadgeTone = 'neutral' | 'primary' | 'signal' | 'broadcast' | 'success' | 'warning' | 'danger'

function look(tone: BadgeTone, solid: boolean, c: Palette): { bg: string; fg: string; ring?: string; image?: string } {
  if (solid) {
    if (tone === 'primary') return { bg: 'transparent', fg: c.onPa, image: `linear-gradient(120deg, ${c.pa[0]}, ${c.pa[1]} 60%, ${c.pa[2]})` }
    if (tone === 'signal') return { bg: c.presence, fg: c.onStatus }
    if (tone === 'broadcast') return { bg: c.live, fg: c.onStatus }
    if (tone === 'neutral') return { bg: c.ink, fg: c.card }
    return { bg: c[tone], fg: c.onStatus }
  }
  switch (tone) {
    case 'neutral':
      return { bg: c.tagBg, fg: c.textStrong, ring: c.border }
    case 'primary':
      return { bg: c.accentSoft, fg: c.accent }
    case 'signal':
      return { bg: c.presenceSoft, fg: c.presence }
    case 'broadcast':
      return { bg: c.liveSoft, fg: c.live }
    default:
      return { bg: `${c[tone]}24`, fg: c[tone] }
  }
}

export function Badge({ label, tone = 'neutral', solid, icon, size = 'md', dot }: { label: string; tone?: BadgeTone; solid?: boolean; icon?: IconName; size?: 'sm' | 'md'; dot?: boolean }) {
  const { c } = useTheme()
  const l = look(tone, !!solid, c)
  return (
    <View
      style={[
        styles.tag,
        { height: size === 'sm' ? 20 : 24, paddingHorizontal: size === 'sm' ? 8 : 10, backgroundColor: l.bg },
        l.ring ? { boxShadow: `inset 0px 0px 0px 1px ${l.ring}` } : null,
        l.image ? { backgroundImage: l.image } : null,
      ]}
    >
      {dot ? <LiveDot on /> : null}
      {icon ? <Icon name={icon} size={12} color={l.fg} /> : null}
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 14, color: l.fg }}>{label}</Text>
    </View>
  )
}

/** The kit's 7px live dot in the pastel; it breathes (the brand's breath, 5s) while `on`. */
export function LiveDot({ on }: { on: boolean }) {
  const { c } = useTheme()
  const reduced = useReducedMotion()
  const pulse = useState(() => new Animated.Value(1))[0]
  useEffect(() => {
    if (!on || reduced) {
      pulse.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 2500, easing: ease.breath, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 2500, easing: ease.breath, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [on, reduced, pulse])
  return (
    <Animated.View
      style={[
        styles.dot,
        on ? { backgroundImage: `linear-gradient(120deg, ${c.pa[0]}, ${c.pa[1]} 60%, ${c.pa[2]})`, opacity: pulse, boxShadow: `0px 0px 8px ${c.paGlow}` } : { backgroundColor: c.textFaint },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  tag: { borderRadius: radius.orb, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4 },
})
