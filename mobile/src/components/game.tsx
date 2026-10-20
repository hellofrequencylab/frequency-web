import { StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import type { LoyaltyCardView } from '@frequency/contract'
import { fonts, radius, space, useTheme } from '@/theme'
import { Icon, type IconName } from './icon'
import { Card } from './ui'
import { Body, Count, Label, Meta, Subheading } from './text'

// The member's game, the only numbers a member page shows (MEMBER-DESIGN-SYSTEM §2): one tile per
// count with its glyph, and the Regulars stamp card.

export function StatTile({ icon, label, value, tone = 'reward' }: { icon: IconName; label: string; value: number | null; tone?: 'reward' | 'live' | 'presence' | 'accent' }) {
  const { c } = useTheme()
  const hue = { reward: c.reward, live: c.live, presence: c.presence, accent: c.accent }[tone]
  const soft = { reward: c.rewardSoft, live: c.liveSoft, presence: c.presenceSoft, accent: c.accentSoft }[tone]
  return (
    <Card style={styles.tile}>
      <View style={[styles.glyph, { backgroundColor: soft }]}>
        <Icon name={icon} size={18} color={hue} />
      </View>
      <Count>{value == null ? '–' : value.toLocaleString()}</Count>
      <Label>{label}</Label>
    </Card>
  )
}

/** The pastel progress bar (`--pa` on `--track`): progress is the pastel accent's job. */
export function Progress({ value, max }: { value: number; max: number }) {
  const { c } = useTheme()
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  return (
    <View style={[styles.track, { backgroundColor: c.track }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: value }}>
      <Svg width={`${pct * 100}%`} height="100%">
        <Defs>
          <LinearGradient id="pa" x1="0" y1="0" x2="1" y2="0">
            {c.pa.map((stop, i) => (
              <Stop key={i} offset={i / (c.pa.length - 1)} stopColor={stop} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={4} fill="url(#pa)" />
      </Svg>
    </View>
  )
}

function money(cents: number): string | null {
  return cents > 0 ? `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}` : null
}

export function StampCard({ card }: { card: LoyaltyCardView }) {
  const { c } = useTheme()
  const value = money(card.rewardValueCents)
  const stamps = Array.from({ length: card.required }, (_, i) => i < card.stamps)
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[4] }}>
        <View style={{ flex: 1, gap: space[2] }}>
          <Subheading>{card.spaceName}</Subheading>
          <Meta>
            {card.rewardTitle || 'A reward from the shop'}
            {value ? ` · ${value}` : ''}
          </Meta>
        </View>
        {card.regular ? (
          <View style={[styles.badge, { backgroundColor: c.rewardSoft }]}>
            <Label color={c.reward}>Regular</Label>
          </View>
        ) : null}
      </View>
      <View style={styles.stamps} accessibilityLabel={`${card.stamps} of ${card.required} stamps`}>
        {stamps.map((filled, i) => (
          <View key={i} style={[styles.stamp, { borderColor: filled ? c.accent : c.borderStrong, backgroundColor: filled ? c.accentSoft : 'transparent' }]}>
            {filled ? <Icon name="checkin" size={18} color={c.accent} /> : null}
          </View>
        ))}
      </View>
      <View style={{ gap: space[3] }}>
        <Progress value={card.stamps} max={card.required} />
        <Meta>
          {card.stamps} of {card.required} stamps
          {card.streakWeeks > 1 ? ` · ${card.streakWeeks} weeks in a row` : ''}
          {card.surpriseOdds > 0 ? ` · 1 in ${card.surpriseOdds} visits earns a surprise stamp` : ''}
        </Meta>
      </View>
      {card.openRewards.map((r) => (
        <View key={r.id} style={[styles.code, { backgroundColor: c.rewardSoft }]}>
          <Icon name="award" size={20} color={c.reward} />
          <View style={{ flex: 1 }}>
            <Meta color={c.reward}>Show this at the counter</Meta>
            <Body style={{ fontFamily: fonts.displayBold, color: c.textStrong, letterSpacing: 2 }} selectable>
              {r.code}
            </Body>
          </View>
        </View>
      ))}
    </Card>
  )
}

const styles = StyleSheet.create({
  tile: { flex: 1, gap: space[3], padding: space[5] },
  glyph: { width: 32, height: 32, borderRadius: radius.orb, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  badge: { borderRadius: radius.orb, paddingHorizontal: space[4], paddingVertical: space[2] },
  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  stamp: { width: 36, height: 36, borderRadius: radius.orb, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  code: { flexDirection: 'row', alignItems: 'center', gap: space[4], borderRadius: radius.m, padding: space[5] },
})
