import type { ReactNode } from 'react'
import { router } from 'expo-router'
import { useDevice } from '@/device/DeviceProvider'
import { Screen } from './screen'
import { Button, EmptyState } from './ui'

/** A device tool screen. Shows a reconnect prompt instead of controls when the link is down. */
export function DeviceScreen({ children }: { children: ReactNode }) {
  const { state } = useDevice()
  if (state !== 'connected') {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="link"
          title="Not connected."
          description="Connect your CyberUnicorn over USB or Bluetooth to use this."
          action={<Button label="Connect" onPress={() => router.push('/device/connect')} />}
        />
      </Screen>
    )
  }
  return <Screen edges={[]}>{children}</Screen>
}
