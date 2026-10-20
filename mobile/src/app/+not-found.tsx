import { router } from 'expo-router'
import { Screen } from '@/components/screen'
import { Button, EmptyState } from '@/ui'

export default function NotFound() {
  return (
    <Screen>
      <EmptyState icon="compass" title="Nothing here" description="That link does not open anything in the app yet." action={<Button variant="primary" label="Go to your device" onPress={() => router.replace('/')} />} />
    </Screen>
  )
}
