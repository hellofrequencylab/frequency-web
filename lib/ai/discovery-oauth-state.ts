import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export interface SearchConnectionBinding {
  spaceId: string
  provider: 'google_search_console' | 'bing_webmaster'
  connectionId: string
  revision: number
  actorProfileId: string
  consentId: string
  propertyUrl: string
  propertyScope: 'dedicated_property' | 'page_urls'
}
/** Dedicated key only. No service-role/OAuth/client secret fallback and no plaintext persistence. */
function key(): Buffer | null {
  const encoded = process.env.DISCOVERY_OAUTH_ENCRYPTION_KEY
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) return null
  const bytes = Buffer.from(encoded, 'base64')
  return bytes.length === 32 && bytes.toString('base64') === encoded ? bytes : null
}
function aad(binding: SearchConnectionBinding, purpose: 'pending' | 'tokens'): Buffer {
  return Buffer.from(JSON.stringify([1, purpose, binding.spaceId, binding.provider, binding.connectionId, binding.actorProfileId, binding.consentId, binding.propertyUrl, binding.propertyScope]))
}
export function sealSearchSecret(binding: SearchConnectionBinding, purpose: 'pending' | 'tokens', value: unknown): string | null {
  try {
    const secret = key()
    if (!secret) return null
    const plain = JSON.stringify(value)
    if (!plain || Buffer.byteLength(plain) > 24_000) return null
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', secret, iv)
    cipher.setAAD(aad(binding, purpose))
    const bytes = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), bytes.toString('base64url')].join('.')
  } catch { return null }
}
export function openSearchSecret(binding: SearchConnectionBinding, purpose: 'pending' | 'tokens', ciphertext: string): unknown | null {
  try {
    const secret = key()
    if (!secret || typeof ciphertext !== 'string' || ciphertext.length > 40_000) return null
    const parts = ciphertext.split('.')
    if (parts.length !== 4 || parts[0] !== 'v1' || parts.slice(1).some(p => !/^[A-Za-z0-9_-]+$/.test(p))) return null
    const iv = Buffer.from(parts[1], 'base64url'), tag = Buffer.from(parts[2], 'base64url')
    if (iv.length !== 12 || tag.length !== 16) return null
    const cipher = createDecipheriv('aes-256-gcm', secret, iv)
    cipher.setAAD(aad(binding, purpose)); cipher.setAuthTag(tag)
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(parts[3], 'base64url')), cipher.final()]).toString('utf8'))
  } catch { return null }
}
export function newSearchOAuthState(connectionId: string) {
  const nonce = randomBytes(32).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  return { state: `${connectionId}.${nonce}`, nonceHash: createHash('sha256').update(nonce).digest('hex'), verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}
export function parseSearchOAuthState(state: string): { connectionId: string; nonceHash: string } | null {
  if (typeof state !== 'string' || state.length !== 80) return null
  const [connectionId, nonce, extra] = state.split('.')
  if (extra || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(connectionId) || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) return null
  return { connectionId, nonceHash: createHash('sha256').update(nonce).digest('hex') }
}
