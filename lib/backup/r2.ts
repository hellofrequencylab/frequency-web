import 'server-only'
import { envStringOrNull } from '@/lib/env/string'
import { encodeS3Key, signSigV4, UNSIGNED_PAYLOAD } from '@/lib/backup/sigv4'

// The second store for Storage files: Cloudflare R2 over its S3-compatible API (HYG-144, ADR-1636).
//
// DARK UNTIL CONFIGURED. The owner creates the bucket and the API token (OWN-088); until all four
// variables below are set, `r2ConfigFromEnv()` answers null with the names that are missing and the
// nightly copy logs that and returns without touching anything. A half-set configuration is the
// same answer, never a guess.

export const R2_ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BACKUP_BUCKET'] as const

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

export type R2ConfigRead = { config: R2Config; missing: [] } | { config: null; missing: string[] }

/** Read the four R2 variables. Blank counts as unset (lib/env/string.ts). */
export function r2ConfigFromEnv(): R2ConfigRead {
  const values = R2_ENV_KEYS.map((k) => [k, envStringOrNull(k)] as const)
  const missing = values.filter(([, v]) => v === null).map(([k]) => k)
  if (missing.length > 0) return { config: null, missing }
  const [accountId, accessKeyId, secretAccessKey, bucket] = values.map(([, v]) => v as string)
  return { config: { accountId, accessKeyId, secretAccessKey, bucket }, missing: [] }
}

/** The object URL on R2's S3 endpoint (path style, the bucket in the path). */
export function r2ObjectUrl(config: R2Config, key: string): string {
  return `https://${config.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucket)}/${encodeS3Key(key)}`
}

export interface PutObjectInput {
  key: string
  body: ReadableStream<Uint8Array>
  /** Byte length of the body. S3 PutObject needs it for a streamed body. */
  contentLength: number
  contentType?: string | null
}

/**
 * PUT one object, streamed. Throws with R2's status and the head of its error body on a non-2xx,
 * so the copy loop stops and the cursor stays on the last object that landed. A PUT to the same
 * key replaces it, which is what makes a re-run of the same object harmless.
 */
export async function putR2Object(
  config: R2Config,
  input: PutObjectInput,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = r2ObjectUrl(config, input.key)
  const signed = signSigV4(
    {
      method: 'PUT',
      url,
      headers: {
        'content-length': String(input.contentLength),
        'content-type': input.contentType || 'application/octet-stream',
      },
      payloadHash: UNSIGNED_PAYLOAD,
      region: 'auto',
      service: 's3',
    },
    { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  )
  // fetch sets Host from the URL itself (the same value that was signed).
  const { host: _host, ...headers } = signed
  const res = await fetchImpl(url, {
    method: 'PUT',
    headers,
    body: input.body,
    // Node's fetch requires this for a stream body.
    duplex: 'half',
  } as RequestInit)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`R2 PUT ${input.key} failed: HTTP ${res.status} ${text.slice(0, 200)}`.trim())
  }
}
