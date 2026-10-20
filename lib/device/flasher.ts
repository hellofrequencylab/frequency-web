// FIRMWARE UPDATE OVER USB (the "Update firmware" button on /admin/cyberunicorn): writes a release's
// app.bin to the CyberUnicorn 5000 from the browser, replacing the Terminal `./flash.sh` step. The
// board is an ESP32 (CYD 2432S028R) behind a CH340 USB-serial bridge, 4 MB flash, no OTA partition.
//
// Only the app partition is written, at 0x10000, exactly as `./flash.sh` without `--full`: the
// bootloader, the partition table and NVS (Wi-Fi, the device credential, settings) are left alone,
// so the board comes back as itself. The image comes from /api/v1/devices/firmware/app, already
// checked on the server; it is checked again here (sha256) before a byte goes down the cable, and
// esptool's own MD5 read-back checks what landed in flash.
//
// Client-only. esptool-js is loaded with a dynamic import() from inside flashApp, never statically,
// so it is fetched only when someone presses the button (docs/DEPLOY-SAFETY.md: shell weight).
//
// The caller must release the port first (close the console's protocol transport): esptool opens it
// itself, at 115200 to sync with the ROM bootloader, then moves to 230400 to write. The CH340 on this
// board is reliable only up to 230400.

import type { SerialPortLike } from './web-serial'

const APP_OFFSET = 0x10000
const ROM_BAUD = 115200
const FLASH_BAUD = 230400

interface FlashAppOptions {
  /** Write progress, 0 to 1. */
  onProgress(fraction: number): void
  /** esptool's own log lines, for a details panel. */
  onLog?(line: string): void
  /** The manifest's sha256 of `bytes`, lowercase hex. */
  expectedSha256: string
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// MD5 (RFC 1321), for esptool's read-back check: the stub hashes the written region and esptool
// compares it with this. crypto.subtle has no MD5. Not used for anything security-related.
const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)

function md5Hex(data: Uint8Array): string {
  const len = data.length
  const padded = new Uint8Array((((len + 8) >>> 6) + 1) * 64)
  padded.set(data)
  padded[len] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, (len * 8) >>> 0, true)
  view.setUint32(padded.length - 4, Math.floor(len / 0x20000000), true)
  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476
  const m = new Array<number>(16)
  for (let off = 0; off < padded.length; off += 64) {
    for (let j = 0; j < 16; j++) m[j] = view.getUint32(off + j * 4, true)
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      const s = MD5_S[(i >>> 4) * 4 + (i % 4)]
      const sum = (a + f + MD5_K[i] + m[g]) >>> 0
      a = d
      d = c
      c = b
      b = (b + ((sum << s) | (sum >>> (32 - s)))) >>> 0
    }
    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }
  const out = new DataView(new ArrayBuffer(16))
  out.setUint32(0, a0, true)
  out.setUint32(4, b0, true)
  out.setUint32(8, c0, true)
  out.setUint32(12, d0, true)
  return Array.from(new Uint8Array(out.buffer), (b) => b.toString(16).padStart(2, '0')).join('')
}

function plainError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (/already open|in use|failed to open|access denied|busy/i.test(msg)) {
    return new Error('Another program has the USB port. Close the console connection, the Arduino serial monitor or ./remote.sh, then try again.')
  }
  if (/failed to connect|timeout|timed out|invalid response|no serial data/i.test(msg)) {
    return new Error('Could not put the CyberUnicorn into download mode. Hold BOOT, tap RST, let go of BOOT, then try again.')
  }
  if (/md5/i.test(msg)) return new Error('The firmware did not verify after writing. Try the update again before unplugging.')
  if (/device has been lost|disconnected|network error/i.test(msg)) return new Error('The CyberUnicorn was unplugged during the update. Plug it back in and run the update again.')
  return new Error(`The update stopped: ${msg}`)
}

/**
 * Write `bytes` (a release's app.bin) to the app partition at 0x10000 over `port`, then hard-reset
 * the board into the new firmware and release the port. Rejects with a plain-language Error.
 */
export async function flashApp(port: SerialPortLike, bytes: Uint8Array, opts: FlashAppOptions): Promise<void> {
  const want = opts.expectedSha256.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(want) || (await sha256Hex(bytes)) !== want) {
    throw new Error('The downloaded firmware does not match its release checksum. Nothing was written.')
  }
  // An open port belongs to someone else on this page (the console's transport). Do not touch it.
  if (port.readable || port.writable) {
    throw new Error('The USB port is still in use by the console. Disconnect it there first, then run the update.')
  }
  const log = (line: string) => opts.onLog?.(line)
  const { ESPLoader, Transport } = await import('esptool-js')
  // esptool-js types the port as the W3C SerialPort; the console's SerialPortLike is the subset we
  // declare ourselves (lib/device/web-serial.ts). It is the same object at run time.
  const transport = new Transport(port as unknown as ConstructorParameters<typeof Transport>[0], false)
  try {
    const loader = new ESPLoader({
      transport,
      baudrate: FLASH_BAUD,
      romBaudrate: ROM_BAUD,
      terminal: { clean: () => {}, writeLine: log, write: log },
    })
    try {
      await loader.main('default_reset')
    } catch (e) {
      throw plainError(e)
    }
    if (loader.chip.CHIP_NAME !== 'ESP32') {
      throw new Error(`This board reports ${loader.chip.CHIP_NAME}, not an ESP32. The CyberUnicorn 5000 firmware only fits the ESP32 CYD. Nothing was written.`)
    }
    try {
      opts.onProgress(0)
      await loader.writeFlash({
        fileArray: [{ data: bytes, address: APP_OFFSET }],
        flashMode: 'keep',
        flashFreq: 'keep',
        flashSize: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (_file, written, total) => opts.onProgress(total > 0 ? Math.min(1, written / total) : 0),
        calculateMD5Hash: md5Hex,
      })
      opts.onProgress(1)
      await loader.after('hard_reset')
    } catch (e) {
      throw plainError(e)
    }
  } finally {
    // Release the port whatever happened, so the console can reconnect to the rebooted board.
    await transport.disconnect().catch(() => port.close().catch(() => {}))
  }
}
