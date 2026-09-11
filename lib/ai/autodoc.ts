// AI doc-writer core (docs/SUPPORT-SYSTEM.md §6, ADR-067/041). Given a code change
// and the help articles it may have made stale (from lib/help/drift), it asks the
// model — for EACH article — whether the change made the article INACCURATE, and
// makes it prove that with a quote from each side.
//
// Propose-only and advisory: the output is one PR comment with a staff checklist.
// Nothing is auto-committed or auto-published (ADR-028 copilot-first).
//
// Pure helpers here (prompt, parse, ground, format, batch) are unit-tested; the CI
// script (scripts/help-autodoc.mts) does the I/O and the guarded model call.
//
// 🔴 THIS MODULE IMPORTS NOTHING, AND THAT IS LOAD-BEARING. scripts/help-autodoc.mts runs under
// `node --experimental-strip-types` and imports this file directly, where a relative specifier
// must carry its extension. An extensionless `./schema` import here fails the autodoc job at
// load, before a line of it runs. Keep the row-shape check below in plain code rather than
// reaching for the shared validator.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// 🔴 WHY THIS FILE LOOKS THE WAY IT DOES — the four defect classes measured on PR #2539.
//
// 1. IT WAS ASKED TO REVIEW A CHANGE IT WAS NEVER SHOWN. buildAutodocMessages used to send the
//    changed FILE NAMES and nothing else, while §6 of the spec says the author works "grounded in
//    the diff". Given a filename and an article, the only way to answer "does this need an update"
//    is to guess what the filename implies. That produced, verbatim: `getting-started/your-settings.md
//    — Check if Feel setting now affects text size and spacing globally per the change`, on a
//    branch where four COLOUR tokens moved in app/globals.css and zero size, spacing, leading or
//    font tokens did. The model read the article correctly (it does claim Feel changes text size)
//    and read the change not at all, because it was handed asymmetric information. The fix is the
//    diff itself, in AutodocChange.diff.
//
// 2. IT COULD NOT SEE THE ARTICLE EITHER. Bodies were sliced to 1,200 characters of a ~5,000
//    character article, so `spaces/billing.md` arrived as its opening and a title. The model then
//    flagged it for "payout setup instructions" — a word that appears zero times in that file,
//    which is about money the Space PAYS. Same run, same cause, for spaces/plans-and-pricing.md.
//    Both articles carry featureKeys: [billing] against the very broad route '/spaces', so the
//    drift signal hands over a CANDIDATE pair and the model is what narrows it. Narrowing on a
//    quarter of the text is guessing.
//
// 3. NOTHING IT SAID HAD TO BE CHECKABLE. The prompt asked for "a ONE-LINE note on what to check",
//    which invites speculation, and the row shape was a bare boolean. So every verdict now carries
//    two anchors — a verbatim `quote` from the article and a verbatim `diffQuote` from the diff —
//    and groundVerdicts() VERIFIES both against the real text before the claim is allowed to stand
//    as a finding. A claim that cannot be grounded is DEMOTED to "covers a touched area", never
//    deleted: the bot should say fewer WRONG things, not fewer things. §8.3 of the same spec
//    already required this posture ("grounded + cited + confidence-gated; never improvise") for RAG
//    answers; this file was the surface that never got it.
//
// 4. AND IT REPORTED ITS OWN TRUNCATION AS A FINDING. `withUnreviewed` used to mint rows with
//    needsUpdate: true and the note "Not reviewed (the model reply was cut short) — check this one
//    manually", which formatAdvisoryComment then rendered as `- [ ]` beside real findings. A
//    checklist that mixes "I found something" with "I failed to look" teaches the reader to ignore
//    the list, which is ADR-970's failure exactly. Unreviewed articles now leave this module on a
//    SEPARATE channel (AutodocReview.unreviewed) that cannot reach the checkbox section, and the
//    cause is fixed at the root: planAutodocBatches keeps any one call from being asked for more
//    verdicts than its output budget can hold. That deterministic clip is why the SAME two files
//    went unreviewed on every run.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface AutodocArticle {
  category: string
  slug: string
  title: string
  body: string
}

/** The code change under review: the files it touched AND the diff itself. Both halves are
 *  load-bearing — the file list is what lib/help/drift maps to articles, the diff is what any
 *  claim about behaviour has to be grounded in. */
export interface AutodocChange {
  files: string[]
  /** Unified diff, already budgeted by diffForPrompt. Empty string ⇒ the diff was unavailable,
   *  and NO verdict may be graded as grounded (there is nothing to ground it in). */
  diff: string
}

/** What the model decided about one article.
 *  - `inaccurate` — the diff makes something this article SAYS wrong. A finding.
 *  - `covers`     — the article covers a touched area, but nothing in the diff contradicts it.
 *  - `clear`      — unrelated.
 *  The middle value is the one the old boolean had no room for, and it is where an ungrounded
 *  `inaccurate` lands instead of being thrown away. */
export type AutodocVerdict = 'inaccurate' | 'covers' | 'clear'

export interface AutodocItem {
  category: string
  slug: string
  verdict: AutodocVerdict
  note: string
  /** Verbatim sentence from the ARTICLE the model believes the change falsifies. */
  quote: string
  /** Verbatim line from the DIFF the model believes falsifies it. */
  diffQuote: string
  /** The changed file that line came from. */
  diffFile: string
  /** Set by groundVerdicts: both anchors were found in the real text. Only a grounded
   *  `inaccurate` is presented as a finding. */
  grounded: boolean
  /** Present when groundVerdicts demoted this row, naming which anchor failed. */
  demotion?: string
}

/** Why an affected article carries no verdict. Kept OFF the findings channel. */
export type AutodocUnreviewedReason = 'truncated' | 'omitted' | 'unidentified'

export interface AutodocUnreviewed {
  category: string
  slug: string
  reason: AutodocUnreviewedReason
}

/** The whole outcome of a review: what was judged, and what was not. Two channels, on purpose. */
export interface AutodocReview {
  items: AutodocItem[]
  unreviewed: AutodocUnreviewed[]
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

/** How much of an article body reaches the model. Defect class 2: this was 1,200 against a ~5,000
 *  character corpus, so the model was narrowing a candidate pair on its opening paragraph. It also
 *  bounds what the model can QUOTE, and a claim it cannot quote cannot be grounded — so the slice
 *  is the ceiling on the bot's reach, not just on its cost. */
export const AUTODOC_BODY_CHARS = 4000

/** Articles per model call. The reply is one JSON object per article, so the output budget is
 *  spent linearly and a single 46-article call clipped its own array at the same place every run
 *  (defect class 4). Bounding the ASK is what stops that, rather than raising max_tokens until it
 *  happens to fit a list nobody measured. */
export const AUTODOC_BATCH_SIZE = 12

/** Shortest article quote that may ground a finding. A two-word quote grounds against almost any
 *  article, which would make the check read as coverage without being any. */
export const AUTODOC_MIN_QUOTE_CHARS = 24

export const AUTODOC_SYSTEM = `You are a documentation reviewer for Frequency, a real-world community platform. You are given a code change AS A DIFF and the member-facing help articles that cover the areas it touches.

Your job is NOT to guess what the change might have done. It is to find help text that the diff makes FALSE.

For EACH article, return one verdict:
- "inaccurate" — the diff contradicts something this article states. This is a claim, and you must prove it (see below).
- "covers" — the article covers an area the change touched, but nothing in the diff contradicts anything it says.
- "clear" — unrelated to this change.

To return "inaccurate" you MUST fill all four of:
- "quote": a VERBATIM sentence or clause copied from the article text you were given, the one that is now wrong. Copy it character for character. Do not paraphrase, summarise, or reconstruct it.
- "diffFile": the path of the changed file that makes it wrong.
- "diffQuote": a VERBATIM single line copied from that file's hunks in the diff, including its leading + or - character.
- "note": one line on what to change.
Both quotes are checked against the real text. A verdict whose quotes cannot be found is downgraded to "covers", so a guess costs you the finding.

Hard rules:
- NEVER infer a behaviour change from a filename, a path, or a file's name alone. If the hunks do not show it, it did not happen.
- A styling or token change is not a behaviour change unless the hunks show the specific thing the article describes.
- Where the diff is marked as elided, you have not seen those lines. Do not claim anything about them, in either direction.
- Refactors, renames, tests and internal edits are "clear" or "covers", never "inaccurate".
- If you cannot find a verbatim quote for a suspicion, the honest answer is "covers". Say what you noticed in the note.

Respond with ONLY a JSON array, no prose, no markdown fences:
[{"category":"<category>","slug":"<slug>","verdict":"inaccurate|covers|clear","quote":"","diffFile":"","diffQuote":"","note":""}]`

/** Split the affected articles into calls small enough that the reply is not clipped.
 *  See AUTODOC_BATCH_SIZE for why bounding the ask beats raising the ceiling. */
export function planAutodocBatches<T>(articles: T[], size: number = AUTODOC_BATCH_SIZE): T[][] {
  const step = Math.max(1, Math.floor(size))
  const out: T[][] = []
  for (let i = 0; i < articles.length; i += step) out.push(articles.slice(i, i + step))
  return out
}

/** Budget a raw `git diff` down to something that fits a prompt, WITHOUT lying about what was
 *  dropped. Splits on `diff --git` boundaries, keeps whole files while they fit, and replaces
 *  what it cuts with an explicit elision marker so the model knows it is looking at a subset
 *  (the system prompt forbids claims about elided lines, in either direction). */
export function diffForPrompt(
  raw: string,
  opts: { maxTotalChars?: number; maxFileChars?: number } = {},
): string {
  const maxTotal = opts.maxTotalChars ?? 40000
  const maxFile = opts.maxFileChars ?? 6000
  if (!raw.trim()) return ''

  // Keep any preamble before the first file header out of the way, then split per file.
  const parts = raw.split(/^(?=diff --git )/m).filter((p) => p.trim())
  const kept: string[] = []
  let used = 0
  let elidedFiles = 0

  // Below this there is no room for a usable hunk, only for a file header — and a header with no
  // hunks is worse than an honest omission, because the model would see the path and nothing else,
  // which is precisely the filename-only input that caused defect class 1.
  const minRoom = Math.min(400, maxFile)

  for (const part of parts) {
    const room = Math.min(maxFile, maxTotal - used)
    if (room < minRoom) {
      elidedFiles++
      continue
    }
    if (part.length <= room) {
      kept.push(part.replace(/\s+$/, ''))
      used += part.length
      continue
    }
    // Cut on a line boundary so we never hand over half a line and call it verbatim.
    const cut = part.slice(0, room)
    const lastNewline = cut.lastIndexOf('\n')
    const head = (lastNewline > 0 ? cut.slice(0, lastNewline) : cut).replace(/\s+$/, '')
    const dropped = part.slice(head.length).split('\n').length
    const marker = `… ${dropped} more line(s) of this file elided.`
    kept.push(`${head}\n${marker}`)
    used += head.length + marker.length
  }

  if (elidedFiles > 0) kept.push(`… ${elidedFiles} more changed file(s) elided entirely.`)
  return kept.join('\n')
}

/** A user content block, typed structurally because this module may import nothing (see the header)
 *  — including the SDK's own types. It matches Anthropic.TextBlockParam by shape. */
export interface AutodocBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

/** Build the review prompt. The diff is the evidence; the articles are what it is checked against.
 *  Defect class 1 was this function sending `changedFiles` and no diff at all.
 *
 *  TWO BLOCKS, AND THE SPLIT IS DELIBERATE. Block 1 (the change) is byte-identical across every
 *  batch of one run; block 2 (the articles) is what varies. Marking block 1 `ephemeral` caches the
 *  system prompt plus the diff, so batching — which is the truncation fix — does not pay for the
 *  diff once per batch. Measured on this repo: 16 affected articles over a 56 KB diff came to ~25k
 *  input tokens across 2 calls versus ~18.7k for the old single call, and the whole of that
 *  difference is the re-sent diff. Caching is a PREFIX match, so the volatile block must stay last.
 *  If the prefix is under the model's minimum it silently will not cache and nothing else changes;
 *  the CI script logs usage.cache_read_input_tokens so a run says whether it engaged. */
export function buildAutodocMessages(
  change: AutodocChange,
  articles: AutodocArticle[],
): { system: string; messages: { role: 'user'; content: AutodocBlock[] }[] } {
  const files = change.files.map((f) => `- ${f}`).join('\n')
  const arts = articles
    .map((a) => {
      const body = a.body.slice(0, AUTODOC_BODY_CHARS)
      const tail = a.body.length > AUTODOC_BODY_CHARS ? '\n… (rest of this article not shown)' : ''
      return `### ${a.category}/${a.slug} — ${a.title}\n${body}${tail}`
    })
    .join('\n\n')
  const diffSection = change.diff.trim()
    ? `Diff (this is the evidence — every "inaccurate" verdict must quote a line from it):\n\n\`\`\`diff\n${change.diff}\n\`\`\``
    : 'Diff: UNAVAILABLE for this run. You cannot ground any claim, so no article may be "inaccurate". Use "covers" for anything the change plausibly touches and say so in the note.'

  const blocks: AutodocBlock[] = [
    { type: 'text', text: `Changed files:\n${files}\n\n${diffSection}`, cache_control: { type: 'ephemeral' } },
    {
      type: 'text',
      text: `Help articles covering the affected areas:\n\n${arts}\n\nReturn the JSON array described in the system prompt.`,
    },
  ]
  return { system: AUTODOC_SYSTEM, messages: [{ role: 'user', content: blocks }] }
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

/** One review row as the model may shape it: the strict row the prompt asks for, or any of the
 *  near-miss shapes `identify` below can read. Rows that are not plain objects are dropped; the
 *  rest keep their keys for `identify`. */
function autodocRows(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r))
}

/** Output budget for ONE batch. Batching (planAutodocBatches) is what keeps the reply inside this;
 *  the per-article allowance is the second belt. A verdict now carries two quotes, so a row costs
 *  more output than the note-only shape it replaced. */
export function autodocMaxTokens(articleCount: number): number {
  // 400/article, floor 1200. History, because the number has been wrong twice in the same
  // direction: a 14-article run on 2026-08-04 came back with 9 of 14 "cut short" at 120/article,
  // which bought 240/article; PR #2539 then clipped a ~46-article run at 240 and reported the same
  // two tail files as unreviewed on every single run. Raising this alone was never going to fix
  // that — a single call scales its ask with the list and the ceiling does not — which is why the
  // ask is bounded by AUTODOC_BATCH_SIZE and this is now sized for ONE batch with room for two
  // quoted anchors per row (~30 tokens of keys, a 200-char note, a 200-char article quote and a
  // 200-char diff line ⇒ ~180 tokens of DATA at the worst case).
  return Math.min(8000, Math.max(1200, 300 + articleCount * 400))
}

/** Read a verdict from the asked-for `verdict` string, or from the boolean shape the prompt used
 *  to ask for. A legacy `needsUpdate: true` becomes `inaccurate` and then has to survive grounding
 *  like anything else, so an old-shape reply cannot smuggle an unproven finding through. */
function readVerdict(r: Record<string, unknown>): AutodocVerdict {
  const v = String(r.verdict ?? r.status ?? '').trim().toLowerCase()
  if (v === 'inaccurate' || v === 'stale' || v === 'wrong') return 'inaccurate'
  if (v === 'covers' || v === 'related' || v === 'review') return 'covers'
  if (v === 'clear' || v === 'fine' || v === 'ok') return 'clear'
  const bool = r.needsUpdate ?? r.needs_update ?? r.update
  if (bool === true) return 'inaccurate'
  if (bool === false) return 'clear'
  return 'covers'
}

/** Parse the model's JSON array, keeping only rows that match a known article.
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
  // The boundary (ADR-1287): every row must be a plain object before any key is read from it. A
  // scalar or a nested array in the list is dropped here, not coerced into an empty verdict.
  const rows = autodocRows(raw)
  if (rows.length === 0) return []

  const out: AutodocItem[] = []
  for (const r of rows) {
    const key = identify(r)
    if (!key) continue
    const [category, ...rest] = key.split('/')
    out.push({
      category: category ?? '',
      slug: rest.join('/'),
      verdict: readVerdict(r),
      note: String(r.note ?? r.reason ?? '').slice(0, 200),
      quote: String(r.quote ?? r.articleQuote ?? r.article_quote ?? '').slice(0, 400),
      diffQuote: String(r.diffQuote ?? r.diff_quote ?? r.diffLine ?? '').slice(0, 400),
      diffFile: String(r.diffFile ?? r.diff_file ?? '').trim().slice(0, 300),
      grounded: false,
    })
  }
  return out
}

/** Whitespace-insensitive containment, so a quote that survived a JSON round trip with its line
 *  wrapping changed still grounds. Markdown emphasis is kept significant: a quote is meant to be
 *  copied, and normalising away `**` would let a reconstruction pass. */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** THE CONFIDENCE GATE. Verify each `inaccurate` claim against the real text on both sides:
 *  the `quote` must actually occur in the article body, and the `diffQuote` must actually occur
 *  in the diff on a file that was actually changed. A claim that fails is DEMOTED to `covers`
 *  with the reason recorded — not dropped — because the bot's job is to say fewer wrong things,
 *  not fewer things.
 *
 *  This is the check that kills all three false positives measured on PR #2539: there is no line
 *  in that diff about font size or spacing to quote, and the word "payout" is not in either
 *  billing article to quote. */
export function groundVerdicts(
  items: AutodocItem[],
  articles: AutodocArticle[],
  change: AutodocChange,
): AutodocItem[] {
  const bodies = new Map(articles.map((a) => [`${a.category}/${a.slug}`, normalize(a.body)]))
  const changed = new Set(change.files)
  const diff = normalize(change.diff)

  return items.map((item) => {
    if (item.verdict !== 'inaccurate') return { ...item, grounded: false }

    const demote = (why: string): AutodocItem => ({
      ...item,
      verdict: 'covers',
      grounded: false,
      demotion: why,
    })

    if (!change.diff.trim()) return demote('the diff was unavailable, so nothing could be grounded')

    const quote = item.quote.trim()
    if (quote.length < AUTODOC_MIN_QUOTE_CHARS) {
      return demote(
        quote ? 'the article quote was too short to prove anything' : 'no article quote was given',
      )
    }
    const body = bodies.get(`${item.category}/${item.slug}`)
    if (!body || !body.includes(normalize(quote))) {
      return demote('the quoted line is not in that article')
    }

    if (!item.diffFile) return demote('no changed file was named')
    if (!changed.has(item.diffFile)) return demote(`\`${item.diffFile}\` is not in this diff`)

    // Strip the leading +/-/space so a model that quotes the line without its marker still grounds.
    const diffQuote = item.diffQuote.replace(/^[+\- ]+/, '').trim()
    if (diffQuote.length < 3) return demote('no diff line was quoted')
    if (!diff.includes(normalize(diffQuote))) return demote('the quoted diff line is not in this diff')

    return { ...item, grounded: true }
  })
}

/** One row per article, keeping the most serious verdict when the model returned several.
 *
 *  Nothing stops a model from answering twice about one article, and two rows for one file — with
 *  two different notes — is the same credibility problem as an ungrounded claim: the reader cannot
 *  tell which one to act on. Ordering is by seriousness rather than by arrival so a later `clear`
 *  cannot bury an earlier grounded finding. Run this BEFORE groundVerdicts; the batch loop can also
 *  produce a duplicate when a retry re-answers an article the first pass had in fact answered. */
export function dedupeItems(items: AutodocItem[]): AutodocItem[] {
  const rank: Record<AutodocVerdict, number> = { inaccurate: 2, covers: 1, clear: 0 }
  const best = new Map<string, AutodocItem>()
  for (const i of items) {
    const key = `${i.category}/${i.slug}`
    const held = best.get(key)
    if (!held || rank[i.verdict] > rank[held.verdict]) best.set(key, i)
  }
  return [...best.values()]
}

/** Deterministic fallback when the model is unavailable: list every affected
 *  article, so the lookup still posts. The comment header — not these notes —
 *  carries the outage; see formatAdvisoryComment. */
export function fallbackItems(articles: AutodocArticle[]): AutodocItem[] {
  return articles.map((a) => ({
    category: a.category,
    slug: a.slug,
    verdict: 'covers' as AutodocVerdict,
    note: '',
    quote: '',
    diffQuote: '',
    diffFile: '',
    grounded: false,
  }))
}

/** Split a set of parsed verdicts into the two channels: what was judged, and what was not.
 *
 *  🔴 The unreviewed list is a SEPARATE RETURN VALUE and never an AutodocItem, because the
 *  previous shape (`withUnreviewed`, which minted needsUpdate:true rows carrying an apology) is
 *  how the bot came to report its own truncation as a checklist item. `reason` carries WHY, taken
 *  from the model's stop_reason rather than guessed from a count. */
export function splitReview(
  items: AutodocItem[],
  articles: AutodocArticle[],
  reason: AutodocUnreviewedReason = 'omitted',
): AutodocReview {
  const seen = new Set(items.map((i) => `${i.category}/${i.slug}`))
  const unreviewed = articles
    .filter((a) => !seen.has(`${a.category}/${a.slug}`))
    .map((a): AutodocUnreviewed => ({ category: a.category, slug: a.slug, reason }))
  return { items, unreviewed }
}

/** Human-readable cause for an unreviewed article, for the separate section. */
export function unreviewedCause(reason: AutodocUnreviewedReason): string {
  switch (reason) {
    case 'truncated':
      return 'the model reply hit its output ceiling before reaching them'
    case 'unidentified':
      return 'the model answered about them under a label that could not be matched to a file'
    case 'omitted':
      return 'the model returned no verdict for them'
  }
}

const path = (i: { category: string; slug: string }) => `content/help/${i.category}/${i.slug}.md`

/** Render the advisory PR comment (with the marker for in-place updates).
 *
 *  Three sections, and the separation is the point:
 *    1. `- [ ]` checkboxes — GROUNDED findings only. Every one carries the quote it is based on,
 *       so a reader can falsify it in one glance instead of opening the file.
 *    2. A collapsed list — articles that merely COVER a touched area. Not a to-do list.
 *    3. A ⚠️ callout — articles the model did not review, with the cause. Never a checkbox.
 *
 *  When `degraded` is set the comment leads with ONE ⚠️ banner naming the outage and
 *  the fix, and the article list collapses into a lookup — not a checklist. A run
 *  where nothing was reviewed must not look like a run where everything was. */
export function formatAdvisoryComment(
  review: AutodocReview,
  change: AutodocChange,
  degraded: AutodocDegradedReason | null = null,
): string {
  const lines: string[] = [AUTODOC_MARKER, '## 📒 Help docs — review for this change', '']
  const fileCount = change.files.length

  if (degraded) {
    const { cause, action } = degradedNotice(degraded)
    const all = [...review.items, ...review.unreviewed]
    lines.push(
      `> ⚠️ **The AI review did not run.** ${cause}`,
      '>',
      `> ${action}`,
      '>',
      `> The ${all.length} article(s) below are simply everything mapped to the routes this PR touches (docs/SUPPORT-SYSTEM.md §6). Nothing has been checked against the diff, so treat this as a lookup, not a to-do list.`,
      '',
      `<details><summary>${all.length} article(s) covering the touched routes</summary>`,
      '',
    )
    for (const i of all) lines.push(`- \`${path(i)}\``)
    lines.push('', '</details>', '', `<sub>${fileCount} changed file(s). On merge, the help index re-embeds automatically.</sub>`)
    return lines.join('\n')
  }

  const findings = review.items.filter((i) => i.verdict === 'inaccurate' && i.grounded)
  const covers = review.items.filter((i) => i.verdict === 'covers')
  const reviewed = review.items.length
  const total = reviewed + review.unreviewed.length

  lines.push(
    `_Advisory only — nothing is auto-published. Vera checked ${reviewed} of ${total} article(s) against the diff (docs/SUPPORT-SYSTEM.md §6). Every item in the checklist below quotes the article line it believes the diff falsifies, so you can falsify the bot._`,
    '',
  )

  if (findings.length === 0) {
    lines.push('✅ Nothing in this diff contradicts anything these help articles say.')
  } else {
    lines.push(`**The diff contradicts these ${findings.length} article(s) — please fix before merge:**`, '')
    for (const i of findings) {
      lines.push(`- [ ] \`${path(i)}\` — ${i.note || 'the quoted line below is now wrong'}`)
      lines.push(`  - article says: "${i.quote.replace(/\s+/g, ' ').trim()}"`)
      lines.push(`  - diff says: \`${i.diffFile}\` → \`${i.diffQuote.replace(/\s+/g, ' ').trim()}\``)
    }
  }

  if (covers.length > 0) {
    const demoted = covers.filter((i) => i.demotion).length
    lines.push(
      '',
      `<details><summary>${covers.length} article(s) cover a touched area — nothing in the diff contradicts them</summary>`,
      '',
      '_Not a to-do list. These are here so you can spot something the bot could not._',
      '',
    )
    for (const i of covers) {
      const why = i.demotion ? ` (claim not grounded: ${i.demotion})` : i.note ? ` — ${i.note}` : ''
      lines.push(`- \`${path(i)}\`${why}`)
    }
    lines.push('', '</details>')
    if (demoted > 0) {
      lines.push('', `<sub>${demoted} claim(s) were downgraded here because the quote could not be found in the article or the diff.</sub>`)
    }
  }

  // 🔴 SEPARATE, AND NEVER A CHECKBOX. A file the model could not look at is not a finding.
  if (review.unreviewed.length > 0) {
    const byReason = new Map<AutodocUnreviewedReason, AutodocUnreviewed[]>()
    for (const u of review.unreviewed) {
      const list = byReason.get(u.reason) ?? []
      list.push(u)
      byReason.set(u.reason, list)
    }
    lines.push('', `> ⚠️ **${review.unreviewed.length} of ${total} article(s) were NOT reviewed.** This is a gap in the check, not a finding about these files.`)
    for (const [reason, list] of byReason) {
      lines.push('>', `> ${unreviewedCause(reason)}, even after a retry:`)
      for (const u of list) lines.push(`> - \`${path(u)}\``)
    }
    lines.push('>', '> Re-run the help-autodoc job to try again, or read these against the diff by hand.')
  }

  lines.push('', `<sub>${fileCount} changed file(s). On merge, the help index re-embeds automatically.</sub>`)
  return lines.join('\n')
}
