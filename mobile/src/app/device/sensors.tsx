import { useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { DeviceScreen } from '@/components/device-gate'
import { DeviceError } from '@/device/client'
import { useDevice } from '@/device/DeviceProvider'
import { describeDeviceError } from '@/device/protocol'
import type { LightRead, SensorsRead } from '@/device/types'
import { Card, Counter, Meta, Notice, ProgressTrack, SectionHeader, Skeleton, Switch } from '@/ui'

// `light.read` (the CYD's light sensor) and `sensors.read` (whatever the Sensors app finds), read every
// 3 seconds while this screen is open and Live is on.

type Reading<T> = { data: T | null; error: string | null }

export default function Sensors() {
  const { call } = useDevice()
  const [light, setLight] = useState<Reading<LightRead> | null>(null)
  const [sensors, setSensors] = useState<Reading<SensorsRead> | null>(null)
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
    const l = await grab<LightRead>('light.read')
    const s = await grab<SensorsRead>('sensors.read')
    setLight(l)
    setSensors(s)
    busy.current = false
  }, [call])

  useEffect(() => {
    const t = setTimeout(() => void read(), 0)
    return () => clearTimeout(t)
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
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Meta>Live readings every 3 seconds</Meta>
          </View>
          <Switch value={live} onChange={setLive} label="Live readings" />
        </View>
      </Card>

      <View style={{ gap: 14 }}>
        <SectionHeader title="Light" />
        <Card>
          {light == null ? (
            <>
              <Skeleton width="30%" height={26} />
              <Skeleton height={8} />
            </>
          ) : light.data ? (
            <>
              <Counter icon="sun" label="Light level" value={light.data.percent != null ? Math.round(light.data.percent) : null} unit="%" />
              <ProgressTrack value={light.data.percent ?? 0} max={100} size="lg" label="Light level" />
              {light.data.raw != null ? <Meta>Raw reading {light.data.raw}</Meta> : null}
            </>
          ) : (
            <Notice tone="info">{light.error}</Notice>
          )}
        </Card>
      </View>

      <View style={{ gap: 14 }}>
        <SectionHeader title="Sensors" count={sensors?.data?.sensors?.length} />
        <Card>
          {sensors == null ? (
            <Skeleton width="60%" />
          ) : sensors.data?.sensors?.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
              {sensors.data.sensors.map((s, i) => (
                <View key={`${s.name}-${s.kind}-${i}`} style={{ width: '50%' }}>
                  <Counter
                    label={`${s.name ?? 'Sensor'}${s.kind ? ` · ${s.kind}` : ''}`}
                    value={typeof s.value === 'number' ? Number(s.value.toFixed(1)) : s.value ?? null}
                    unit={s.unit === 'C' ? '°C' : s.unit}
                  />
                </View>
              ))}
            </View>
          ) : (
            <Notice tone="info">{sensors.error ?? 'No sensors reported.'}</Notice>
          )}
        </Card>
      </View>
    </DeviceScreen>
  )
}
