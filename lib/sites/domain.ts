import { isAppHost, normalizeHost } from './host'

// THE SITE DOMAIN SHAPE (PROG-E10). PURE: what an owner types in the Domain section becomes the bare
// apex domain stored in spaces.domain, or a plain reason it cannot.

export type DomainParse = { ok: true; domain: string } | { ok: false; error: string }

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/

/** Turn `https://www.DanielTyack.com/about` into `danieltyack.com`, or say why it is not a domain. */
export function parseSiteDomain(input: string): DomainParse {
  let raw = input.trim().toLowerCase()
  if (!raw) return { ok: false, error: 'Enter your domain, like yourname.com.' }
  raw = raw.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0]
  const host = normalizeHost(raw).replace(/^www\./, '').replace(/\.$/, '')
  const labels = host.split('.')
  if (host.length > 253 || labels.length < 2 || !labels.every((l) => LABEL.test(l)) || /^\d+$/.test(labels[labels.length - 1])) {
    return { ok: false, error: 'That does not look like a domain. Enter it like yourname.com.' }
  }
  if (isAppHost(host)) return { ok: false, error: 'That domain belongs to Frequency. Enter your own domain.' }
  return { ok: true, domain: host }
}
