import type { ReactNode } from 'react'
import { safeOverviewHref } from '@/lib/spaces/leadership-overview'

// Inline Markdown for the website's Executive Overview (LIVE-864): bold, italics, code and links, as React
// text and elements only. No HTML is ever passed through, so owner text cannot inject markup; a link whose
// target is not a site path, an anchor or a web or mail address renders as its words alone.

const TOKEN = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|`[^`]+`|_[^_]+_|\*[^*]+\*)/

export function Inline({ text }: { text: string }): ReactNode {
  const parts = text.split(TOKEN).filter((p) => p !== '')
  return parts.map((p, i) => {
    if (p.startsWith('***') && p.endsWith('***') && p.length > 6) return <strong key={i}><em>{p.slice(3, -3)}</em></strong>
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p)
    if (link) {
      const href = safeOverviewHref(link[2])
      return href ? (
        <a key={i} href={href}>
          {link[1]}
        </a>
      ) : (
        link[1]
      )
    }
    if ((p.startsWith('_') && p.endsWith('_')) || (p.startsWith('*') && p.endsWith('*'))) {
      if (p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>
    }
    return p
  })
}
