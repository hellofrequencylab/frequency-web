// Pure, local campaign review. Copy promises are evidence about the message, never proof
// of reader intent or conversions. No destinations are fetched and no document is changed.

export type CampaignPromisedIntent = 'preview' | 'explore' | 'attend' | 'host' | 'unknown'
export type CampaignDestinationIntent = 'hosting' | 'attendance' | 'preview' | 'external' | 'unsupported' | 'unknown'

export interface CampaignLinkIntentInput {
  subject?: string
  preheader?: string
  body?: string
  html?: string
  layout?: unknown
  content?: unknown
  campaignId?: string
  siteUrl?: string
}

export interface CampaignIntentLink {
  label: string
  location: string
  destinationPath: string
  promisedIntent: CampaignPromisedIntent
  destinationIntent: CampaignDestinationIntent
}

export interface CampaignIntentFinding extends CampaignIntentLink {
  id: string
  code: 'promise_destination_mismatch'
  severity: 'warning'
  evidence: string
  recommendation: string
  question: string
}

export interface CampaignLinkIntentAudit {
  links: CampaignIntentLink[]
  findings: CampaignIntentFinding[]
  utmSuggestion: {
    source: 'email'
    medium: 'email'
    campaignId: string | null
    distinctCampaignPerIntent: true
    recommendation: string
  }
  truncated: boolean
}

const DEFAULT_ORIGIN = 'https://frequencylocal.com'
const MAX_TEXT = 250_000
const MAX_LINKS = 120
const MAX_OBJECTS = 2_000
const MAX_DEPTH = 16
const URL_KEYS = ['url', 'href', 'buttonUrl', 'ctaUrl', 'primaryUrl', 'secondaryUrl', 'linkUrl', 'actionUrl', 'primaryCtaUrl', 'secondaryCtaUrl', 'link'] as const
const TEXT_KEYS = ['label', 'buttonLabel', 'buttonText', 'ctaLabel', 'ctaText', 'linkLabel', 'primaryLabel', 'secondaryLabel', 'title', 'heading', 'text', 'body', 'description', 'html', 'subtitle'] as const

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function get(row: Record<string, unknown>, key: string): unknown {
  try { return row[key] } catch { return undefined }
}

function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    const named: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' }
    const known = named[entity.toLowerCase()]
    if (known) return known
    const code = entity.toLowerCase().startsWith('&#x') ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10)
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })
}

function plainText(value: string): string {
  return decodeEntities(value.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function promise(text: string, explicit = true): CampaignPromisedIntent {
  const value = plainText(text.slice(0, 1_000)).toLowerCase()
  const host = /\b(?:create|build|start|set up|publish|launch)\s+(?:your|my|a|an)\s+(?:space|site|website|event|circle|launch)\b|\b(?:start hosting|become a host|host your)\b/.test(value)
  const attend = /\b(?:rsvp|attend|join us|join the (?:event|gathering|launch)|save (?:my|your|a) (?:spot|seat)|come along|get (?:a |your )?tickets?|book (?:a |your )?(?:seat|spot|ticket))\b/.test(value)
  const preview = /\b(?:preview|take a look|see (?:the|our|a) launch|view (?:the|our) launch|come see)\b/.test(value)
  const explore = /\b(?:explore|browse|discover|take a tour|look around)\b/.test(value)
  // A CTA that names the hosting step is explicit about that ask. A mixed body is
  // weaker context and must not turn every generic footer link into a mismatch.
  if (host && (explicit || !(attend || preview || explore))) return 'host'
  if (host) return 'unknown'
  if (attend) return 'attend'
  if (preview) return 'preview'
  if (explore) return 'explore'
  return 'unknown'
}

function siteOrigin(siteUrl?: string): string {
  try {
    const url = new URL(siteUrl || DEFAULT_ORIGIN)
    return ['https:', 'http:'].includes(url.protocol) ? url.origin : DEFAULT_ORIGIN
  } catch { return DEFAULT_ORIGIN }
}

function target(href: string, siteUrl?: string): { intent: CampaignDestinationIntent; path: string } {
  if (!href || href.length > 2_048 || /[\u0000-\u001f]/.test(href)) return { intent: 'unsupported', path: '' }
  try {
    const origin = siteOrigin(siteUrl)
    const url = new URL(decodeEntities(href.trim()), origin)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return { intent: 'unsupported', path: '' }
    // A familiar path on another host is not evidence about that external page.
    const internal = url.origin === origin || ['frequencylocal.com', 'www.frequencylocal.com'].includes(url.hostname)
    if (!internal) return { intent: 'external', path: url.pathname.slice(0, 200) }
    let path = url.pathname
    try { path = decodeURIComponent(path) } catch { return { intent: 'unsupported', path: '' } }
    path = path.replace(/\/+$/, '') || '/'
    if (path === '/create-a-space' || path.startsWith('/create-a-space/') || path === '/launch' || path === '/launch/start') return { intent: 'hosting', path }
    if (path === '/events' || path.startsWith('/events/') || path === '/rsvp' || path.startsWith('/rsvp/')) return { intent: 'attendance', path: path.slice(0, 200) }
    if (path === '/' || path === '/discover' || path.startsWith('/discover/') || path === '/what-is-frequency') return { intent: 'preview', path: path.slice(0, 200) }
    return { intent: 'unknown', path: path.slice(0, 200) }
  } catch { return { intent: 'unsupported', path: '' } }
}

/** Classification is a reviewed local route contract, never a remote URL probe. */
export function campaignLinkIntent(href: string, siteUrl?: string): CampaignDestinationIntent {
  return target(href, siteUrl).intent
}

/** Review visible authored links in native row/cell nodes, legacy maps, HTML or body text. */
export function auditCampaignLinkIntent(input: CampaignLinkIntentInput): CampaignLinkIntentAudit {
  const links: CampaignIntentLink[] = []
  const findings: CampaignIntentFinding[] = []
  const seen = new WeakSet<object>()
  const dedupe = new Set<string>()
  let objects = 0
  let textRemaining = MAX_TEXT
  let truncated = false
  const context = plainText(`${(input.subject ?? '').slice(0, 500)} ${(input.preheader ?? '').slice(0, 500)}`).slice(0, 500)

  const textBudget = (value: string) => {
    const bounded = value.slice(0, Math.max(0, textRemaining))
    if (bounded.length < value.length) truncated = true
    textRemaining -= bounded.length
    return bounded
  }
  const add = (href: string, label: string, location: string, nearby: string) => {
    if (links.length >= MAX_LINKS) { truncated = true; return }
    const destination = target(href, input.siteUrl)
    const visibleLabel = plainText(label.slice(0, 1_000)).slice(0, 200) || 'Link'
    const promisedIntent = promise(visibleLabel) === 'unknown' ? promise(`${nearby} ${context}`, false) : promise(visibleLabel)
    const key = JSON.stringify([visibleLabel, destination.path, destination.intent, promisedIntent])
    if (dedupe.has(key)) return
    dedupe.add(key)
    const link: CampaignIntentLink = { label: visibleLabel, location, destinationPath: destination.path, promisedIntent, destinationIntent: destination.intent }
    links.push(link)
    if (destination.intent !== 'hosting' || !['preview', 'explore', 'attend'].includes(promisedIntent)) return
    findings.push({
      ...link, id: `campaign-link-intent-${findings.length + 1}`, code: 'promise_destination_mismatch', severity: 'warning',
      evidence: `The link promises ${promisedIntent === 'attend' ? 'attendance' : promisedIntent}, but ${destination.path} opens a hosting builder.`,
      recommendation: `Choose a destination that fulfils the ${promisedIntent === 'attend' ? 'attendance' : promisedIntent} promise, or make the hosting step clear before this link. Give this invitation its own campaign ID.`,
      question: 'What should a reader be able to do immediately after this click?',
    })
  }

  const scanText = (raw: string, location: string, nearby: string) => {
    const value = textBudget(raw).replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    const anchors = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
    for (const match of value.matchAll(anchors)) {
      const href = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+))/i.exec(match[1])
      if (href) add(href[1] ?? href[2] ?? href[3] ?? '', match[2], location, plainText(value.slice(Math.max(0, (match.index ?? 0) - 250), match.index)) || nearby)
    }
    let remaining = value.replace(anchors, ' ')
    const markdown = /\[([^\]\n]{1,300})\]\(([^\s)]+)\)/g
    for (const match of remaining.matchAll(markdown)) add(match[2], match[1], location, nearby)
    remaining = remaining.replace(markdown, ' ').replace(/<[^>]*>/g, ' ')
    for (const match of remaining.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      const prefix = remaining.slice(Math.max(0, (match.index ?? 0) - 200), match.index).split('\n').filter((line) => line.trim()).at(-1) ?? nearby
      add(match[0].replace(/[.,;!?]+$/, ''), prefix, location, nearby)
    }
  }

  const visit = (value: unknown, location: string, inherited: string, depth = 0): void => {
    if (depth > MAX_DEPTH || objects >= MAX_OBJECTS) { truncated = true; return }
    if (typeof value === 'string') { scanText(value, location, inherited); return }
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value); objects++
    if (Array.isArray(value)) { for (let i = 0; i < Math.min(value.length, MAX_OBJECTS); i++) visit(value[i], `${location}[${i}]`, inherited, depth + 1); return }
    const row = value as Record<string, unknown>
    if (get(row, 'hidden') === true) return
    const rows = get(row, 'rows')
    if (Array.isArray(rows)) {
      const content = record(get(row, 'content'))
      const hidden = new Set(Array.isArray(get(row, 'hidden')) ? (get(row, 'hidden') as unknown[]).filter((v): v is string => typeof v === 'string') : [])
      rows.slice(0, 64).forEach((rawRow, ri) => {
        const cells = record(rawRow)?.cells
        if (!Array.isArray(cells)) return
        if (cells.length > 8) truncated = true
        cells.slice(0, 8).forEach((cell, ci) => {
          if (!Array.isArray(cell)) return
          if (cell.length > 120) truncated = true
          cell.slice(0, 120).forEach((node, ni) => {
            if (typeof node === 'string') {
              if (!hidden.has(node) && content) visit(get(content, node), `${location}.content.${node.slice(0, 80)}`, inherited, depth + 1)
            } else visit(node, `${location}.rows[${ri}].cells[${ci}][${ni}]`, inherited, depth + 1)
          })
        })
      })
      if (rows.length > 64) truncated = true
      return // Bench and unplaced sibling bags are not sent content.
    }
    const localText = TEXT_KEYS.map((key) => get(row, key)).filter((v): v is string => typeof v === 'string').map((v) => plainText(v.slice(0, 500))).join(' ').slice(0, 500) || inherited
    for (const key of URL_KEYS) {
      const href = get(row, key)
      if (typeof href !== 'string') continue
      const prefixed = key.startsWith('secondary') ? ['secondaryLabel', 'secondaryText'] : key.startsWith('primary') ? ['primaryLabel', 'primaryText'] : []
      const label = [...prefixed, 'label', 'buttonLabel', 'buttonText', 'ctaLabel', 'ctaText', 'linkLabel', 'text', 'title'].map((name) => get(row, name)).find((v): v is string => typeof v === 'string' && !!v.trim()) ?? ''
      add(href, label, `${location}.${key}`, localText)
    }
    const keys = Object.keys(row)
    for (const key of keys.slice(0, 80)) {
      if (key === 'bench' || key === 'style' || key === 'hidden' || (URL_KEYS as readonly string[]).includes(key)) continue
      visit(get(row, key), `${location}.${key.slice(0, 80)}`, localText, depth + 1)
    }
    if (keys.length > 80) truncated = true
  }

  if (input.html) scanText(input.html, 'html', context)
  if (input.body) scanText(input.body, 'body', context)
  visit(input.layout, 'layout', context)
  visit(input.content, 'content', context)
  const id = input.campaignId ?? ''
  return {
    links, findings, truncated,
    utmSuggestion: {
      source: 'email', medium: 'email',
      campaignId: /^(?:\d{1,32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(id) ? id : null,
      distinctCampaignPerIntent: true,
      recommendation: 'Give preview, attendance and hosting campaigns distinct opaque utm_campaign IDs. Keep human labels in the private campaign record, not in tracking URLs.',
    },
  }
}
