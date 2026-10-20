import { View } from 'react-native'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Wordmark } from '@/components/logo'
import { StampCard, StatTile } from '@/components/rewards'
import { PageHeading, Screen } from '@/components/screen'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { env, memberConfigured } from '@/lib/env'
import { useRemote } from '@/lib/use-remote'
import { Body, Button, Card, EmptyState, Meta, Notice, Panel, Row, SectionHeader, Serif, Skeleton, useConfirm } from '@/ui'

// The Frequency tab: the member experience (docs/MOBILE-APP.md §6). Signed out it offers sign-in and
// says what is here; signed in it is what the web's /rewards shows (app/(main)/rewards/page.tsx): the
// season Zaps and streak, every Regulars stamp card with its reward codes, and the way to check in.
// Everything comes through /api/v1 (GET /api/v1/rewards). The device remote never needs any of this.

const openWeb = (path: string) => (env.apiUrl ? WebBrowser.openBrowserAsync(`${env.apiUrl}${path}`).catch(() => undefined) : undefined)

export default function FrequencyTab() {
  const { ready, session, me, needsProfile, error, push, signOut } = useAuth()
  const confirm = useConfirm()
  const { data, error: loadError, refreshing, refresh } = useRemote(session && !needsProfile ? session.user.id : null, api.rewards)

  const name = me?.displayName ?? me?.handle ?? null
  const openRewards = data?.cards.reduce((n, c) => n + c.openRewards.length, 0) ?? 0

  const askSignOut = async () => {
    if (await confirm({ title: 'Sign out?', body: 'Your cards and codes stay on your account. Sign in again any time.', confirm: 'Sign out', variant: 'ink' })) await signOut()
  }

  return (
    <Screen refreshing={refreshing} onRefresh={session ? refresh : undefined}>
      <Wordmark height={18} />
      <PageHeading
        eyebrow="Your Frequency"
        title={name ? `Hi, ${name}` : 'Frequency, in your pocket'}
        description={session ? 'Your stamp cards, your Zaps and the tap that checks you in.' : 'Your Frequency account, in the same app as your CyberUnicorn.'}
      />

      {!memberConfigured ? (
        <Notice tone="info" title="Not connected to Frequency yet">
          This build has no API address. Add EXPO_PUBLIC_API_URL and the Supabase keys to mobile/.env, then rebuild. The device remote works without them.
        </Notice>
      ) : !ready ? (
        <Card>
          <Skeleton width="60%" height={20} />
          <Skeleton width="90%" />
        </Card>
      ) : !session ? (
        <>
          <Panel>
            <Serif>Gather like it matters.</Serif>
            <Body>Sign in to see your stamp cards and reward codes, your Zaps and streak, and to check in with a tap.</Body>
            <Button block variant="primary" icon="user" label="Sign in" onPress={() => router.push('/sign-in')} />
            <Meta>New to Frequency? Make your account on the web first.</Meta>
          </Panel>
          <View style={{ gap: 14 }}>
            <SectionHeader title="What is here" />
            <Card padded={false} gap={0} style={{ padding: 6 }}>
              <Row icon="award" title="Your stamp cards and reward codes" detail="Regulars, the same cards as Rewards on the web" />
              <Row icon="zap" title="Zaps and your streak" detail="Your standing for the season" />
              <Row icon="checkin" title="Check in with a tap" detail="Hold your phone to a venue tag" />
            </Card>
          </View>
        </>
      ) : needsProfile ? (
        <Panel>
          <Notice tone="warning" title="One step left">
            Your account has no Frequency profile yet. Finish setting it up on the web, then pull down to refresh.
          </Notice>
          <Button block variant="primary" icon="globe" label="Finish on the web" onPress={() => openWeb('/onboarding')} />
          <Button variant="ghost" label="Sign out" onPress={askSignOut} />
        </Panel>
      ) : (
        <>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {loadError ? <Notice tone="danger">{loadError}</Notice> : null}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatTile icon="zap" label="Zaps" value={data ? data.seasonZaps : null} />
            <StatTile icon="streak" label="Streak" value={data ? data.streak : null} tone="broadcast" />
            <StatTile icon="award" label="Codes" value={data ? openRewards : null} tone="signal" />
          </View>

          <Panel>
            <Body>At the door, hold the back of your phone to the Frequency tag. A check-in earns Zaps and stamps your card.</Body>
            <Button block variant="primary" icon="checkin" label="Check in" onPress={() => router.push('/check-in')} />
          </Panel>

          <View style={{ gap: 14 }}>
            <SectionHeader title="Your cards" count={data?.cards.length} />
            {!data ? (
              <Card>
                <Skeleton width="50%" height={20} />
                <Skeleton height={8} />
                <Skeleton width="70%" height={12} />
              </Card>
            ) : !data.enabled ? (
              <Notice tone="info" title="Regulars is not open yet">Stamp cards switch on soon. Your check-ins still earn Zaps.</Notice>
            ) : data.cards.length === 0 ? (
              <EmptyState icon="award" title="No cards yet" description="Check in at a shop that runs Regulars and your first card lands here, with Zaps for the visit." />
            ) : (
              data.cards.map((card) => <StampCard key={card.spaceId} card={card} />)
            )}
          </View>

          <View style={{ gap: 14 }}>
            <SectionHeader title="Account" />
            <Card>
              <Meta>Signed in as {session.user.email ?? me?.handle ?? 'you'}</Meta>
              {push && !push.ok ? <Meta>Notifications: {push.reason}</Meta> : null}
              <Button icon="globe" label="Open Frequency on the web" onPress={() => openWeb('/rewards')} />
              <Button variant="ghost" label="Sign out" onPress={askSignOut} />
            </Card>
          </View>
        </>
      )}
    </Screen>
  )
}
