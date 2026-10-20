// USB transport for the browser: Web Serial (Chrome and Edge on a computer). The CYD's own USB port is
// a WCH CH340 at 115200 8N1, no flow control (PROTOCOL.md §2). Its DTR and RTS lines drive the ESP32's
// EN and IO0 through the auto-reset circuit, so both are set LOW together straight after open and never
// toggled again. Measured on Daniel's Mac (2026-10-20): the CH340 driver resets the ESP32 on open
// anyway, so every connect is a reboot (about 18 s to the main menu). The console keeps one connection
// open and re-sends `system.status` until it answers.
//
// Client-only: nothing here runs on the server. TypeScript's DOM lib has no Web Serial types yet, so the
// handful this file touches are declared below.

import { Emitter, type Transport } from './transport'

export const BAUD_RATE = 115200
export const CH340_VENDOR_ID = 0x1a86

interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string; flowControl?: string }): Promise<void>
  close(): Promise<void>
  setSignals(signals: { dataTerminalReady?: boolean; requestToSend?: boolean; break?: boolean }): Promise<void>
  getInfo(): { usbVendorId?: number; usbProductId?: number }
}

interface SerialLike {
  requestPort(options?: { filters?: { usbVendorId?: number; usbProductId?: number }[] }): Promise<SerialPortLike>
  getPorts(): Promise<SerialPortLike[]>
  addEventListener(type: 'disconnect', listener: (e: Event) => void): void
  removeEventListener(type: 'disconnect', listener: (e: Event) => void): void
}

function serialApi(): SerialLike | null {
  if (typeof navigator === 'undefined') return null
  return ((navigator as unknown as { serial?: SerialLike }).serial ?? null) as SerialLike | null
}

/** Whether this browser can talk to a USB serial device at all. */
export function webSerialAvailable(): boolean {
  return serialApi() !== null
}

/** A port the person already allowed on this site, CH340 first, so a reconnect needs no picker. */
export async function rememberedPort(): Promise<SerialPortLike | null> {
  const api = serialApi()
  if (!api) return null
  try {
    const ports = await api.getPorts()
    return ports.find((p) => p.getInfo().usbVendorId === CH340_VENDOR_ID) ?? null
  } catch {
    return null
  }
}

/** Ask the person to pick the CyberUnicorn. The picker lists CH340 adapters only. Must run from a click. */
export async function pickPort(): Promise<SerialPortLike> {
  const api = serialApi()
  if (!api) throw new Error('Use Chrome or Edge on a computer to connect over USB.')
  return api.requestPort({ filters: [{ usbVendorId: CH340_VENDOR_ID }] })
}

/** Open `port` as a protocol transport. */
export async function openWebSerial(port: SerialPortLike): Promise<Transport> {
  const api = serialApi()
  try {
    await port.open({
      baudRate: BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    throw new Error(
      /already open|in use|failed to open/i.test(msg)
        ? 'Another program has the port. Close the Arduino serial monitor or ./remote.sh and try again.'
        : 'Could not open the USB port. Unplug the CyberUnicorn, plug it back in and try again.',
    )
  }
  // Both low in ONE call, so the auto-reset circuit never sees them differ (that is what resets the board).
  await port.setSignals({ dataTerminalReady: false, requestToSend: false }).catch(() => undefined)

  const text = new Emitter<string>()
  const closed = new Emitter<string>()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let open = true
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  function finish(reason: string) {
    if (!open) return
    open = false
    api?.removeEventListener('disconnect', onDisconnect)
    closed.emit(reason)
  }

  function onDisconnect(e: Event) {
    if ((e.target as unknown) === port) finish('The cable was unplugged.')
  }
  api?.addEventListener('disconnect', onDisconnect)

  // The read loop. A framing or parity error ends one reader; get a new one while the port is open.
  const loop = (async () => {
    while (open && port.readable) {
      reader = port.readable.getReader()
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          if (value) {
            const t = decoder.decode(value, { stream: true })
            if (t) text.emit(t)
          }
        }
      } catch {
        // A transient read error: loop and take a fresh reader.
      } finally {
        reader.releaseLock()
        reader = null
      }
    }
    finish('The USB port closed.')
  })()

  return {
    kind: 'usb',
    label: 'CyberUnicorn (USB)',
    async write(line: string) {
      if (!open || !port.writable) throw new Error('The USB port is closed.')
      const writer = port.writable.getWriter()
      try {
        await writer.write(encoder.encode(line))
      } finally {
        writer.releaseLock()
      }
    },
    onText: (l) => text.on(l),
    onClose: (l) => closed.on(l),
    async close() {
      const wasOpen = open
      open = false
      api?.removeEventListener('disconnect', onDisconnect)
      try {
        await reader?.cancel()
      } catch {
        /* already closed */
      }
      await loop // the reader's lock must be released before the port can close
      if (wasOpen) await port.close().catch(() => undefined)
    },
  }
}
