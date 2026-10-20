// Bytes for the CyberUnicorn transports. BLE (react-native-ble-plx) and the USB module both move
// base64; the device speaks UTF-8 lines. Pure and dependency-free (no Buffer or TextDecoder in React
// Native), so it is unit-tested under plain Node (bytes.test.ts).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const LOOKUP = new Int16Array(128).fill(-1)
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i

export function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + '='
  }
  return out
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let buffer = 0
  let bits = 0
  let o = 0
  for (let i = 0; i < clean.length; i++) {
    const v = LOOKUP[clean.charCodeAt(i)]!
    buffer = (buffer << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (buffer >> bits) & 0xff
    }
  }
  return out.subarray(0, o)
}

export function utf8Encode(text: string): Uint8Array {
  const out: number[] = []
  for (const ch of text) {
    let cp = ch.codePointAt(0)!
    if (cp < 0x80) out.push(cp)
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63))
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
    else {
      cp = Math.min(cp, 0x10ffff)
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
    }
  }
  return Uint8Array.from(out)
}

/**
 * A streaming UTF-8 decoder. A BLE notification or a USB read can end in the middle of a multi-byte
 * character, so the tail is held until the next chunk. Invalid bytes become U+FFFD.
 */
export class Utf8Stream {
  private pending: number[] = []

  push(chunk: Uint8Array): string {
    const bytes = this.pending.length ? [...this.pending, ...chunk] : Array.from(chunk)
    this.pending = []
    let out = ''
    let i = 0
    while (i < bytes.length) {
      const b = bytes[i]!
      const need = b < 0x80 ? 0 : b < 0xc0 ? -1 : b < 0xe0 ? 1 : b < 0xf0 ? 2 : b < 0xf8 ? 3 : -1
      if (need < 0) {
        out += '�'
        i++
        continue
      }
      if (need > 0 && i + need >= bytes.length) {
        // Incomplete sequence at the end of the chunk: keep it for the next push.
        this.pending = bytes.slice(i)
        break
      }
      let cp = need === 0 ? b : b & (0x3f >> need)
      let ok = true
      for (let k = 1; k <= need; k++) {
        const c = bytes[i + k]!
        if ((c & 0xc0) !== 0x80) {
          ok = false
          break
        }
        cp = (cp << 6) | (c & 0x3f)
      }
      if (!ok) {
        out += '�'
        i++
        continue
      }
      out += String.fromCodePoint(cp)
      i += need + 1
    }
    return out
  }
}
