import { View } from 'react-native'
import { CONTRACT_VERSION } from '@frequency/contract'
import { Wordmark } from '@/components/logo'
import { PageHeading, Screen } from '@/components/screen'
import { Badge, Body, Card, Meta, Row, SectionHeader, Serif, Soft } from '@/ui'

// The Frequency tab: where the member experience lands next (docs/MOBILE-APP.md §6). Nothing here needs
// an account or the network today. When it is built it signs in with supabase-js, keeps the session in
// SecureStore and reads everything through /api/v1 (docs/APP-CONTRACT.md), whose types the app already
// compiles against: CONTRACT_VERSION below comes from lib/contract.

const COMING = [
  { icon: 'award', title: 'Your stamp cards and reward codes', detail: 'Regulars, the same cards as Rewards on the web' },
  { icon: 'zap', title: 'Zaps and your streak', detail: 'Your standing for the season' },
  { icon: 'checkin', title: 'Check in with a tap', detail: 'Hold your phone to a venue tag' },
  { icon: 'globe', title: 'Your devices, from anywhere', detail: 'Pair the CyberUnicorn to your Space and use it over the internet' },
] as const

export default function FrequencyTab() {
  return (
    <Screen>
      <Wordmark height={18} />
      <PageHeading eyebrow="Coming soon" title="Frequency, in your pocket" description="Your Frequency account comes to this app next. The device remote works without it." />
      <Soft>
        <Serif>Gather like it matters.</Serif>
        <Body>Here is what lands in this tab.</Body>
      </Soft>
      <View style={{ gap: 14 }}>
        <SectionHeader title="Next" count={COMING.length} />
        <Card padded={false} gap={0} style={{ padding: 6 }}>
          {COMING.map((c) => (
            <Row key={c.title} icon={c.icon} title={c.title} detail={c.detail} trailing={<Badge label="Soon" size="sm" />} />
          ))}
        </Card>
      </View>
      <View style={{ alignItems: 'center' }}>
        <Meta>Frequency app contract v{CONTRACT_VERSION}</Meta>
      </View>
    </Screen>
  )
}
