import { Platform } from 'react-native'
import { NativeModule, requireOptionalNativeModule, type EventSubscription } from 'expo'

// The JS face of modules/usb-serial (Kotlin, Android only). See UsbSerialModule.kt for the
// DTR/RTS rule: there is deliberately no way to set either line from here.

export type UsbSerialDevice = {
  deviceId: number
  vendorId: number
  productId: number
  name: string | null
  manufacturer: string | null
  driver: string
  hasPermission: boolean
}

type Events = {
  onData: (e: { base64: string }) => void
  onError: (e: { message: string }) => void
  onDetached: (e: { deviceId: number }) => void
}

declare class FrequencyUsbSerialModule extends NativeModule<Events> {
  listDevices(): Promise<UsbSerialDevice[]>
  requestPermission(deviceId: number): Promise<boolean>
  open(deviceId: number, baudRate: number): Promise<boolean>
  write(base64: string): Promise<boolean>
  close(): Promise<boolean>
  isOpen(): boolean
}

// Optional so Expo Go, iOS and a build without the module degrade to "USB not available" instead of
// crashing at import.
const native = Platform.OS === 'android' ? requireOptionalNativeModule<FrequencyUsbSerialModule>('FrequencyUsbSerial') : null

export const usbSerialAvailable = native != null

function need(): FrequencyUsbSerialModule {
  if (!native) throw new Error('USB serial needs the Android development build.')
  return native
}

export const UsbSerial = {
  listDevices: () => need().listDevices(),
  requestPermission: (deviceId: number) => need().requestPermission(deviceId),
  open: (deviceId: number, baudRate = 115200) => need().open(deviceId, baudRate),
  write: (base64: string) => need().write(base64),
  close: () => (native ? native.close() : Promise.resolve(true)),
  addListener<K extends keyof Events>(event: K, listener: Events[K]): EventSubscription {
    return need().addListener(event, listener)
  },
}

/** WCH CH340 / CH341, the CYD's USB-UART. */
export const CH340_VENDOR_ID = 0x1a86
