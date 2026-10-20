import { View } from 'react-native'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { StatTile } from '@/components/game'
import { Wordmark } from '@/components/logo'
import { PageHeading, Screen, Section } from '@/components/screen'
import { Body, Meta, Serif } from '@/components/text'
import { Button, Card, Notice, Row } from '@/components/ui'
import { useDevice } from '@/device/DeviceProvider'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { env, memberConfigured } from '@/lib/env'
import { useRemote } from '@/lib/use-remote'
import { space } from '@/theme'

export default function Home() {
  const { session, me, needsProfile, error, push, signOut } = useAuth()
  const device = useDevice()
  const { data: rewards, error: loadError, refreshing, refresh } = useRemote(session ? session.user.id : null, api.rewards)

  const name = me?.displayName ?? me?.handle ?? null
  const openRewards = rewards?.cards.reduce((n, c) => n + c.openRewards.length, 0) ?? 0

  return (
    <Screen refreshing={refreshing} onRefresh={session ? refresh : undefined}>
      <Wordmark height={20} />
      <PageHeading eyebrow="Frequency Experience" title={name ? `Hi, ${name}` : 'Welcome in'} description="Your cards, your check-ins and your CyberUnicorn, in one place." />

      {!memberConfigured ? (
        <Notice tone="info" title="Not connected to Frequency yet">
          This build has no API address. Add EXPO_PUBLIC_API_URL and the Supabase keys to mobile/.env, then rebuild. The device tools work without it.
        </Notice>
      ) : !session ? (
        <Card>
          <Serif>Gather like it matters.</Serif>
          <Body>Sign in to see your stamp cards, your Zaps and to check in with a tap.</Body>
          <Button label="Sign in" icon="user" onPress={() => router.push('/sign-in')} />
        </Card>
      ) : needsProfile ? (
        <Notice tone="reward" title="One step left">
          Your account has no Frequency profile yet. Finish setting it up on the web, then pull down to refresh.
        </Notice>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}

      {session && rewards ? (
        <View style={{ flexDirection: 'row', gap: space[4] }}>
          <StatTile icon="zap" label="Zaps" value={rewards.seasonZaps} tone="reward" />
          <StatTile icon="streak" label="Streak" value={rewards.streak} tone="live" />
          <StatTile icon="award" label="Codes" value={openRewards} tone="accent" />
        </View>
      ) : null}

      <Section title="Next">
        <Card padded={false} style={{ padding: space[3] }}>
          <Row icon="checkin" title="Check in" detail="Tap a venue tag with your phone" onPress={() => router.push('/check-in')} />
          <Row icon="award" title="Rewards" detail="Your stamp cards and codes" onPress={() => router.push('/rewards')} />
          <Row
            icon="sound"
            title="CyberUnicorn 5000"
            detail={device.state === 'connected' ? `Connected over ${device.kind === 'usb' ? 'USB' : 'Bluetooth'}` : 'Not connected'}
            onPress={() => router.push('/device')}
          />
        </Card>
      </Section>

      {session ? (
        <Section title="Account">
          <Card>
            <Meta>Signed in as {session.user.email ?? me?.handle ?? 'you'}</Meta>
            {push && !push.ok ? <Meta>Notifications: {push.reason}</Meta> : null}
            {env.apiUrl ? (
              <Button
                variant="secondary"
                icon="globe"
                label="Open Frequency on the web"
                onPress={() => WebBrowser.openBrowserAsync(`${env.apiUrl}/rewards`).catch(() => undefined)}
              />
            ) : null}
            <Button variant="ghost" label="Sign out" onPress={signOut} />
          </Card>
        </Section>
      ) : null}
    </Screen>
  )
}
