// USB transport for the browser: Web Serial (Chrome and Edge on a computer). The CYD's own USB port is
// a WCH CH340 at 115200 8N1, no flow control (PROTOCOL.md §2). Its DTR and RTS lines drive the ESP32's
// EN and IO0 through the auto-reset circuit, so both are set LOW together straight after open and never
// toggled again. Measured on Daniel's Mac (2026-10-20): the CH340 driver resets the ESP32 on open
// anyway, so every connect is a reboot (about 18 s to the main menu). The console keeps one connection
// open and re-sends `system.status` until it answers.
//
// Client-only: nothing here runs on the server. TypeScript's DOM lib has no Web Serial types yet, so the
// handful this file touches are declared below.

import { ScreenDemux } from './screen-mirror'
import { Emitter, type Transport } from './transport'

export const BAUD_RATE = 115200
export const CH340_VENDOR_ID = 0x1a86

export interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string; flowControl?: string; bufferSize?: number }): Promise<void>
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

/** Close `port` if THIS page still holds it open (the updater's esptool connection, an earlier console
 *  transport that did not close). A reader that is still draining gets up to `ms` to let go; a port another
 *  tab or program holds is not open on this page's object and is left alone. Never throws. */
export async function releasePort(port: SerialPortLike, ms = 3000): Promise<void> {
  if (!port.readable && !port.writable) return
  const until = Date.now() + ms
  // An unlocked stream can be cancelled from here; a locked one belongs to a reader that is winding down.
  if (port.readable && !port.readable.locked) await port.readable.cancel().catch(() => undefined)
  while ((port.readable?.locked || port.writable?.locked) && Date.now() < until) await new Promise((r) => setTimeout(r, 100))
  await port.close().catch(() => undefined)
}

/** Open `port` as a protocol transport. */
export async function openWebSerial(port: SerialPortLike): Promise<Transport> {
  const api = serialApi()
  // Left open on this page by the updater (esptool) or a transport that did not close: let it go first,
  // or the open below fails as if another program had it (owner, 2026-10-20, right after an update).
  await releasePort(port)
  try {
    await port.open({
      baudRate: BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
      // Chrome's default is 255 bytes. The screen stream fills that faster than a busy page reads it,
      // the overflow is dropped, and the lost bytes scramble the mirror and the RPC replies (owner,
      // 2026-10-21: "stopped answering" on a placard write). 1 MB is minutes of stream.
      bufferSize: 1 << 20,
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
  const screen = new Emitter<Uint8Array>()
  // Set while Bruce's `display start` stream is on: packets are split out before text decoding.
  let demux = null as ScreenDemux | null
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
            let bytes = value
            if (demux) {
              const out = demux.push(value)
              for (const p of out.packets) screen.emit(p)
              bytes = out.text
            }
            const t = decoder.decode(bytes, { stream: true })
            if (t) text.emit(t)
          }
        }
      } catch (e) {
        // A transient read error (a buffer overrun drops bytes): note it, start the screen demux and the
        // text decoder clean so neither carries half a packet into the new reader, and take a fresh one.
        if (demux) demux = new ScreenDemux()
        decoder.decode()
        text.emit(`\n# USB read error (${e instanceof Error ? e.name : 'unknown'}), resyncing\n`)
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
    onScreen: (l) => screen.on(l),
    setScreenStream(on: boolean) {
      if (on) {
        demux ??= new ScreenDemux()
        return
      }
      if (!demux) return
      const rest = demux.flush()
      demux = null
      if (rest.length) {
        const t = decoder.decode(rest, { stream: true })
        if (t) text.emit(t)
      }
    },
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
      screen.clear()
      if (wasOpen) await port.close().catch(() => undefined)
    },
  }
}
