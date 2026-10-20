import { router } from 'expo-router'
import { PageHeading, Screen } from '@/components/screen'
import { Button } from '@/components/ui'

export default function NotFound() {
  return (
    <Screen>
      <PageHeading title="Nothing here" description="That link does not open anything in the app yet." />
      <Button label="Go home" onPress={() => router.replace('/')} />
    </Screen>
  )
}
