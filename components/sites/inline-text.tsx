import { Fragment, type ReactNode } from 'react'
import { safeUrl, sanitizeInlineHtml } from '@/lib/entity-blocks/block-content'

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }
const decode = (value: string) => value.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity: string) => entities[entity] ?? '')

function markdown(text: string, accentStars: boolean, accentWord: string, depth = 0): ReactNode[] {
  if (depth > 8) return [text]
  const nodes: ReactNode[] = []
  const token = /\*\*([^*]+)\*\*|_([^_]+)_|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  function literal(value: string) {
    const at = accentWord ? value.toLowerCase().indexOf(accentWord.toLowerCase()) : -1
    if (at < 0) { nodes.push(value); return }
    nodes.push(value.slice(0, at), <span key={`accent-${nodes.length}`} className="mw-accent">{value.slice(at, at + accentWord.length)}</span>, value.slice(at + accentWord.length))
  }
  for (let match = token.exec(text); match; match = token.exec(text)) {
    literal(text.slice(last, match.index))
    const key = `mark-${match.index}`
    if (match[1]) nodes.push(<strong key={key}>{markdown(match[1], accentStars, accentWord, depth + 1)}</strong>)
    else if (match[2]) nodes.push(<em key={key}>{markdown(match[2], accentStars, accentWord, depth + 1)}</em>)
    else if (match[3]) nodes.push(accentStars ? <span key={key} className="mw-accent">{match[3]}</span> : <em key={key}>{match[3]}</em>)
    else {
      const href = safeUrl(match[5])
      nodes.push(href ? <a key={key} href={href}>{markdown(match[4], accentStars, accentWord, depth + 1)}</a> : match[4])
    }
    last = token.lastIndex
  }
  literal(text.slice(last))
  return nodes
}

/** React nodes from the existing inline allowlist: never insert raw stored HTML. */
export function InlineText({ text, accentStars = false, accentWord = '' }: { text: string; accentStars?: boolean; accentWord?: string }) {
  const html = sanitizeInlineHtml(text)
  const root: ReactNode[] = []
  const stack: { tag: string; href: string; nodes: ReactNode[] }[] = []
  const current = () => stack.at(-1)?.nodes ?? root
  const tags = /<(\/?)(b|strong|i|em|a|br)(?: href="([^"]*)")?(?: rel="[^"]*")?>/g
  let last = 0
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    current().push(...markdown(decode(html.slice(last, match.index)), accentStars, accentWord))
    const [, closing, tag, href] = match
    if (tag === 'br') current().push(<br key={`br-${match.index}`} />)
    else if (!closing) stack.push({ tag, href: decode(href ?? ''), nodes: [] })
    else {
      const frame = stack.pop()
      if (frame) {
        const key = `html-${match.index}`
        current().push(frame.tag === 'a' ? <a key={key} href={frame.href}>{frame.nodes}</a> : ['b', 'strong'].includes(frame.tag) ? <strong key={key}>{frame.nodes}</strong> : <em key={key}>{frame.nodes}</em>)
      }
    }
    last = tags.lastIndex
  }
  current().push(...markdown(decode(html.slice(last)), accentStars, accentWord))
  return <>{root.map((node, i) => <Fragment key={i}>{node}</Fragment>)}</>
}
