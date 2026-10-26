import { lookup } from 'node:dns/promises'
import { request, type RequestOptions } from 'node:https'
import type { ClientRequest } from 'node:http'
import { isIP, type LookupFunction } from 'node:net'
import { isPrivateIp, isSafeLogoSrc } from './style'

const MAX_BYTES = 512 * 1024

/** HTTPS only, no redirects, no pooled sockets, and no second DNS resolution. The
 * original URL hostname remains the HTTP Host and TLS certificate/SNI identity. */
export function fetchPinnedLogo(url: URL): Promise<string | null> {
  if (url.protocol !== 'https:' || !isSafeLogoSrc(url.href) || url.username || url.password) return Promise.resolve(null)
  return new Promise(resolve => {
    let req: ClientRequest | undefined
    let finished = false
    const finish = (value: string | null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve(value)
    }
    // Includes DNS lookup, TLS connection and the entire response, not just idle time.
    const timer = setTimeout(() => {
      finish(null)
      req?.destroy()
    }, 4000)
    void (async () => {
      try {
        const hostname = url.hostname.replace(/^\[|\]$/g, '')
        const family = isIP(hostname)
        const addresses = family ? [{ address: hostname, family }] : await lookup(hostname, { all: true })
        if (finished) return
        if (!addresses.length || addresses.some(a => !isIP(a.address) || isPrivateIp(a.address))) {
          finish(null)
          return
        }
        const chosen = addresses[0]
        const pinnedLookup: LookupFunction = (_host, options, callback) => {
          if (options.all) callback(null, [{ address: chosen.address, family: chosen.family }])
          else callback(null, chosen.address, chosen.family)
        }
        // HTTPS forwards socket options; Node's RequestOptions typing omits this net option.
        const options: RequestOptions & { autoSelectFamily: false } = { agent: false, lookup: pinnedLookup, autoSelectFamily: false }
        req = request(url, options, response => {
          // node:https never follows redirects. Reject every non-success, without reading it.
          const type = response.headers['content-type'] ?? 'image/png'
          const declared = Number(response.headers['content-length'])
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300 || !type.startsWith('image/') || declared > MAX_BYTES) {
            response.destroy()
            finish(null)
            return
          }
          const chunks: Buffer[] = []
          let bytes = 0
          response.on('data', (chunk: Buffer) => {
            if (finished || chunk.length === 0) return
            bytes += chunk.length
            if (bytes > MAX_BYTES) {
              finish(null)
              response.destroy()
              req?.destroy()
              return
            }
            chunks.push(chunk)
          })
          response.on('end', () => finish(`data:${type};base64,${Buffer.concat(chunks, bytes).toString('base64')}`))
          response.on('error', () => finish(null))
          response.on('aborted', () => finish(null))
          response.on('close', () => finish(null))
        })
        req.on('error', () => finish(null))
        req.end()
      } catch {
        finish(null)
        req?.destroy()
      }
    })()
  })
}
