import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '@/components/screen'
import { BodySmall, Meta } from '@/components/text'
import { Button, Card, Notice, Row, Segmented } from '@/components/ui'
import { bluetoothOn, ensureBlePermissions, openBle, scanForDevices, type FoundDevice } from '@/device/ble'
import { useDevice } from '@/device/DeviceProvider'
import { RELAY_COMING_SOON } from '@/device/relay'
import { isCyberUnicornCandidate, listUsbDevices, openUsb, usbSerialAvailable, type UsbSerialDevice } from '@/device/usb'
import { useRemote } from '@/lib/use-remote'
import { space, useTheme } from '@/theme'

type Mode = 'usb' | 'ble' | 'relay'

export default function Connect() {
  const [mode, setMode] = useState<Mode>('usb')
  return (
    <Screen edges={['bottom']}>
      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'usb', label: 'USB', icon: 'link' },
          { value: 'ble', label: 'Bluetooth', icon: 'sound' },
          { value: 'relay', label: 'Internet', icon: 'globe' },
        ]}
      />
      {mode === 'usb' ? <UsbPicker /> : mode === 'ble' ? <BlePicker /> : <Notice tone="info" title="Coming soon">{RELAY_COMING_SOON}</Notice>}
    </Screen>
  )
}

function UsbPicker() {
  const { attach, state } = useDevice()
  const { data: devices, error, refresh } = useRemote('usb', listUsbDevices)

  if (!usbSerialAvailable) {
    return <Notice tone="info">USB needs the Frequency Experience development build on Android. It is not in this build.</Notice>
  }

  const connect = async (d: UsbSerialDevice) => {
    await attach(() => openUsb(d))
    router.back()
  }

  return (
    <>
      <Card>
        <BodySmall>
          Plug the CyberUnicorn into a USB OTG adapter that ends in USB-A, then a USB-A to USB-C cable. A USB-C to USB-C cable will not power it.
        </BodySmall>
        <Meta>The app opens the port without touching the reset lines, so the board keeps running.</Meta>
      </Card>
      {error ? <Notice tone="live">{error}</Notice> : null}
      <Card padded={false} style={{ padding: space[3] }}>
        {devices == null ? null : devices.length === 0 ? (
          <View style={{ padding: space[4] }}>
            <BodySmall>No USB serial device found. Check the adapter and the cable, then look again.</BodySmall>
          </View>
        ) : (
          devices.map((d) => (
            <Row
              key={d.deviceId}
              icon="link"
              title={isCyberUnicornCandidate(d) ? 'CyberUnicorn (CH340)' : d.name ?? d.driver}
              detail={`${d.manufacturer ?? d.driver} · ${d.vendorId.toString(16).padStart(4, '0')}:${d.productId.toString(16).padStart(4, '0')}`}
              onPress={state === 'connecting' ? undefined : () => connect(d)}
            />
          ))
        )}
      </Card>
      <Button variant="secondary" label="Look again" onPress={refresh} />
    </>
  )
}

function BlePicker() {
  const { attach, state } = useDevice()
  const { c } = useTheme()
  const [found, setFound] = useState<FoundDevice[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stop: (() => void) | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    ;(async () => {
      if (!(await ensureBlePermissions())) {
        setError('Allow Nearby devices for Frequency to find your CyberUnicorn.')
        return
      }
      if (!(await bluetoothOn())) {
        setError('Turn on Bluetooth, then come back.')
        return
      }
      setScanning(true)
      stop = scanForDevices(
        (d) => setFound((prev) => (prev.some((p) => p.id === d.id) ? prev.map((p) => (p.id === d.id ? d : p)) : [...prev, d])),
        (m) => setError(m),
      )
      timer = setTimeout(() => {
        stop?.()
        setScanning(false)
      }, 15000)
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Bluetooth is not available.'))
    return () => {
      stop?.()
      if (timer) clearTimeout(timer)
    }
  }, [])

  const connect = async (d: FoundDevice) => {
    await attach(() => openBle(d.id, d.name))
    router.back()
  }

  return (
    <>
      <Card>
        <BodySmall>On the CyberUnicorn open Remote, then Bluetooth now. It shows up here as CU5K.</BodySmall>
      </Card>
      {error ? <Notice tone="live">{error}</Notice> : null}
      <Card padded={false} style={{ padding: space[3] }}>
        {found.map((d) => (
          <Row key={d.id} icon="sound" title={d.name} detail={d.rssi != null ? `Signal ${d.rssi} dBm` : d.id} onPress={state === 'connecting' ? undefined : () => connect(d)} />
        ))}
        {scanning ? (
          <View style={{ flexDirection: 'row', gap: space[4], padding: space[4], alignItems: 'center' }}>
            <ActivityIndicator color={c.accent} />
            <BodySmall>Looking for CyberUnicorns…</BodySmall>
          </View>
        ) : found.length === 0 && !error ? (
          <View style={{ padding: space[4] }}>
            <BodySmall>None found. Check its Bluetooth is on and close by.</BodySmall>
          </View>
        ) : null}
      </Card>
    </>
  )
}
