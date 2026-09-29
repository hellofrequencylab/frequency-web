import 'server-only'
import { createHash, createHmac } from 'node:crypto'

// A minimal AWS Signature Version 4 signer for one S3-compatible request (HYG-144, ADR-1636).
//
// WHY NOT A LIBRARY. The nightly storage copy makes two kinds of call to Cloudflare R2 (a PUT of
// one object, nothing else), and R2 speaks the S3 API. `@aws-sdk/client-s3` is dozens of packages
// for that; `aws4fetch` is small but is not a dependency here, and a new dependency on a cron path
// still has to clear the deploy budgets (docs/DEPLOY-SAFETY.md). SigV4 for a single header-signed
// request is ~60 lines over node:crypto, and the test pins it to AWS's own published example, so
// the arithmetic is checked against the reference rather than against itself.
//
// SCOPE. Header auth only, one request at a time, no query-string presigning, no chunked
// (aws-chunked) payload signing. The body is sent as UNSIGNED-PAYLOAD, which S3 and R2 accept over
// TLS and which lets the copy stream a file it never holds in memory.

export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD'
/** The SHA-256 of an empty body, for a request with no payload. */
export const EMPTY_PAYLOAD_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

export interface SigV4Credentials {
  accessKeyId: string
  secretAccessKey: string
}

export interface SigV4Request {
  method: string
  /** The full request URL. Its pathname must already be URI-encoded once (see encodeS3Key). */
  url: string
  /** Headers to send and sign. `host`, `x-amz-date` and `x-amz-content-sha256` are added. */
  headers?: Record<string, string>
  /** Hex SHA-256 of the body, or UNSIGNED_PAYLOAD. Defaults to UNSIGNED_PAYLOAD. */
  payloadHash?: string
  region: string
  service: string
  /** Signing time; injectable for tests. */
  now?: Date
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex')
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

/** RFC 3986 encoding as SigV4 wants it: encodeURIComponent plus the five characters it leaves. */
export function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** An S3 object key as a URL path: each segment encoded, the slashes kept. S3 does not
 *  double-encode, so this string is both the request path and the canonical URI. */
export function encodeS3Key(key: string): string {
  return key.split('/').map(rfc3986).join('/')
}

/** `20130524T000000Z` */
export function amzDate(d: Date): string {
  return d.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '')
}

function canonicalQuery(search: URLSearchParams): string {
  return [...search.entries()]
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}

/**
 * Sign one request. Returns the headers to send: the caller's, plus `host`, `x-amz-date`,
 * `x-amz-content-sha256` and `authorization`. Every header passed is signed.
 */
export function signSigV4(req: SigV4Request, creds: SigV4Credentials): Record<string, string> {
  const url = new URL(req.url)
  const now = req.now ?? new Date()
  const stamp = amzDate(now)
  const day = stamp.slice(0, 8)
  const payloadHash = req.payloadHash ?? UNSIGNED_PAYLOAD

  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(req.headers ?? {})) headers[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ')
  headers.host = url.host
  headers['x-amz-date'] = stamp
  headers['x-amz-content-sha256'] = payloadHash

  const names = Object.keys(headers).sort()
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join('')
  const signedHeaders = names.join(';')
  const canonicalRequest = [
    req.method.toUpperCase(),
    url.pathname || '/',
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const scope = `${day}/${req.region}/${req.service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonicalRequest)].join('\n')
  const kDate = hmac(`AWS4${creds.secretAccessKey}`, day)
  const kRegion = hmac(kDate, req.region)
  const kService = hmac(kRegion, req.service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  return headers
}
