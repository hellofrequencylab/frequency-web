import { ActivityIndicator, View } from 'react-native'
import { router } from 'expo-router'
import { StampCard, StatTile } from '@/components/game'
import { PageHeading, Screen, Section } from '@/components/screen'
import { Button, EmptyState, Notice } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useRemote } from '@/lib/use-remote'
import { space, useTheme } from '@/theme'

// What the web's /rewards shows (app/(main)/rewards/page.tsx): every Regulars card the member holds,
// with any reward code waiting to be collected. Read through GET /api/v1/rewards.

export default function Rewards() {
  const { session } = useAuth()
  const { c } = useTheme()
  const { data, error, refreshing, refresh } = useRemote(session ? session.user.id : null, api.rewards)

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={session ? refresh : undefined}
    >
      <PageHeading title="Rewards" description="Your stamp cards at the places you check in. A full card earns the reward the shop set." />

      {!session ? (
        <EmptyState icon="award" title="Sign in to see your cards." description="Your stamp cards and reward codes live on your Frequency account." action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />} />
      ) : error ? (
        <Notice tone="danger">{error}</Notice>
      ) : !data ? (
        <ActivityIndicator color={c.accent} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: space[4] }}>
            <StatTile icon="zap" label="Season Zaps" value={data.seasonZaps} />
            <StatTile icon="streak" label="Streak" value={data.streak} tone="live" />
          </View>
          {!data.enabled ? (
            <Notice tone="info" title="Regulars is not open yet">
              Stamp cards switch on soon. Your check-ins still earn Zaps.
            </Notice>
          ) : data.cards.length === 0 ? (
            <EmptyState
              icon="checkin"
              title="No cards yet."
              description="Check in at a shop that runs Regulars and your first card lands here, with 25 Zaps for the visit."
              action={<Button label="Check in" icon="checkin" onPress={() => router.push('/check-in')} />}
            />
          ) : (
            <Section title="Your cards" count={data.cards.length}>
              {data.cards.map((card) => (
                <StampCard key={card.spaceId} card={card} />
              ))}
            </Section>
          )}
        </>
      )}
    </Screen>
  )
}
