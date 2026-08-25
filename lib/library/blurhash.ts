// BlurHash — the ~30-character placeholder string stored on `library_assets.blurhash`, so a Loom
// grid paints a recognisable blur the instant the row arrives instead of a grey rectangle.
//
// PURE MATH, ZERO DEPENDENCIES, NO DOM AND NO NODE BUILTINS. It takes RGBA bytes and returns a
// string; the caller supplies the pixels. That is what makes it safe to import anywhere — it adds
// nothing to a server trace and nothing meaningful to a client bundle, unlike the obvious
// alternative of decoding server-side through `sharp` (see the header of lib/library/ingest.ts for
// why that door stays shut). The browser side that produces the pixels is
// lib/library/image-describe.ts.
//
// Reference: the BlurHash algorithm (Wolt, MIT) — a truncated 2-D discrete cosine transform over a
// small linear-light thumbnail, packed into base83.

const BASE83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~'

/** The base83 alphabet, exported so a validator can check a string without re-declaring it. */
export const BLURHASH_ALPHABET = BASE83

function encode83(value: number, length: number): string {
  let out = ''
  for (let i = 1; i <= length; i++) {
    const digit = Math.floor(value / 83 ** (length - i)) % 83
    out += BASE83[digit]
  }
  return out
}

/** sRGB byte → linear light. */
function toLinear(value: number): number {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** Linear light → sRGB byte, clamped. */
function toSrgb(value: number): number {
  const v = Math.max(0, Math.min(1, value))
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.round(s * 255 + 0.5)
}

function signPow(value: number, exp: number): number {
  return Math.sign(value) * Math.abs(value) ** exp
}

function encodeDc(dc: [number, number, number]): number {
  return (toSrgb(dc[0]) << 16) + (toSrgb(dc[1]) << 8) + toSrgb(dc[2])
}

function encodeAc(ac: [number, number, number], maximum: number): number {
  const q = (v: number) => Math.floor(Math.max(0, Math.min(18, Math.floor(signPow(v / maximum, 0.5) * 9 + 9.5))))
  return q(ac[0]) * 19 * 19 + q(ac[1]) * 19 + q(ac[2])
}

/**
 * Encode RGBA pixel bytes as a BlurHash string.
 *
 * `pixels` is row-major RGBA (4 bytes per pixel, exactly `width * height * 4` long) — the shape both
 * `CanvasRenderingContext2D.getImageData().data` and a raw decode already produce. `componentsX/Y`
 * are 1–9 and control detail; 4×3 is the usual choice for a landscape thumbnail.
 *
 * Returns null rather than throwing on any malformed input, because a missing placeholder must
 * never be able to fail an upload.
 */
export function encodeBlurhash(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  componentsX = 4,
  componentsY = 3,
): string | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null
  if (componentsX < 1 || componentsX > 9 || componentsY < 1 || componentsY > 9) return null
  if (pixels.length !== width * height * 4) return null

  // Cache the linear values once: the transform below reads every pixel componentsX*componentsY
  // times, and the sRGB curve is the expensive part.
  const linear = new Float64Array(width * height * 3)
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    linear[i * 3] = toLinear(pixels[p])
    linear[i * 3 + 1] = toLinear(pixels[p + 1])
    linear[i * 3 + 2] = toLinear(pixels[p + 2])
  }

  const factors: [number, number, number][] = []
  for (let y = 0; y < componentsY; y++) {
    for (let x = 0; x < componentsX; x++) {
      const normalisation = x === 0 && y === 0 ? 1 : 2
      let r = 0
      let g = 0
      let b = 0
      for (let py = 0; py < height; py++) {
        const cosY = Math.cos((Math.PI * y * py) / height)
        for (let px = 0; px < width; px++) {
          const basis = normalisation * Math.cos((Math.PI * x * px) / width) * cosY
          const i = (py * width + px) * 3
          r += basis * linear[i]
          g += basis * linear[i + 1]
          b += basis * linear[i + 2]
        }
      }
      const scale = 1 / (width * height)
      factors.push([r * scale, g * scale, b * scale])
    }
  }

  const dc = factors[0]
  const ac = factors.slice(1)

  let hash = encode83(componentsX - 1 + (componentsY - 1) * 9, 1)

  let maximumValue: number
  if (ac.length > 0) {
    let actualMax = 0
    for (const f of ac) actualMax = Math.max(actualMax, Math.abs(f[0]), Math.abs(f[1]), Math.abs(f[2]))
    const quantisedMax = Math.max(0, Math.min(82, Math.floor(actualMax * 166 - 0.5)))
    maximumValue = (quantisedMax + 1) / 166
    hash += encode83(quantisedMax, 1)
  } else {
    maximumValue = 1
    hash += encode83(0, 1)
  }

  hash += encode83(encodeDc(dc), 4)
  for (const f of ac) hash += encode83(encodeAc(f, maximumValue), 2)
  return hash
}

/**
 * Whether a string is a structurally valid BlurHash — the alphabet, and the length the leading
 * component byte declares. Used to gate a value that arrived from a BROWSER, where anything can be
 * posted: an untrusted placeholder is cosmetic, but a malformed one still has no business being
 * written to the catalog.
 */
export function isValidBlurhash(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 6 || value.length > 200) return false
  for (const ch of value) if (!BASE83.includes(ch)) return false
  const sizeFlag = BASE83.indexOf(value[0])
  const componentsX = (sizeFlag % 9) + 1
  const componentsY = Math.floor(sizeFlag / 9) + 1
  return value.length === 4 + 2 * componentsX * componentsY
}
