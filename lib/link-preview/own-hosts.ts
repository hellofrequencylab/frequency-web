import { SITE_URL } from '@/lib/site'

/** Our own hosts: a link to one of these gets a live card, never an outside fetch (LIVE-2530). */
export function ownHosts(): string[] {
  const hosts = ['frequencylocal.com']
  try {
    hosts.push(new URL(SITE_URL).hostname)
  } catch {
    // The default above still covers production.
  }
  return [...new Set(hosts.map((h) => h.replace(/^www\./, '').toLowerCase()))]
}

export function isOwnHost(hostname: string): boolean {
  return ownHosts().includes(hostname.toLowerCase().replace(/^www\./, ''))
}
