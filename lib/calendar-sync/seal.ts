import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// SEALED CALENDAR TOKENS (LIVE-1179, ADR-1976). The same approach as the discovery connections
// (lib/ai/discovery-oauth-state.ts): AES-256-GCM under a DEDICATED key, with the Space, provider,
// connection id and purpose bound in as authenticated data. A ciphertext copied to another row,
// another Space or another purpose does not open. No fallback key, so a missing key means no
// connect, never a plaintext write.
//
// PURE except for reading the key from env at call time, so the round trip is unit-tested.

export interface CalendarSealBinding {
  spaceId: string
  provider: 'google' | 'outlook'
  connectionId: string
}

type Purpose = 'pending' | 'tokens'

/** The 32-byte key, canonical base64. `openssl rand -base64 32` makes one. */
export function calendarSealKey(): Buffer | null {
  const encoded = process.env.CALENDAR_SYNC_ENCRYPTION_KEY?.trim()
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) return null
  const bytes = Buffer.from(encoded, 'base64')
  return bytes.length === 32 && bytes.toString('base64') === encoded ? bytes : null
}

function aad(binding: CalendarSealBinding, purpose: Purpose): Buffer {
  return Buffer.from(JSON.stringify([1, 'calendar-sync', purpose, binding.spaceId, binding.provider, binding.connectionId]))
}

export function sealCalendarSecret(binding: CalendarSealBinding, purpose: Purpose, value: unknown): string | null {
  try {
    const key = calendarSealKey()
    if (!key) return null
    const plain = JSON.stringify(value)
    if (!plain || Buffer.byteLength(plain) > 24_000) return null
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(aad(binding, purpose))
    const bytes = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), bytes.toString('base64url')].join('.')
  } catch {
    return null
  }
}

export function openCalendarSecret(binding: CalendarSealBinding, purpose: Purpose, ciphertext: string | null | undefined): unknown {
  try {
    const key = calendarSealKey()
    if (!key || typeof ciphertext !== 'string' || ciphertext.length > 40_000) return null
    const parts = ciphertext.split('.')
    if (parts.length !== 4 || parts[0] !== 'v1' || parts.slice(1).some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return null
    const iv = Buffer.from(parts[1], 'base64url')
    const tag = Buffer.from(parts[2], 'base64url')
    if (iv.length !== 12 || tag.length !== 16) return null
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(aad(binding, purpose))
    decipher.setAuthTag(tag)
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8'))
  } catch {
    return null
  }
}
