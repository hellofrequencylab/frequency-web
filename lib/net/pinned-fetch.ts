// A server-side GET that cannot be aimed at our own network (SCAN-1123, ADR-1820). The hostname is
// resolved ONCE, every address must be public, and the socket is then pinned to that address, so a
// second DNS answer (rebinding) never reaches the connection. Redirects are followed by hand and
// each hop is resolved and checked the same way; the body is capped; the whole call is time-boxed.
// The original hostname stays the Host header and the TLS identity. Returns null on ANY problem.
// Same technique as lib/qr/remote-logo.ts (#3919), widened to http, redirects and arbitrary headers.

import { lookup } from 'node:dns/promises'
import { request as httpRequest, type ClientRequest, type IncomingMessage, type RequestOptions } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'

const BLOCKED = new BlockList()
// IPv4: everything that is not global unicast.
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) BLOCKED.addSubnet(net, bits, 'ipv4')
// IPv6: loopback, unspecified, ULA, link-local, site-local, multicast, documentation, NAT64, 6to4, Teredo.
for (const [net, bits] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001::', 32], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) BLOCKED.addSubnet(net, bits, 'ipv6')

/** Whether an IP literal is outside global unicast space (or not an IP at all). IPv4-mapped IPv6
 *  (`::ffff:a.b.c.d`, either spelling) is judged by the embedded IPv4. PURE. */
export function isBlockedAddress(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, '')
  const family = isIP(ip)
  if (!family) return true
  if (family === 6) {
    const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip)
    if (dotted) return isBlockedAddress(dotted[1])
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip)
    if (hex) {
      const hi = parseInt(hex[1], 16)
      const lo = parseInt(hex[2], 16)
      return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
  }
  return BLOCKED.check(ip, family === 6 ? 'ipv6' : 'ipv4')
}

interface PinnedResponse {
  status: number
  /** Lowercased response headers (first value). */
  headers: Record<string, string>
  body: Buffer
  /** The url that produced the body, after redirects. */
  finalUrl: string
}

interface PinnedFetchOptions {
  /** Hard cap on the response body. Over it, the call returns null (or the first maxBytes, see truncate). */
  maxBytes: number
  /** Keep the first maxBytes of a longer body instead of failing (a page: the head is what we read). */
  truncate?: boolean
  /** Covers DNS, connect, every redirect hop and the whole body. */
  timeoutMs: number
  headers?: Record<string, string>
  /** Redirect hops followed (each re-checked). Default 3. */
  maxRedirects?: number
  /** Called with the status and headers before the body is read; return false to drop the response
   *  without downloading it (a wrong content type, a declared length over the cap). */
  accept?: (status: number, headers: Record<string, string>) => boolean
}

function flatHeaders(res: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(res.headers)) {
    if (v !== undefined) out[k] = Array.isArray(v) ? v[0] : v
  }
  return out
}

async function hop(url: URL, opts: PinnedFetchOptions, signal: { done: boolean }, track: (r: ClientRequest) => void): Promise<PinnedResponse | { redirect: string } | null> {
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const family = isIP(hostname)
  const addresses = family ? [{ address: hostname, family }] : await lookup(hostname, { all: true })
  if (signal.done || !addresses.length || addresses.some((a) => isBlockedAddress(a.address))) return null
  const chosen = addresses[0]
  const pinnedLookup: LookupFunction = (_host, options, callback) => {
    if (options.all) callback(null, [{ address: chosen.address, family: chosen.family }])
    else callback(null, chosen.address, chosen.family)
  }
  const options: RequestOptions & { autoSelectFamily: false } = {
    agent: false,
    lookup: pinnedLookup,
    autoSelectFamily: false,
    method: 'GET',
    headers: opts.headers,
  }
  const send: typeof httpRequest = url.protocol === 'https:' ? (httpsRequest as typeof httpRequest) : httpRequest
  return new Promise((resolve) => {
    const req = send(url, options, (res) => {
      const status = res.statusCode ?? 0
      const headers = flatHeaders(res)
      if (status >= 300 && status < 400 && headers.location) {
        res.destroy()
        resolve({ redirect: headers.location })
        return
      }
      const declared = Number(headers['content-length'])
      if (status < 200 || status >= 300 || (declared > opts.maxBytes && !opts.truncate) || (opts.accept && !opts.accept(status, headers))) {
        res.destroy()
        resolve({ status, headers, body: Buffer.alloc(0), finalUrl: url.href })
        return
      }
      const chunks: Buffer[] = []
      let bytes = 0
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > opts.maxBytes) {
          res.destroy()
          if (!opts.truncate) return resolve(null)
          const keep = chunk.length - (bytes - opts.maxBytes)
          chunks.push(chunk.subarray(0, keep))
          return resolve({ status, headers, body: Buffer.concat(chunks, opts.maxBytes), finalUrl: url.href })
        }
        chunks.push(chunk)
      })
      res.on('end', () => resolve({ status, headers, body: Buffer.concat(chunks, bytes), finalUrl: url.href }))
      res.on('error', () => resolve(null))
      res.on('aborted', () => resolve(null))
    })
    track(req)
    req.on('error', () => resolve(null))
    req.end()
  })
}

/** GET a public http(s) url. Null on a blocked address, a timeout, an oversized body, too many
 *  redirects, or any transport error. A non-2xx answer returns its status with an EMPTY body. */
export async function fetchPinned(rawUrl: string, opts: PinnedFetchOptions): Promise<PinnedResponse | null> {
  const signal = { done: false }
  let current: ClientRequest | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  // One deadline for DNS, connect, every hop and the body; a hung lookup cannot outlive it.
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      signal.done = true
      current?.destroy()
      resolve(null)
    }, opts.timeoutMs)
  })
  try {
    let url = new URL(rawUrl)
    for (let hops = 0; hops <= (opts.maxRedirects ?? 3); hops++) {
      const result = await Promise.race([hop(url, opts, signal, (r) => { current = r }), deadline])
      if (!result) return null
      if ('redirect' in result) {
        url = new URL(result.redirect, url)
        continue
      }
      return result
    }
    return null
  } catch {
    return null
  } finally {
    signal.done = true
    clearTimeout(timer)
  }
}
