// The heading anchors of a help article, shared by the renderer and the "On this page" list.
//
// HelpMarkdown gives every h2/h3 an id from its text (SCAN-805), so a support reply or an answer engine
// can point at one section. The Frequency help center lists an article's sections beside it; it reads
// them from the markdown source with the SAME slug, so every link lands on the id the renderer wrote.

/** A URL-safe id for a heading's plain text. "What if I miss a week?" -> what-if-i-miss-a-week. */
export function helpHeadingSlug(text: string): string | undefined {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
  return slug || undefined
}

/** The plain text a heading's inline markdown renders to: link text, code text, no emphasis marks. */
function inlineText(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/\*(.+?)\*/g, '$1')
    .trim()
}

export interface HelpTocEntry {
  id: string
  title: string
}

/**
 * The article's top-level sections: every line HelpMarkdown renders as an <h2> (`#` and `##`, since
 * a body-level `#` is demoted to h2 under the page's own h1), outside fenced code.
 */
export function helpToc(body: string): HelpTocEntry[] {
  const out: HelpTocEntry[] = []
  let fence: string | null = null
  for (const line of body.split(/\r?\n/)) {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (f) {
      if (!fence) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      continue
    }
    if (fence) continue
    const m = line.match(/^ {0,3}#{1,2}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/)
    if (!m) continue
    const title = inlineText(m[1])
    const id = helpHeadingSlug(title)
    if (id) out.push({ id, title })
  }
  return out
}
