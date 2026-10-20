import type { ReactNode } from 'react'
import { router } from 'expo-router'
import { useDevice } from '@/device/DeviceProvider'
import { Button, EmptyState } from '@/ui'
import { Screen } from './screen'

/** A device tool screen. Shows the empty state and one way back to Connect when the link is down. */
export function DeviceScreen({ children }: { children: ReactNode }) {
  const { state } = useDevice()
  if (state !== 'connected') {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="link"
          title="Not connected"
          description="Connect your CyberUnicorn over USB or Bluetooth to use this."
          action={<Button variant="primary" label="Connect" icon="link" onPress={() => router.push('/device/connect')} />}
        />
      </Screen>
    )
  }
  return <Screen edges={[]}>{children}</Screen>
}
