// Pure parsers and verdicts behind public-surface.spec.ts (anonymous production-surface QA).
// No Playwright, no network: public-surface.test.ts drives these offline, and the spec feeds them
// real responses. Keeping the judgement here means the spec stays a thin fetch loop.

/** Disallow rules of the `*` group, in file order. */
export function robotsDisallows(robots: string): string[] {
  const out: string[] = []
  let inStar = false
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.trim()
    const lower = line.toLowerCase()
    if (lower.startsWith('user-agent:')) inStar = line.slice(11).trim() === '*'
    else if (inStar && lower.startsWith('disallow:')) {
      const rule = line.slice(9).trim()
      if (rule) out.push(rule)
    }
  }
  return out
}

export function robotsSitemaps(robots: string): string[] {
  return robots
    .split(/\r?\n/)
    .filter((l) => l.toLowerCase().startsWith('sitemap:'))
    .map((l) => l.slice(8).trim())
}

/** `<loc>` values of a sitemap or sitemap index. */
export function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'))
}

export function metaContent(html: string, attr: 'name' | 'property', key: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/g) ?? []) {
    const a = new RegExp(`${attr}="${key}"`).test(tag)
    if (a) return /content="([^"]*)"/.exec(tag)?.[1] ?? null
  }
  return null
}

export function canonicalHref(html: string): string | null {
  for (const tag of html.match(/<link\b[^>]*>/g) ?? []) {
    if (/rel="canonical"/.test(tag)) return /href="([^"]*)"/.exec(tag)?.[1] ?? null
  }
  return null
}

export function pageTitle(html: string): string | null {
  return /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? null
}

/** Every JSON-LD block; `error` is set for a block that does not parse. */
export function jsonLdBlocks(html: string): { data?: unknown; error?: string }[] {
  return [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => {
    try {
      return { data: JSON.parse(m[1]) }
    } catch (e) {
      return { error: (e as Error).message }
    }
  })
}

/** A sitemap URL that a robots Disallow rule blocks (prefix match; `$` anchors the end). */
export function blockedByRobots(path: string, disallows: string[]): string | null {
  for (const rule of disallows) {
    const anchored = rule.endsWith('$')
    const prefix = anchored ? rule.slice(0, -1) : rule
    if (anchored ? path === prefix : path.startsWith(prefix)) return rule
  }
  return null
}

/** Phrases the copy guard bans from any machine-readable surface (memory: no weekly promises). */
export const BANNED_MACHINE_COPY = [/gather every week/i]
