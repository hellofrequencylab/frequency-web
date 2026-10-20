import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '@/components/screen'
import { bluetoothOn, ensureBlePermissions, openBle, scanForDevices, type FoundDevice } from '@/device/ble'
import { useDevice } from '@/device/DeviceProvider'
import { RELAY_COMING_SOON } from '@/device/relay'
import { isCyberUnicornCandidate, listUsbDevices, openUsb, usbSerialAvailable, type UsbSerialDevice } from '@/device/usb'
import { Badge, BodySmall, Button, Card, EmptyState, Meta, Notice, Panel, Row, SegmentedControl, Skeleton, StageTimeline, type Stage } from '@/ui'

// Connect: one segmented switch between USB, Bluetooth and the internet relay (coming soon). The stage
// timeline says where the connection is: find, allow, open, hello.

type Mode = 'usb' | 'ble' | 'relay'

function useStages(step: 0 | 1 | 2 | 3): Stage[] {
  const names = ['Find it', 'Allow', 'Open', 'Say hello']
  return names.map((label, i) => ({ key: label, label, state: i < step ? 'done' : i === step ? 'current' : 'upcoming' }))
}

export default function Connect() {
  const [mode, setMode] = useState<Mode>('usb')
  return (
    <Screen edges={['bottom']}>
      <SegmentedControl<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'usb', label: 'USB', icon: 'link' },
          { value: 'ble', label: 'Bluetooth', icon: 'sound' },
          { value: 'relay', label: 'Internet', icon: 'globe' },
        ]}
      />
      {mode === 'usb' ? <UsbPicker /> : mode === 'ble' ? <BlePicker /> : <EmptyState icon="globe" title="Coming soon" description={RELAY_COMING_SOON} />}
    </Screen>
  )
}

function UsbPicker() {
  const { attach, state } = useDevice()
  const [devices, setDevices] = useState<UsbSerialDevice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState<number | null>(null)

  const look = useCallback(() => {
    listUsbDevices().then(
      (d) => {
        setDevices(d)
        setError(null)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Could not list USB devices.'),
    )
  }, [])

  useEffect(() => {
    let alive = true
    listUsbDevices().then(
      (d) => alive && setDevices(d),
      (e: unknown) => alive && setError(e instanceof Error ? e.message : 'Could not list USB devices.'),
    )
    return () => {
      alive = false
    }
  }, [])

  const stages = useStages(opening != null ? (state === 'connecting' ? 2 : 1) : devices?.length ? 1 : 0)

  if (!usbSerialAvailable) {
    return <Notice tone="info">USB needs the Frequency Experience Android app. It is not in this build.</Notice>
  }

  const connect = async (d: UsbSerialDevice) => {
    setOpening(d.deviceId)
    await attach(() => openUsb(d))
    setOpening(null)
    router.back()
  }

  return (
    <>
      <StageTimeline stages={stages} />
      <Panel>
        <BodySmall>Plug the CyberUnicorn into a USB OTG adapter that ends in USB-A, then a USB-A to USB-C cable. A USB-C to USB-C cable will not power it.</BodySmall>
        <Meta>The app opens the port without touching the reset lines, so the board keeps running.</Meta>
      </Panel>
      {error ? <Notice tone="broadcast">{error}</Notice> : null}
      <Card padded={false} gap={0} style={{ padding: 6 }}>
        {devices == null ? (
          <View style={{ padding: 12, gap: 10 }}>
            <Skeleton width="60%" />
            <Skeleton width="40%" height={12} />
          </View>
        ) : devices.length === 0 ? (
          <View style={{ padding: 12 }}>
            <BodySmall>No USB serial device found. Check the adapter and the cable, then look again.</BodySmall>
          </View>
        ) : (
          devices.map((d) => (
            <Row
              key={d.deviceId}
              icon="link"
              title={isCyberUnicornCandidate(d) ? 'CyberUnicorn' : d.name ?? d.driver}
              detail={`${d.manufacturer ?? d.driver} · ${d.vendorId.toString(16).padStart(4, '0')}:${d.productId.toString(16).padStart(4, '0')}`}
              trailing={isCyberUnicornCandidate(d) ? <Badge label="CH340" tone="primary" size="sm" /> : undefined}
              onPress={state === 'connecting' ? undefined : () => connect(d)}
            />
          ))
        )}
      </Card>
      <Button icon="search" label="Look again" onPress={look} />
    </>
  )
}

function BlePicker() {
  const { attach, state } = useDevice()
  const [found, setFound] = useState<FoundDevice[]>([])
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    let stop: (() => void) | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let alive = true
    ;(async () => {
      if (!(await ensureBlePermissions())) {
        if (alive) setError('Allow Nearby devices for Frequency Experience to find your CyberUnicorn.')
        return
      }
      if (!(await bluetoothOn())) {
        if (alive) setError('Turn on Bluetooth, then come back.')
        return
      }
      if (!alive) return
      setScanning(true)
      stop = scanForDevices(
        (d) => setFound((prev) => (prev.some((p) => p.id === d.id) ? prev.map((p) => (p.id === d.id ? d : p)) : [...prev, d])),
        (m) => setError(m),
      )
      timer = setTimeout(() => {
        stop?.()
        setScanning(false)
      }, 15000)
    })().catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'Bluetooth is not available.'))
    return () => {
      alive = false
      stop?.()
      if (timer) clearTimeout(timer)
    }
  }, [])

  const stages = useStages(opening ? (state === 'connecting' ? 2 : 1) : found.length ? 1 : 0)

  const connect = async (d: FoundDevice) => {
    setOpening(true)
    await attach(() => openBle(d.id, d.name))
    setOpening(false)
    router.back()
  }

  return (
    <>
      <StageTimeline stages={stages} />
      <Panel>
        <BodySmall>On the CyberUnicorn open Remote, then Bluetooth now. It shows up here as CU5K.</BodySmall>
        <Meta>Turn its Bluetooth off when you are done: it is open to anyone nearby.</Meta>
      </Panel>
      {error ? <Notice tone="broadcast">{error}</Notice> : null}
      <Card padded={false} gap={0} style={{ padding: 6 }}>
        {found.map((d) => (
          <Row
            key={d.id}
            icon="sound"
            title={d.name}
            detail={d.rssi != null ? `Signal ${d.rssi} dBm` : d.id}
            onPress={state === 'connecting' ? undefined : () => connect(d)}
          />
        ))}
        {scanning && found.length === 0 ? (
          <View style={{ padding: 12, gap: 10 }}>
            <Skeleton width="50%" />
            <Skeleton width="30%" height={12} />
          </View>
        ) : null}
        {!scanning && found.length === 0 && !error ? (
          <View style={{ padding: 12 }}>
            <BodySmall>None found. Check its Bluetooth is on and close by.</BodySmall>
          </View>
        ) : null}
      </Card>
      {scanning ? <Meta align="center">Looking for CyberUnicorns nearby</Meta> : null}
    </>
  )
}
