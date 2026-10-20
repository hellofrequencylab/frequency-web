import { useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Progress } from '@/components/game'
import { DeviceScreen } from '@/components/device-gate'
import { Section } from '@/components/screen'
import { Body, Count, Label, Meta } from '@/components/text'
import { Button, Card, Notice } from '@/components/ui'
import { DeviceError } from '@/device/client'
import { useDevice } from '@/device/DeviceProvider'
import { describeDeviceError } from '@/device/protocol'
import type { LightRead, SensorsRead } from '@/device/types'
import { space } from '@/theme'

// `light.read` (the CYD's light sensor) and `sensors.read` (whatever the Sensors app finds), polled
// every 3 seconds while this screen is open.

type Reading<T> = { data: T | null; error: string | null }

export default function Sensors() {
  const { call } = useDevice()
  const [light, setLight] = useState<Reading<LightRead>>({ data: null, error: null })
  const [sensors, setSensors] = useState<Reading<SensorsRead>>({ data: null, error: null })
  const [live, setLive] = useState(true)
  const busy = useRef(false)

  const read = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    const grab = async <T,>(cmd: 'light.read' | 'sensors.read'): Promise<Reading<T>> => {
      try {
        return { data: await call<T>(cmd), error: null }
      } catch (e) {
        return { data: null, error: e instanceof DeviceError ? describeDeviceError(e.code, e.message) : 'Could not read.' }
      }
    }
    setLight(await grab<LightRead>('light.read'))
    setSensors(await grab<SensorsRead>('sensors.read'))
    busy.current = false
  }, [call])

  useEffect(() => {
    void read()
  }, [read])

  useFocusEffect(
    useCallback(() => {
      if (!live) return
      const t = setInterval(() => void read(), 3000)
      return () => clearInterval(t)
    }, [live, read]),
  )

  return (
    <DeviceScreen>
      <Section title="Light">
        <Card>
          {light.data ? (
            <>
              <Count>{light.data.percent != null ? `${Math.round(light.data.percent)}%` : '–'}</Count>
              <Progress value={light.data.percent ?? 0} max={100} />
              {light.data.raw != null ? <Meta>Raw {light.data.raw}</Meta> : null}
            </>
          ) : (
            <Notice tone="info">{light.error ?? 'Reading…'}</Notice>
          )}
        </Card>
      </Section>
      <Section title="Sensors" count={sensors.data?.sensors?.length}>
        <Card>
          {sensors.data?.sensors?.length ? (
            sensors.data.sensors.map((s, i) => (
              <View key={`${s.name}-${s.kind}-${i}`} style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[4] }}>
                <View style={{ flex: 1 }}>
                  <Body>{s.name ?? 'Sensor'}</Body>
                  {s.kind ? <Label>{s.kind}</Label> : null}
                </View>
                <Body style={{ fontVariant: ['tabular-nums'] }}>
                  {typeof s.value === 'number' ? s.value.toFixed(1) : s.value ?? '–'} {s.unit === 'C' ? '°C' : s.unit ?? ''}
                </Body>
              </View>
            ))
          ) : (
            <Notice tone="info">{sensors.error ?? 'No sensors reported.'}</Notice>
          )}
        </Card>
      </Section>
      <Button variant="secondary" label={live ? 'Pause' : 'Resume live readings'} onPress={() => setLive((v) => !v)} />
    </DeviceScreen>
  )
}
