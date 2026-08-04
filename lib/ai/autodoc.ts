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

/** Why the AI review did not run. `null` ⇒ Vera reviewed the change normally.
 *  A degraded run must SAY SO once, at the top of the comment — never disguise
 *  itself as 40-odd polite "review manually" rows, which reads like advice
 *  instead of the outage it is. */
export type AutodocDegradedReason =
  | { kind: 'no-key' }
  | { kind: 'ai-disabled' }
  | { kind: 'call-failed'; detail: string }
  | { kind: 'unusable-response' }

/** One-line cause + the exact action that restores the review. */
export function degradedNotice(reason: AutodocDegradedReason): { cause: string; action: string } {
  switch (reason.kind) {
    case 'no-key':
      return {
        cause: 'No AI credential is available to this workflow, so the model was never called.',
        action:
          'Repo owner: add an `ANTHROPIC_API_KEY` repository secret (Settings → Secrets and variables → Actions), or set `AI_GATEWAY_URL` + `AI_GATEWAY_API_KEY` to route through the gateway.',
      }
    case 'ai-disabled':
      return {
        cause: '`AI_DISABLED=1` is set for this workflow, so AI is switched off on purpose.',
        action: 'Repo owner: unset `AI_DISABLED` for the help-autodoc workflow to bring the review back.',
      }
    case 'call-failed':
      return {
        cause: `The model call failed: \`${reason.detail.replace(/\s+/g, ' ').slice(0, 300)}\``,
        action:
          'Check the help-autodoc job log for the full error. A rejected key, a stale model id, and a provider outage all land here.',
      }
    case 'unusable-response':
      return {
        cause: 'The model replied, but nothing in the reply could be read as a review of these articles.',
        action: 'Check the help-autodoc job log for the raw reply.',
      }
  }
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

/** Salvage the complete `{...}` objects from a truncated or trailing-garbage array.
 *  A long article list can run the reply into its max_tokens ceiling mid-array; without
 *  this every such run collapsed to zero items and the whole comment went to fallback,
 *  throwing away the reviews the model HAD finished. */
function salvageObjects(text: string): unknown[] {
  const out: unknown[] = []
  let depth = 0
  let objStart = -1
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && objStart !== -1) {
        try {
          out.push(JSON.parse(text.slice(objStart, i + 1)))
        } catch {
          // skip an object we can't read; keep scanning for the next one
        }
        objStart = -1
      }
      if (depth < 0) depth = 0
    }
  }
  return out
}

/** Output budget for the review call. One verdict object costs roughly 90 output
 *  tokens once it carries a note, so the old fixed 800 truncated any list past ~8
 *  articles — and a truncated array used to parse to nothing, sending the whole
 *  comment to fallback. Scale with the list, with a ceiling so cost stays bounded. */
export function autodocMaxTokens(articleCount: number): number {
  // 240/article, floor 1200, and the reason is measured rather than guessed: a 14-article run
  // on 2026-08-04 came back with 9 of 14 "cut short" under the old 120/article budget, which
  // gave that run 1,880 tokens. One verdict object is ~30 tokens of keys plus a note capped at
  // 200 characters (~50 tokens), so ~80 is the floor for the DATA alone -- and a reply that
  // opens with a sentence of preamble, or writes fuller notes on a diff that touches a lot,
  // spends the rest of that margin before it reaches the array.
  //
  // Truncation here is not silent (withUnreviewed lists what went unchecked, which is the right
  // behaviour and is how this was caught) but a checklist that says "not reviewed" nine times is
  // a checklist nobody reads. Doubling the per-article allowance costs output tokens only on
  // large runs and buys the difference between an advisory and a shrug.
  return Math.min(8000, Math.max(1200, 300 + articleCount * 240))
}

/** Parse the model's JSON array, keeping only items that match a known article.
 *  Falls back to object-by-object salvage when the array itself won't parse. */
export function parseAutodocResponse(text: string, articles: AutodocArticle[]): AutodocItem[] {
  const known = new Set(articles.map((a) => `${a.category}/${a.slug}`))

  // TITLE-DERIVED SLUGS. A model handed an article whose front-matter title is "Your Space
  // Contacts" and whose file is spaces/space-crm.md will sometimes answer `your-space-contacts`,
  // because that is what the article calls itself. That is a correct review wearing the wrong
  // label, and none of the path/tail rules below can recover it — the two strings share nothing.
  // Observed live on PR #2025: both requested articles came back title-slugged, every row
  // dropped, and the advisory reported a total outage while the model had in fact done the work.
  //
  // Built only from titles that slugify UNIQUELY; a collision would make this a guess, and a
  // wrong verdict attached to the wrong article is worse than an unreviewed one.
  const titleSlug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const byTitle = new Map<string, string>()
  const titleCounts = new Map<string, number>()
  for (const a of articles) {
    const t = titleSlug(a.title)
    if (!t) continue
    titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1)
    byTitle.set(t, `${a.category}/${a.slug}`)
  }
  for (const [t, n] of titleCounts) if (n > 1) byTitle.delete(t)

  // IDENTIFY AN ARTICLE FROM WHATEVER SHAPE THE MODEL USED.
  // The strict reading — require `category` and `slug` as separate exact fields — is why a
  // reply that WAS a review still produced "nothing in the reply could be read as a review":
  // one unasked-for shape (a `path`, a slug carrying its own category, a trailing `.md`) drops
  // every row, and the comment then reports a total outage. The prompt still asks for the
  // strict shape; this only stops a near-miss from being scored as a zero.
  const identify = (r: Record<string, unknown>): string | null => {
    const direct = `${String(r?.category ?? '')}/${String(r?.slug ?? '')}`
    if (known.has(direct)) return direct
    // A single path-ish field, in any of the forms a model reasonably picks.
    for (const key of ['path', 'file', 'article', 'slug']) {
      const v = String(r?.[key] ?? '').trim()
      if (!v) continue
      const cleaned = v
        .replace(/^\.?\/?(?:content\/)?(?:help\/)?/, '')
        .replace(/\.md$/, '')
        .replace(/^\/+|\/+$/g, '')
      if (known.has(cleaned)) return cleaned
      // Last resort: match on the final segment when it is unambiguous.
      const tail = cleaned.split('/').pop() ?? ''
      const hits = [...known].filter((k) => k.endsWith(`/${tail}`))
      if (tail && hits.length === 1) return hits[0]!
      // ...or the model labelled the row with the article's TITLE rather than its filename.
      const byTitleHit = byTitle.get(titleSlug(tail || cleaned))
      if (byTitleHit) return byTitleHit
    }
    return null
  }

  // Try every plausible JSON array in the reply, not just the first '[' to the last ']'.
  // Prose like "Here are the results [see notes]:" ahead of the payload made that single span
  // unparseable, and the salvage pass then ran on the same bad slice.
  const candidates: unknown[] = []
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  for (const body of [fenced?.[1], text]) {
    if (!body) continue
    let from = body.indexOf('[')
    while (from !== -1) {
      const to = body.lastIndexOf(']')
      if (to > from) {
        try {
          const parsed: unknown = JSON.parse(body.slice(from, to + 1))
          if (Array.isArray(parsed)) { candidates.push(parsed); break }
        } catch { /* try the next opening bracket */ }
      }
      from = body.indexOf('[', from + 1)
    }
  }
  let raw: unknown = candidates.find((c) => Array.isArray(c) && (c as unknown[]).length > 0)
  if (!Array.isArray(raw)) raw = salvageObjects(text)
  if (!Array.isArray(raw) || raw.length === 0) return []

  const out: AutodocItem[] = []
  for (const r of raw as Record<string, unknown>[]) {
    const key = identify(r ?? {})
    if (!key) continue
    const [category, ...rest] = key.split('/')
    out.push({
      category: category ?? '',
      slug: rest.join('/'),
      needsUpdate: Boolean(r?.needsUpdate ?? r?.needs_update ?? r?.update),
      note: String(r?.note ?? r?.reason ?? '').slice(0, 200),
    })
  }
  return out
}

/** Deterministic fallback when the model is unavailable: list every affected
 *  article, so the lookup still posts. The comment header — not these notes —
 *  carries the outage; see formatAdvisoryComment. */
export function fallbackItems(articles: AutodocArticle[]): AutodocItem[] {
  return articles.map((a) => ({
    category: a.category,
    slug: a.slug,
    needsUpdate: true,
    note: '',
  }))
}

/** Add an explicit row for any affected article the model returned no verdict for
 *  (a reply cut short mid-array). Without this a partial review would silently
 *  drop articles from the checklist, which is worse than saying they're unchecked. */
export function withUnreviewed(items: AutodocItem[], articles: AutodocArticle[]): AutodocItem[] {
  const seen = new Set(items.map((i) => `${i.category}/${i.slug}`))
  const missing = articles
    .filter((a) => !seen.has(`${a.category}/${a.slug}`))
    .map((a): AutodocItem => ({
      category: a.category,
      slug: a.slug,
      needsUpdate: true,
      note: 'Not reviewed (the model reply was cut short) — check this one manually.',
    }))
  return [...items, ...missing]
}

/** Render the advisory PR comment (with the marker for in-place updates).
 *
 *  When `degraded` is set the comment leads with ONE ⚠️ banner naming the outage and
 *  the fix, and the article list collapses into a lookup — not a checklist. A run
 *  where nothing was reviewed must not look like a run where everything was. */
export function formatAdvisoryComment(
  items: AutodocItem[],
  changedFiles: string[],
  degraded: AutodocDegradedReason | null = null,
): string {
  const lines: string[] = [AUTODOC_MARKER, '## 📒 Help docs — review for this change', '']

  if (degraded) {
    const { cause, action } = degradedNotice(degraded)
    lines.push(
      `> ⚠️ **The AI review did not run.** ${cause}`,
      '>',
      `> ${action}`,
      '>',
      `> The ${items.length} article(s) below are simply everything mapped to the routes this PR touches (docs/SUPPORT-SYSTEM.md §6). Nothing has been checked against the diff, so treat this as a lookup, not a to-do list.`,
      '',
      `<details><summary>${items.length} article(s) covering the touched routes</summary>`,
      '',
    )
    for (const i of items) lines.push(`- \`content/help/${i.category}/${i.slug}.md\``)
    lines.push('', '</details>', '', `<sub>${changedFiles.length} changed file(s). On merge, the help index re-embeds automatically.</sub>`)
    return lines.join('\n')
  }

  const flagged = items.filter((i) => i.needsUpdate)
  const fine = items.filter((i) => !i.needsUpdate)

  lines.push(
    '_Advisory only — nothing is auto-published. Vera reviewed the help articles covering the areas this PR touches (docs/SUPPORT-SYSTEM.md §6)._',
    '',
  )

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
