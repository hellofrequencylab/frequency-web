// AI doc-writer core (docs/SUPPORT-SYSTEM.md §6, ADR-067/041). Given a code change
// and the help articles it may have made stale (from lib/help/drift), it asks the
// model — for EACH article — whether a help update is warranted and what to check.
//
// Propose-only and advisory: the output is one PR comment with a staff checklist.
// Nothing is auto-committed or auto-published (ADR-028 copilot-first).
//
// Pure helpers here (prompt, parse, format, fallback) are unit-tested; the CI
// script (scripts/help-autodoc.mts) does the I/O and the guarded model call.

export interface AutodocArticle {
  category: string
  slug: string
  title: string
  body: string
}

export interface AutodocItem {
  category: string
  slug: string
  needsUpdate: boolean
  note: string
}

/** HTML marker so the CI job can update its single comment in place (not spam). */
export const AUTODOC_MARKER = '<!-- help-autodoc -->'

export const AUTODOC_SYSTEM = `You are a documentation reviewer for Frequency, a real-world community platform. You are given a code change (a list of changed files) and the member-facing help articles that cover the areas it touches.

For EACH article, decide whether this change likely requires a help-article update, and if so give a ONE-LINE note on what to check or change. Be conservative — only flag genuine member-facing behavior changes, not refactors or internal edits.

Respond with ONLY a JSON array, no prose, no markdown fences:
[{"category":"<category>","slug":"<slug>","needsUpdate":true|false,"note":"<short note, or empty>"}]`

/** Build the review prompt. Bodies are truncated to keep input cost bounded. */
export function buildAutodocMessages(
  changedFiles: string[],
  articles: AutodocArticle[],
): { system: string; messages: { role: 'user'; content: string }[] } {
  const files = changedFiles.map((f) => `- ${f}`).join('\n')
  const arts = articles
    .map((a) => `### ${a.category}/${a.slug} — ${a.title}\n${a.body.slice(0, 1200)}`)
    .join('\n\n')
  const content = `Changed files:\n${files}\n\nHelp articles covering the affected areas:\n\n${arts}\n\nReturn the JSON array described in the system prompt.`
  return { system: AUTODOC_SYSTEM, messages: [{ role: 'user', content }] }
}

/** Parse the model's JSON array, keeping only items that match a known article. */
export function parseAutodocResponse(text: string, articles: AutodocArticle[]): AutodocItem[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end <= start) return []
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const known = new Set(articles.map((a) => `${a.category}/${a.slug}`))
  const out: AutodocItem[] = []
  for (const r of raw as Record<string, unknown>[]) {
    const category = String(r?.category ?? '')
    const slug = String(r?.slug ?? '')
    if (!known.has(`${category}/${slug}`)) continue
    out.push({ category, slug, needsUpdate: Boolean(r?.needsUpdate), note: String(r?.note ?? '').slice(0, 200) })
  }
  return out
}

/** Deterministic fallback when the model is unavailable: flag every affected
 *  article for manual review, so the checklist still posts. */
export function fallbackItems(articles: AutodocArticle[]): AutodocItem[] {
  return articles.map((a) => ({
    category: a.category,
    slug: a.slug,
    needsUpdate: true,
    note: 'Review manually — AI review was unavailable.',
  }))
}

/** Render the advisory PR comment (with the marker for in-place updates). */
export function formatAdvisoryComment(items: AutodocItem[], changedFiles: string[]): string {
  const flagged = items.filter((i) => i.needsUpdate)
  const fine = items.filter((i) => !i.needsUpdate)

  const lines: string[] = [
    AUTODOC_MARKER,
    '## 📒 Help docs — review for this change',
    '',
    '_Advisory only — nothing is auto-published. Vera reviewed the help articles covering the areas this PR touches (docs/SUPPORT-SYSTEM.md §6)._',
    '',
  ]

  if (flagged.length === 0) {
    lines.push('✅ No help articles look like they need an update for this change.')
  } else {
    lines.push('**Please review / update before merge:**', '')
    for (const i of flagged) lines.push(`- [ ] \`content/help/${i.category}/${i.slug}.md\` — ${i.note || 'check for staleness'}`)
  }

  if (fine.length > 0) {
    lines.push('', `<sub>Checked, likely fine: ${fine.map((i) => `${i.category}/${i.slug}`).join(', ')}</sub>`)
  }

  lines.push('', `<sub>${changedFiles.length} changed file(s). On merge, the help index re-embeds automatically.</sub>`)
  return lines.join('\n')
}
