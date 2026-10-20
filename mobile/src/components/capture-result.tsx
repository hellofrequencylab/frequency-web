import { View } from 'react-native'
import { router } from 'expo-router'
import { describeCaptureReason, type CaptureOutcome } from '@/lib/capture'
import { space, useTheme } from '@/theme'
import { Icon } from './icon'
import { Body, Heading } from './text'
import { Button, Card, Notice } from './ui'

/** The answer to a check-in: the celebration beat, or the verifier's reason in plain words. */
export function CaptureResult({ outcome, error }: { outcome: CaptureOutcome | null; error: string | null }) {
  const { c } = useTheme()
  if (error) return <Notice tone="danger">{error}</Notice>
  if (!outcome) return null
  if (!outcome.ok) return <Notice tone="live" title="Not checked in">{describeCaptureReason(outcome.reason)}</Notice>
  return (
    <Card style={{ alignItems: 'center', gap: space[5] }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.presenceSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="checkin" size={32} color={c.presence} />
      </View>
      <Heading align="center">You are in.</Heading>
      {outcome.zapsAwarded ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Icon name="zap" size={20} color={c.reward} />
          <Body color={c.reward}>+{outcome.zapsAwarded} Zaps</Body>
        </View>
      ) : null}
      {outcome.offerTitle ? <Body align="center">{outcome.offerTitle}</Body> : null}
      <Button variant="secondary" label="See your cards" icon="award" onPress={() => router.push('/rewards')} />
    </Card>
  )
}
