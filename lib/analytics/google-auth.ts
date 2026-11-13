// Server/CLI credential adapter. Only imported by guarded server code and local readiness tooling.
// This uses Google's readonly OAuth scope and fixed token endpoint, never a credential-file URL.
import { createHash, sign } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const GOOGLE_ANALYTICS_READ_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
type Env = Record<string, string | undefined>
interface ServiceAccount { client_email: string; private_key: string; private_key_id?: string }
interface TokenCache { key: string; token: string; until: number }
let cached: TokenCache | null = null
let inflight: { key: string; promise: Promise<string | null> } | null = null

export function googleCredentialConfigured(env: Env = process.env): boolean {
  return !!(env.GA4_REPORTING_ACCESS_TOKEN?.trim() || env.GA4_REPORTING_CREDENTIALS_JSON?.trim() || env.GOOGLE_APPLICATION_CREDENTIALS?.trim())
}

function account(raw: string): ServiceAccount | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const v = value as Record<string, unknown>
    if (v.type !== 'service_account' || typeof v.client_email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(v.client_email) || typeof v.private_key !== 'string' || v.private_key.length > 16384) return null
    if (v.token_uri !== undefined && v.token_uri !== TOKEN_ENDPOINT) return null
    return { client_email: v.client_email, private_key: v.private_key, ...(typeof v.private_key_id === 'string' ? { private_key_id: v.private_key_id.slice(0, 256) } : {}) }
  } catch { return null }
}

export function googleReportingCredentialKey(env: Env = process.env): string {
  // Fingerprint only for private in-process caches; never logged or returned to a browser.
  return createHash('sha256').update([env.GA4_REPORTING_ACCESS_TOKEN || '', env.GA4_REPORTING_CREDENTIALS_JSON || '', env.GOOGLE_APPLICATION_CREDENTIALS || ''].join('\0')).digest('hex')
}

/** Used only after an explicit property has been configured. A generic ADC binding is not proof of GA access. */
export async function getGoogleReportingAccessToken(options: {
  env?: Env; request?: typeof fetch; now?: () => number;
  readCredentialFile?: (path: string) => Promise<string | null>;
} = {}): Promise<string | null> {
  const env = options.env ?? process.env
  const token = env.GA4_REPORTING_ACCESS_TOKEN?.trim()
  if (token) return token.length <= 8192 && !/[\r\n]/.test(token) ? token : null
  const readCredentialFile = options.readCredentialFile ?? (async (path: string) => {
    try {
      const metadata = await stat(path)
      if (!metadata.isFile() || metadata.size > 65536) return null
      return await readFile(path, 'utf8')
    } catch { return null }
  })
  const raw = env.GA4_REPORTING_CREDENTIALS_JSON?.trim() || (env.GOOGLE_APPLICATION_CREDENTIALS ? await readCredentialFile(env.GOOGLE_APPLICATION_CREDENTIALS) : null)
  if (!raw || raw.length > 65536) return null
  const credential = account(raw)
  // Unsupported ADC types fail closed. Do not extract an unrelated platform identity or invent a user login.
  if (!credential) return null
  const key = createHash('sha256').update(raw).digest('hex')
  const now = options.now ?? Date.now
  if (cached?.key === key && cached.until > now()) return cached.token
  if (inflight?.key === key) return inflight.promise
  const exchange = async (): Promise<string | null> => {
    try {
      const issued = Math.floor(now() / 1000)
      const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
      const unsigned = `${encode({ alg: 'RS256', typ: 'JWT', ...(credential.private_key_id ? { kid: credential.private_key_id } : {}) })}.${encode({ iss: credential.client_email, scope: GOOGLE_ANALYTICS_READ_SCOPE, aud: TOKEN_ENDPOINT, iat: issued, exp: issued + 3600 })}`
      const assertion = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), credential.private_key).toString('base64url')}`
      const response = await (options.request ?? fetch)(TOKEN_ENDPOINT, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
        redirect: 'error', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8000),
      })
      if (!response.ok || Number(response.headers.get('content-length')) > 65536) return null
      if (!response.body) return null
      const reader = response.body.getReader()
      const parts: Uint8Array[] = []
      let bytes = 0
      try {
        while (true) {
          const part = await reader.read()
          if (part.done) break
          bytes += part.value.byteLength
          if (bytes > 65536) return null
          parts.push(part.value)
        }
      } finally { await reader.cancel().catch(() => undefined) }
      const text = Buffer.concat(parts).toString('utf8')
      const value: unknown = JSON.parse(text)
      if (!value || typeof value !== 'object') return null
      const v = value as Record<string, unknown>
      if (typeof v.access_token !== 'string' || !v.access_token || v.access_token.length > 8192 || /[\r\n]/.test(v.access_token) || typeof v.expires_in !== 'number' || v.expires_in <= 60 || (v.token_type !== undefined && String(v.token_type).toLowerCase() !== 'bearer')) return null
      cached = { key, token: v.access_token, until: now() + (Math.min(v.expires_in, 3600) - 60) * 1000 }
      return cached.token
    } catch { return null }
  }
  const promise = exchange()
  inflight = { key, promise }
  try { return await promise } finally { if (inflight?.promise === promise) inflight = null }
}
