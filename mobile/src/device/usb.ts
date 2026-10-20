import { CH340_VENDOR_ID, UsbSerial, usbSerialAvailable, type UsbSerialDevice } from 'usb-serial'
import { base64ToBytes, bytesToBase64, utf8Encode, Utf8Stream } from './bytes'
import { Emitter, type Transport } from './transport'

// USB OTG transport: the CYD's CH340 at 115200 8N1, opened with DTR and RTS low and never toggled
// (modules/usb-serial enforces it; PROTOCOL.md §2). The phone keeps its own Wi-Fi: this is a cable.

export { usbSerialAvailable }
export type { UsbSerialDevice }

export const BAUD_RATE = 115200

/** Serial adapters on the bus, a CH340 (the CyberUnicorn) first. */
export async function listUsbDevices(): Promise<UsbSerialDevice[]> {
  if (!usbSerialAvailable) return []
  const devices = await UsbSerial.listDevices()
  return devices.sort((a, b) => Number(b.vendorId === CH340_VENDOR_ID) - Number(a.vendorId === CH340_VENDOR_ID))
}

export function isCyberUnicornCandidate(d: UsbSerialDevice): boolean {
  return d.vendorId === CH340_VENDOR_ID
}

export async function openUsb(device: UsbSerialDevice): Promise<Transport> {
  const granted = device.hasPermission || (await UsbSerial.requestPermission(device.deviceId))
  if (!granted) throw new Error('USB permission was not granted. Plug in again and tap Allow.')
  await UsbSerial.open(device.deviceId, BAUD_RATE)

  const text = new Emitter<string>()
  const closed = new Emitter<string>()
  const decoder = new Utf8Stream()
  let open = true
  const subs = [
    UsbSerial.addListener('onData', ({ base64 }) => {
      const t = decoder.push(base64ToBytes(base64))
      if (t) text.emit(t)
    }),
    UsbSerial.addListener('onError', ({ message }) => finish(message)),
    UsbSerial.addListener('onDetached', () => finish('The cable was unplugged.')),
  ]

  function finish(reason: string) {
    if (!open) return
    open = false
    for (const s of subs) s.remove()
    closed.emit(reason)
  }

  return {
    kind: 'usb',
    label: device.name ?? (isCyberUnicornCandidate(device) ? 'CH340 serial' : device.driver),
    async write(line: string) {
      if (!open) throw new Error('The USB port is closed.')
      await UsbSerial.write(bytesToBase64(utf8Encode(line)))
    },
    onText: (l) => text.on(l),
    onClose: (l) => closed.on(l),
    async close() {
      if (open) {
        open = false
        for (const s of subs) s.remove()
      }
      await UsbSerial.close()
    },
  }
}
