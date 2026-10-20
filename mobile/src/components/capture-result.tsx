import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { describeCaptureReason, type CaptureOutcome } from '@/lib/capture'
import { radius, useTheme } from '@/theme'
import { Body, Button, Card, Heading, Icon, Notice } from '@/ui'

/** The answer to a check-in: the celebration beat, or the verifier's reason in plain words. */
export function CaptureResult({ outcome, error }: { outcome: CaptureOutcome | null; error: string | null }) {
  const { c } = useTheme()
  if (error) return <Notice tone="danger">{error}</Notice>
  if (!outcome) return null
  if (!outcome.ok) return <Notice tone="warning" title="Not checked in">{describeCaptureReason(outcome.reason)}</Notice>
  return (
    <Card style={{ alignItems: 'center' }} gap={12}>
      <View style={[styles.orb, { backgroundColor: c.presenceSoft }]}>
        <Icon name="checkin" size={32} color={c.presence} />
      </View>
      <Heading align="center">You are in.</Heading>
      {outcome.zapsAwarded ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="zap" size={20} color={c.accent} />
          <Body color={c.accent}>+{outcome.zapsAwarded} Zaps</Body>
        </View>
      ) : null}
      {outcome.offerTitle ? <Body align="center">{outcome.offerTitle}</Body> : null}
      <Button icon="award" label="See your cards" onPress={() => router.navigate('/frequency')} />
    </Card>
  )
}

const styles = StyleSheet.create({
  orb: { width: 64, height: 64, borderRadius: radius.orb, alignItems: 'center', justifyContent: 'center' },
})
