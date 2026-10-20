// A check-in link: `/n/<nodeId>?s=<signed code>` on the site, the same thing a QR code and a venue NFC
// tag carry (APP-CONTRACT §12). Pure: tested under plain Node (node-link.test.ts).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type NodeLink = { nodeId: string; secret: string | null }

/** The production site. A check-in link from any other host (a local or preview deployment) is still
 *  a valid link; the tag writer just says so. */
export const SITE_HOST = 'frequencylocal.com'

type ParsedNodeLink = NodeLink & { host: string | null }

/** Parse a check-in link from a tag, a deep link or a pasted URL. Accepts an http(s) link on a host in
 *  `hosts` (or any host when `hosts` is '*'), the app's own `frequency://n/<id>` scheme and a bare
 *  `/n/<id>` path. */
export function parseNodeLink(input: string, hosts: readonly string[] | '*'): ParsedNodeLink | null {
  const text = input.trim()
  let path: string
  let query: string
  let linkHost: string | null = null
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?/i.exec(text)
  if (m) {
    const scheme = m[1]!.toLowerCase()
    const host = m[2]!.toLowerCase().replace(/^www\./, '')
    if (scheme === 'frequency') {
      // frequency://n/<id>: the "host" is the first path segment.
      path = `/${host}${m[3] ?? ''}`
    } else if ((scheme === 'https' || scheme === 'http') && (hosts === '*' || hosts.some((h) => h.toLowerCase() === host))) {
      path = m[3] ?? ''
      linkHost = host
    } else {
      return null
    }
    query = m[4] ?? ''
  } else if (text.startsWith('/n/')) {
    const q = text.indexOf('?')
    path = q < 0 ? text : text.slice(0, q)
    query = q < 0 ? '' : text.slice(q)
  } else {
    return null
  }
  const pm = /^\/n\/([^/?#]+)\/?$/.exec(path)
  if (!pm) return null
  const nodeId = decodeURIComponent(pm[1]!)
  if (!UUID.test(nodeId)) return null
  return { nodeId: nodeId.toLowerCase(), secret: readParam(query, 's'), host: linkHost }
}

function readParam(query: string, name: string): string | null {
  for (const pair of query.replace(/^\?/, '').split('&')) {
    const [k, v] = pair.split('=')
    if (k === name && v) {
      try {
        return decodeURIComponent(v.replace(/\+/g, ' '))
      } catch {
        return v
      }
    }
  }
  return null
}
