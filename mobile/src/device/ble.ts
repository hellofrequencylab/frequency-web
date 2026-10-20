import { PermissionsAndroid, Platform } from 'react-native'
import { BleManager, State, type Device, type Subscription } from 'react-native-ble-plx'
import { base64ToBytes, bytesToBase64, utf8Encode, Utf8Stream } from './bytes'
import { Emitter, type Transport } from './transport'

// Bluetooth LE transport: Bruce's BLE serial service, reused as is (PROTOCOL.md §2). The phone stays
// on its own Wi-Fi; nothing is paired (the device is open while its Bluetooth is on).

export const SERIAL_SERVICE = '4371ec0b-3d43-49f9-b731-7c72a4a7bb91'
export const SERIAL_CHARACTERISTIC = 'd555ed97-bf2a-4f46-b3eb-d1fcdd7325e9'
/** The advertised name (patch 0014). The GAP name is "CyberUnicorn". */
export const ADVERTISED_NAME = 'CU5K'
const WANT_MTU = 517

let manager: BleManager | null = null
function ble(): BleManager {
  manager ??= new BleManager()
  return manager
}

/** Android 12+ asks for "Nearby devices" (scan + connect); older Android needs location to scan. */
export async function ensureBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  if (Number(Platform.Version) >= 31) {
    const r = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ])
    return Object.values(r).every((v) => v === PermissionsAndroid.RESULTS.GRANTED)
  }
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
  return r === PermissionsAndroid.RESULTS.GRANTED
}

export async function bluetoothOn(): Promise<boolean> {
  return (await ble().state()) === State.PoweredOn
}

export type FoundDevice = { id: string; name: string; rssi: number | null }

/** Scan for CyberUnicorns (filtered on the serial service UUID). Returns a stop function. */
export function scanForDevices(onFound: (d: FoundDevice) => void, onError: (message: string) => void): () => void {
  const m = ble()
  m.startDeviceScan([SERIAL_SERVICE], null, (error, device) => {
    if (error) {
      onError(error.message)
      return
    }
    if (device) onFound({ id: device.id, name: device.localName ?? device.name ?? ADVERTISED_NAME, rssi: device.rssi })
  }).catch((e: unknown) => onError(e instanceof Error ? e.message : 'Scan failed'))
  return () => {
    m.stopDeviceScan().catch(() => undefined)
  }
}

export async function openBle(deviceId: string, name: string): Promise<Transport> {
  const m = ble()
  await m.stopDeviceScan().catch(() => undefined)
  let device: Device = await m.connectToDevice(deviceId, { requestMTU: WANT_MTU, timeout: 10000 })
  if ((device.mtu ?? 23) < WANT_MTU) {
    device = await m.requestMTUForDevice(deviceId, WANT_MTU).catch(() => device)
  }
  await m.discoverAllServicesAndCharacteristicsForDevice(deviceId)

  const text = new Emitter<string>()
  const closed = new Emitter<string>()
  const decoder = new Utf8Stream()
  let open = true
  // Notifications arrive in MTU-3 pieces; the client's line splitter reassembles them.
  const monitor: Subscription = m.monitorCharacteristicForDevice(deviceId, SERIAL_SERVICE, SERIAL_CHARACTERISTIC, (error, ch) => {
    if (error) {
      if (open) finish(error.message)
      return
    }
    if (ch?.value) {
      const t = decoder.push(base64ToBytes(ch.value))
      if (t) text.emit(t)
    }
  })
  const dropped = m.onDeviceDisconnected(deviceId, (error) => finish(error?.message ?? 'Bluetooth disconnected.'))

  function finish(reason: string) {
    if (!open) return
    open = false
    monitor.remove()
    dropped.remove()
    closed.emit(reason)
  }

  return {
    kind: 'ble',
    label: name,
    async write(line: string) {
      if (!open) throw new Error('Bluetooth is disconnected.')
      // One write WITH response per line. Android turns a line longer than MTU-3 into a long write,
      // which NimBLE reassembles (max 512 bytes) before the CLI reads it.
      await m.writeCharacteristicWithResponseForDevice(deviceId, SERIAL_SERVICE, SERIAL_CHARACTERISTIC, bytesToBase64(utf8Encode(line)))
    },
    onText: (l) => text.on(l),
    onClose: (l) => closed.on(l),
    async close() {
      if (open) {
        open = false
        monitor.remove()
        dropped.remove()
      }
      await m.cancelDeviceConnection(deviceId).catch(() => undefined)
    },
  }
}
