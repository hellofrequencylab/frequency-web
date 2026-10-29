// Real-content fixture for the theme audit (LIVE-1850, docs/THEME-COHESION.md). Default props hide blocks: many
// ship with empty arrays and blank strings, so a block can render almost nothing and look fine. This fills every
// empty field from the field schema with the sort of copy and images a Space owner would paste in, so the audit
// sees the block's real markup. Pure and deterministic: the same schema gives the same props.

type Field = {
  type?: string
  options?: Array<{ value: unknown }>
  arrayFields?: Record<string, Field>
  objectFields?: Record<string, Field>
  min?: number
}
type Component = { fields?: Record<string, Field>; defaultProps?: Record<string, unknown> }

// A neutral inline image keeps the render offline. It uses currentColor-free grey so it cannot mask a theme defect.
const IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="lightgray"/><circle cx="600" cy="400" r="180" fill="gray"/></svg>',
)}`

const WORDS = ['Gather', 'Breathe', 'Move', 'Rest', 'Share', 'Return']

function textFor(key: string, n: number): string {
  const k = key.toLowerCase()
  if (/href|url|link|cta.*(url|link)/.test(k)) return '/'
  if (/image|photo|src|cover|poster|avatar|logo|thumb|icon/.test(k)) return IMAGE
  if (/email/.test(k)) return 'hello@example.com'
  if (/price|amount|cost/.test(k)) return '$40'
  if (/date|when/.test(k)) return 'Saturday 14 March'
  if (/time/.test(k)) return '6:30 pm'
  if (/eyebrow|kicker|label|tag|badge|stat/.test(k)) return WORDS[n % WORDS.length]
  if (/title|heading|headline|name|question|quote/.test(k)) return `${WORDS[n % WORDS.length]} with the people who show up`
  if (/button|cta|action/.test(k)) return 'Join the next gathering'
  if (/body|text|description|copy|answer|sub|lead|intro|caption|note|bio|detail/.test(k)) {
    return 'We meet every second Saturday in the old hall. Bring a mat, a friend, or nothing at all. Tea is on.'
  }
  return `${WORDS[n % WORDS.length]} together`
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
}

function fill(key: string, field: Field, current: unknown, n: number): unknown {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return isEmpty(current) ? textFor(key, n) : current
    case 'number':
      return isEmpty(current) ? (field.min ?? 3) : current
    case 'select':
    case 'radio':
      return isEmpty(current) ? field.options?.[0]?.value : current
    case 'object': {
      const base = (current && typeof current === 'object' ? current : {}) as Record<string, unknown>
      return fillAll(field.objectFields ?? {}, base, n)
    }
    case 'array': {
      const rows = Array.isArray(current) && current.length ? (current as Record<string, unknown>[]) : [{}, {}, {}]
      return rows.map((row, i) => fillAll(field.arrayFields ?? {}, row ?? {}, n + i))
    }
    case 'custom':
      // Custom fields are image pickers or editor widgets. Only the image ones hold content the page can show.
      return isEmpty(current) && /image|photo|src|cover|poster|logo|avatar/i.test(key) ? IMAGE : current
    default:
      return current
  }
}

function fillAll(fields: Record<string, Field>, base: Record<string, unknown>, n: number): Record<string, unknown> {
  const out = { ...base }
  for (const [key, field] of Object.entries(fields)) {
    const next = fill(key, field, out[key], n)
    if (next !== undefined) out[key] = next
  }
  return out
}

/** Props for one block: its defaults, with every empty field filled from the schema. */
export function realContentProps(component: Component, id: string): Record<string, unknown> {
  return { ...fillAll(component.fields ?? {}, { ...(component.defaultProps ?? {}) }, 0), id }
}
