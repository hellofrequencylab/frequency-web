import { StyleSheet, View } from 'react-native'
import type { LoyaltyCardView } from '@frequency/contract'
import { fonts, radius, useTheme } from '@/theme'
import { Badge, Body, Card, Count, Icon, Label, Meta, ProgressTrack, Subheading, type IconName } from '@/ui'

// The member's game on the Frequency tab (docs/MOBILE-APP.md §6): one tile per count with its glyph, and
// the Regulars stamp card as the web's /rewards draws it. Built from the kit; the stamp orbs are the one
// domain graphic, in the kit's radii and hues (the pastel is kept for progress).

type Tone = 'primary' | 'signal' | 'broadcast'

export function StatTile({ icon, label, value, tone = 'primary' }: { icon: IconName; label: string; value: number | null; tone?: Tone }) {
  const { c } = useTheme()
  const hue = { primary: c.accent, signal: c.presence, broadcast: c.live }[tone]
  const soft = { primary: c.accentSoft, signal: c.presenceSoft, broadcast: c.liveSoft }[tone]
  return (
    <Card style={styles.tile} gap={8}>
      <View style={[styles.glyph, { backgroundColor: soft }]}>
        <Icon name={icon} size={16} color={hue} />
      </View>
      <Count accessibilityLabel={`${label}: ${value ?? 'none'}`}>{value == null ? '–' : value.toLocaleString()}</Count>
      <Label>{label}</Label>
    </Card>
  )
}

function money(cents: number): string | null {
  return cents > 0 ? `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}` : null
}

export function StampCard({ card }: { card: LoyaltyCardView }) {
  const { c } = useTheme()
  const value = money(card.rewardValueCents)
  const stamps = Array.from({ length: card.required }, (_, i) => i < card.stamps)
  const notes = [
    `${card.stamps} of ${card.required} stamps`,
    card.streakWeeks > 1 ? `${card.streakWeeks} weeks in a row` : null,
    card.surpriseOdds > 0 ? `1 in ${card.surpriseOdds} visits earns a surprise stamp` : null,
  ].filter((n): n is string => !!n)
  return (
    <Card>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Subheading>{card.spaceName}</Subheading>
          <Meta>{[card.rewardTitle || 'A reward from the shop', value].filter(Boolean).join(' · ')}</Meta>
        </View>
        {card.regular ? <Badge label="Regular" tone="primary" icon="standing" /> : null}
      </View>
      <View style={styles.stamps} accessibilityLabel={`${card.stamps} of ${card.required} stamps`}>
        {stamps.map((filled, i) => (
          <View key={i} style={[styles.stamp, { boxShadow: `inset 0px 0px 0px 1.5px ${filled ? c.accent : c.borderStrong}`, backgroundColor: filled ? c.accentSoft : 'transparent' }]}>
            {filled ? <Icon name="checkin" size={18} color={c.accent} /> : null}
          </View>
        ))}
      </View>
      <View style={{ gap: 8 }}>
        <ProgressTrack value={card.stamps} max={card.required} size="lg" label={`${card.spaceName} stamp card`} />
        <Meta>{notes.join(' · ')}</Meta>
      </View>
      {card.openRewards.map((r) => (
        <View key={r.id} style={[styles.code, { backgroundColor: c.accentSoft }]}>
          <Icon name="award" size={20} color={c.accent} />
          <View style={{ flex: 1, gap: 2 }}>
            <Meta color={c.accent}>Show this at the counter</Meta>
            <Body selectable style={{ fontFamily: fonts.display, color: c.textStrong, letterSpacing: 2, lineHeight: 22 }}>
              {r.code}
            </Body>
          </View>
        </View>
      ))}
    </Card>
  )
}

const styles = StyleSheet.create({
  tile: { flex: 1, padding: 16 },
  glyph: { width: 32, height: 32, borderRadius: radius.orb, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stamp: { width: 36, height: 36, borderRadius: radius.orb, alignItems: 'center', justifyContent: 'center' },
  code: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.m, padding: 16 },
})
