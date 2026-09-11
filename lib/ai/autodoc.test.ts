import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildAutodocMessages,
  parseAutodocResponse,
  fallbackItems,
  splitReview,
  groundVerdicts,
  dedupeItems,
  planAutodocBatches,
  diffForPrompt,
  autodocMaxTokens,
  formatAdvisoryComment,
  AUTODOC_MARKER,
  AUTODOC_BATCH_SIZE,
  AUTODOC_BODY_CHARS,
  type AutodocArticle,
  type AutodocChange,
  type AutodocItem,
} from './autodoc'

const articles: AutodocArticle[] = [
  { category: 'getting-started', slug: 'join-a-circle', title: 'Join a Circle', body: 'How to join.' },
  { category: 'the-quest', slug: 'zaps-and-gems', title: 'Zaps & gems', body: 'About zaps.' },
]

const change = (over: Partial<AutodocChange> = {}): AutodocChange => ({
  files: ['app/(main)/circles/page.tsx'],
  diff: 'diff --git a/app/(main)/circles/page.tsx b/app/(main)/circles/page.tsx\n@@ -1 +1 @@\n-const CAP = 8\n+const CAP = 12\n',
  ...over,
})

const item = (over: Partial<AutodocItem> = {}): AutodocItem => ({
  category: 'getting-started',
  slug: 'join-a-circle',
  verdict: 'inaccurate',
  note: 'cap changed',
  quote: '',
  diffQuote: '',
  diffFile: '',
  grounded: false,
  ...over,
})

/** Everything the prompt actually says, across its content blocks. */
const promptText = (change: AutodocChange, arts: AutodocArticle[]) =>
  buildAutodocMessages(change, arts).messages[0].content.map((b) => b.text).join('\n')

describe('buildAutodocMessages', () => {
  it('sends the DIFF, not just the filenames (docs/SUPPORT-SYSTEM.md §6: "grounded in the diff")', () => {
    // Defect class 1 on PR #2539: this function used to send `changedFiles` and nothing else, so
    // the model could only guess what a path implied. app/globals.css in the file list became
    // "Feel now affects text size and spacing" on a diff that moved four colour tokens.
    const text = promptText(change(), articles)
    expect(text).toContain('app/(main)/circles/page.tsx')
    expect(text).toContain('+const CAP = 12')
    expect(text).toContain('getting-started/join-a-circle')
    expect(text).toContain('How to join.')
  })

  it('tells the model it cannot ground anything when the diff is unavailable', () => {
    const text = promptText(change({ diff: '' }), articles)
    expect(text).toContain('UNAVAILABLE')
    expect(text).toContain('no article may be "inaccurate"')
  })

  it('caches the change and leaves the varying articles last, so batching does not re-pay for the diff', () => {
    // Batching (the truncation fix) re-sends the diff once per call. Caching is a PREFIX match, so
    // the stable half must come first and carry the breakpoint, and the volatile half must be last.
    // Measured on this repo: 16 articles over a 56 KB diff cost ~25k input tokens across 2 calls
    // versus ~18.7k for the old single call, and all of that delta is the re-sent diff.
    const blocks = buildAutodocMessages(change(), articles).messages[0].content
    expect(blocks).toHaveLength(2)
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(blocks[0].text).toContain('+const CAP = 12') // the change: stable across batches
    expect(blocks[0].text).not.toContain('join-a-circle') // ...and carries no article
    expect(blocks[1].cache_control).toBeUndefined()
    expect(blocks[1].text).toContain('join-a-circle') // the articles: what varies

    // The cached prefix must be IDENTICAL for two different batches of the same run, or it cannot
    // hit. This is the property that actually earns the breakpoint.
    const a = buildAutodocMessages(change(), [articles[0]]).messages[0].content[0].text
    const b = buildAutodocMessages(change(), [articles[1]]).messages[0].content[0].text
    expect(a).toBe(b)
  })

  it('sends enough of a real-sized article body to be quotable', () => {
    // Defect class 2: the slice was 1,200 chars against ~5,000-char articles, so `spaces/billing.md`
    // arrived as its opening paragraph and the model confabulated the rest ("payout setup
    // instructions" — a word that is not in that file). The slice also caps what can be QUOTED,
    // and an unquotable claim can never be grounded, so it bounds the bot's reach.
    const long: AutodocArticle = { category: 'spaces', slug: 'billing', title: 'Billing', body: 'x'.repeat(5000) }
    const text = promptText(change(), [long])
    expect(AUTODOC_BODY_CHARS).toBeGreaterThanOrEqual(4000)
    expect(text).toContain('x'.repeat(AUTODOC_BODY_CHARS))
    // ...and it says so when it truncates, rather than presenting a fragment as the whole article.
    expect(text).toContain('rest of this article not shown')
  })

  it('forbids inferring behaviour from a filename in the system prompt', () => {
    const { system } = buildAutodocMessages(change(), articles)
    expect(system).toContain('NEVER infer a behaviour change from a filename')
    expect(system).toContain('VERBATIM')
  })
})

describe('groundVerdicts — the confidence gate', () => {
  const grounded = (over: Partial<AutodocItem> = {}) =>
    groundVerdicts([item(over)], articles, change())[0]

  it('keeps a claim whose article quote and diff line are both real', () => {
    const ok = groundVerdicts(
      [item({
        quote: 'A Circle can hold up to eight people at a time.',
        diffQuote: '+const CAP = 12',
        diffFile: 'app/(main)/circles/page.tsx',
      })],
      [{ ...articles[0], body: 'A Circle can hold up to eight people at a time. Ask to join from its page.' }],
      change(),
    )[0]
    expect(ok.verdict).toBe('inaccurate')
    expect(ok.grounded).toBe(true)
    expect(ok.demotion).toBeUndefined()
  })

  it('DEMOTES rather than deletes a claim whose article quote is not in the article', () => {
    // The exact PR #2539 shape for spaces/billing.md and spaces/plans-and-pricing.md: a confident
    // note about "payout setup instructions" against a file where the word does not occur. The row
    // survives as "covers a touched area" so the bot says fewer WRONG things, not fewer things.
    const out = grounded({
      quote: 'Payout setup lives under Manage, then Get paid, and takes about a minute.',
      diffQuote: '+const CAP = 12',
      diffFile: 'app/(main)/circles/page.tsx',
    })
    expect(out.verdict).toBe('covers')
    expect(out.grounded).toBe(false)
    expect(out.demotion).toContain('not in that article')
  })

  it('demotes a claim whose diff line is not in the diff', () => {
    // Defect class 1 reproduced: the model believes typography changed, but there is no such line
    // in the hunks to quote, so the claim cannot stand as a finding.
    const longBodied: AutodocArticle[] = [
      { ...articles[0], body: 'The Feel setting now changes text size and spacing across the whole site.' },
    ]
    const out = groundVerdicts(
      [item({
        quote: 'The Feel setting now changes text size and spacing across the whole site.',
        diffQuote: '+  --text-base: 1.05rem;',
        diffFile: 'app/globals.css',
      })],
      longBodied,
      { files: ['app/globals.css'], diff: 'diff --git a/app/globals.css b/app/globals.css\n@@\n-  --accent: #aaa;\n+  --accent: #bbb;\n' },
    )[0]
    expect(out.verdict).toBe('covers')
    expect(out.demotion).toContain('not in this diff')
  })

  it('demotes a claim naming a file this PR never touched', () => {
    const out = groundVerdicts(
      [item({
        quote: 'A Circle can hold up to eight people at a time.',
        diffQuote: '+const CAP = 12',
        diffFile: 'app/(main)/spaces/page.tsx',
      })],
      [{ ...articles[0], body: 'A Circle can hold up to eight people at a time.' }],
      change(),
    )[0]
    expect(out.verdict).toBe('covers')
    expect(out.demotion).toContain('`app/(main)/spaces/page.tsx` is not in this diff')
  })

  it('refuses a quote too short to prove anything', () => {
    const out = groundVerdicts(
      [item({ quote: 'the', diffQuote: '+const CAP = 12', diffFile: 'app/(main)/circles/page.tsx' })],
      [{ ...articles[0], body: 'the cap is the thing' }],
      change(),
    )[0]
    expect(out.verdict).toBe('covers')
    expect(out.demotion).toContain('too short')
  })

  it('grounds nothing at all when the diff could not be read', () => {
    // A review with no evidence must produce no findings, rather than quietly grading claims as if
    // it had looked. Every fail-safe needs something that notices it fired.
    const out = groundVerdicts(
      [item({
        quote: 'A Circle can hold up to eight people at a time.',
        diffQuote: '+const CAP = 12',
        diffFile: 'app/(main)/circles/page.tsx',
      })],
      [{ ...articles[0], body: 'A Circle can hold up to eight people at a time.' }],
      change({ diff: '' }),
    )[0]
    expect(out.verdict).toBe('covers')
    expect(out.demotion).toContain('diff was unavailable')
  })

  it('tolerates re-wrapped whitespace and a missing +/- marker on the diff quote', () => {
    const out = groundVerdicts(
      [item({
        quote: 'A Circle can hold up\nto eight   people at a time.',
        diffQuote: 'const CAP = 12',
        diffFile: 'app/(main)/circles/page.tsx',
      })],
      [{ ...articles[0], body: 'A Circle can hold up to eight people at a time.' }],
      change(),
    )[0]
    expect(out.grounded).toBe(true)
  })

  it('leaves covers/clear rows alone and never marks them grounded', () => {
    const out = groundVerdicts([item({ verdict: 'covers' }), item({ verdict: 'clear' })], articles, change())
    expect(out.map((i) => i.verdict)).toEqual(['covers', 'clear'])
    expect(out.every((i) => !i.grounded)).toBe(true)
  })
})

describe('parseAutodocResponse', () => {
  it('reads the three-way verdict and both quotes', () => {
    const text = `[{"category":"getting-started","slug":"join-a-circle","verdict":"inaccurate","quote":"eight people","diffFile":"app/x.tsx","diffQuote":"+const CAP = 12","note":"cap changed"}]`
    const items = parseAutodocResponse(text, articles)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      verdict: 'inaccurate',
      quote: 'eight people',
      diffQuote: '+const CAP = 12',
      diffFile: 'app/x.tsx',
      note: 'cap changed',
      grounded: false, // never trusted straight out of the parser
    })
  })

  it('maps a legacy needsUpdate boolean onto a verdict that still has to be grounded', () => {
    const items = parseAutodocResponse(
      '[{"category":"getting-started","slug":"join-a-circle","needsUpdate":true,"note":"check it"}]',
      articles,
    )
    expect(items[0].verdict).toBe('inaccurate')
    // ...and with no quotes it cannot survive the gate, so an old-shape reply cannot smuggle an
    // unproven finding through the new comment.
    expect(groundVerdicts(items, articles, change())[0].verdict).toBe('covers')
  })

  it('defaults an unreadable verdict to covers, not to a finding', () => {
    const items = parseAutodocResponse('[{"category":"the-quest","slug":"zaps-and-gems","verdict":"hmm"}]', articles)
    expect(items[0].verdict).toBe('covers')
  })

  it('recovers a row the model labelled with the article TITLE, not the filename', () => {
    // The exact live failure on PR #2025: content/help/spaces/space-crm.md has
    // `title: Your Space Contacts`, and the model answered `your-space-contacts`. No path or
    // tail rule can bridge that — the two strings share nothing — so every row dropped and the
    // advisory claimed a total outage while the model had actually done the review.
    const withTitleSlug = [
      { category: 'spaces', slug: 'space-crm', title: 'Your Space Contacts', body: 'CRM.' },
    ]
    const text = '```json\n[{"slug":"your-space-contacts","verdict":"clear","note":""}]\n```'
    const items = parseAutodocResponse(text, withTitleSlug)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ category: 'spaces', slug: 'space-crm', verdict: 'clear' })
  })

  it('refuses a title match when two articles slugify to the same title', () => {
    // A guess that attaches the wrong verdict to the wrong article is worse than "unreviewed".
    const collide = [
      { category: 'a', slug: 'one', title: 'Same Name', body: '' },
      { category: 'b', slug: 'two', title: 'same name', body: '' },
    ]
    expect(parseAutodocResponse('[{"slug":"same-name","verdict":"inaccurate"}]', collide)).toHaveLength(0)
  })

  it('parses a JSON array and keeps only known articles', () => {
    const text = `here you go [{"category":"getting-started","slug":"join-a-circle","verdict":"inaccurate","note":"cap changed"},{"category":"x","slug":"y","verdict":"inaccurate","note":"nope"}]`
    const items = parseAutodocResponse(text, articles)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ slug: 'join-a-circle', verdict: 'inaccurate', note: 'cap changed' })
  })
  it('returns [] on non-JSON', () => {
    expect(parseAutodocResponse('no json here', articles)).toEqual([])
  })
  it('salvages the finished objects from a reply cut short mid-array', () => {
    const text = `[{"category":"getting-started","slug":"join-a-circle","verdict":"covers","note":"cap changed"},{"category":"the-quest","slug":"zaps-and`
    const items = parseAutodocResponse(text, articles)
    expect(items).toHaveLength(1)
    expect(items[0].slug).toBe('join-a-circle')
  })
  it('drops rows that are not objects instead of scoring them as verdicts (ADR-1287)', () => {
    const text = `[7, "join-a-circle", null, ["getting-started","join-a-circle"], {"category":"getting-started","slug":"join-a-circle","verdict":"covers","note":"ok"}]`
    const items = parseAutodocResponse(text, articles)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ slug: 'join-a-circle', verdict: 'covers', note: 'ok' })
  })
  it('is not fooled by braces inside strings', () => {
    const text = `[{"category":"getting-started","slug":"join-a-circle","verdict":"clear","note":"see {this} \\" thing"}]`
    expect(parseAutodocResponse(text, articles)).toHaveLength(1)
  })
})

describe('planAutodocBatches', () => {
  it('bounds what any ONE call is asked for', () => {
    // Defect class 4's root cause: one call for every affected article spends its output budget
    // linearly, so a ~46-article ask clipped its array at the same place every run and the SAME two
    // tail files came back unreviewed each time.
    const many = Array.from({ length: 46 }, (_, i) => i)
    const batches = planAutodocBatches(many)
    expect(batches.flat()).toEqual(many) // nothing dropped, nothing duplicated
    expect(Math.max(...batches.map((b) => b.length))).toBeLessThanOrEqual(AUTODOC_BATCH_SIZE)
  })
  it('is one batch for a short list and never loops forever on a silly size', () => {
    expect(planAutodocBatches([1, 2], 12)).toEqual([[1, 2]])
    expect(planAutodocBatches([1, 2], 0)).toEqual([[1], [2]])
    expect(planAutodocBatches([])).toEqual([])
  })
  it('leaves every batch inside the output budget with room for two quoted anchors', () => {
    // ~180 output tokens is the worst-case DATA cost of one row (keys + a 200-char note + a
    // 200-char article quote + a 200-char diff line). The budget must clear that with margin for
    // preamble, or the clip comes back.
    const perRow = autodocMaxTokens(AUTODOC_BATCH_SIZE) / AUTODOC_BATCH_SIZE
    expect(perRow).toBeGreaterThan(300)
  })
})

describe('diffForPrompt', () => {
  const file = (name: string, body: string) => `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n${body}\n`

  it('passes a small diff through intact', () => {
    const raw = file('a.ts', '@@\n-x\n+y')
    expect(diffForPrompt(raw)).toContain('+y')
  })

  it('says what it elided instead of silently shortening a file', () => {
    const raw = file('big.ts', Array.from({ length: 500 }, (_, i) => `+line ${i}`).join('\n'))
    const out = diffForPrompt(raw, { maxFileChars: 200, maxTotalChars: 1000 })
    expect(out.length).toBeLessThan(raw.length)
    expect(out).toContain('more line(s) of this file elided')
    // Never a half line presented as verbatim — the model is asked to copy these exactly.
    expect(out.split('\n').filter((l) => l.startsWith('+line')).every((l) => /^\+line \d+$/.test(l))).toBe(true)
  })

  it('names how many whole files it dropped', () => {
    const raw = [file('a.ts', '@@\n+a'), file('b.ts', '@@\n+b'), file('c.ts', '@@\n+c')].join('')
    const out = diffForPrompt(raw, { maxTotalChars: 40, maxFileChars: 40 })
    expect(out).toContain('more changed file(s) elided entirely')
  })

  it('returns empty for an empty diff so the caller can degrade honestly', () => {
    expect(diffForPrompt('')).toBe('')
    expect(diffForPrompt('   \n ')).toBe('')
  })
})

describe('autodocMaxTokens', () => {
  it('is sized for ONE batch, with the ceiling still bounding cost', () => {
    expect(autodocMaxTokens(2)).toBe(1200) // floor
    expect(autodocMaxTokens(AUTODOC_BATCH_SIZE)).toBeGreaterThan(4000)
    expect(autodocMaxTokens(500)).toBe(8000) // ceiling, so cost stays bounded
  })
})

describe('dedupeItems', () => {
  it('keeps one row per article and never lets a later clear bury a finding', () => {
    // Two rows for one file, with two different notes, is the same credibility problem as an
    // ungrounded claim: the reader cannot tell which to act on.
    const out = dedupeItems([
      item({ verdict: 'clear', note: 'looks fine' }),
      item({ verdict: 'inaccurate', note: 'cap changed' }),
      item({ verdict: 'covers', note: 'related' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ verdict: 'inaccurate', note: 'cap changed' })
  })
  it('leaves distinct articles alone', () => {
    const out = dedupeItems([item(), item({ category: 'the-quest', slug: 'zaps-and-gems' })])
    expect(out).toHaveLength(2)
  })
})

describe('fallbackItems', () => {
  it('lists every affected article as "covers", never as a finding', () => {
    const items = fallbackItems(articles)
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.verdict === 'covers' && !i.grounded && i.note === '')).toBe(true)
  })
})

describe('splitReview', () => {
  it('puts unreviewed articles on a SEPARATE channel, never in items', () => {
    // 🔴 Defect class 4. The old `withUnreviewed` minted an AutodocItem with needsUpdate:true and
    // an apology for a note, which the comment then rendered as `- [ ]` beside real findings.
    // The type now makes that impossible: an unreviewed row is not an item and carries no verdict.
    const partial = [item({ verdict: 'clear', note: '' })]
    const review = splitReview(partial, articles, 'truncated')
    expect(review.items).toHaveLength(1)
    expect(review.unreviewed).toEqual([
      { category: 'the-quest', slug: 'zaps-and-gems', reason: 'truncated' },
    ])
    expect(JSON.stringify(review.items)).not.toContain('Not reviewed')
  })
})

describe('formatAdvisoryComment', () => {
  it('checkboxes ONLY grounded findings, and shows the quote each rests on', () => {
    const body = 'A Circle can hold up to eight people at a time.'
    const items = groundVerdicts(
      [
        item({ quote: body, diffQuote: '+const CAP = 12', diffFile: 'app/(main)/circles/page.tsx' }),
        item({ slug: 'zaps-and-gems', category: 'the-quest', verdict: 'clear', note: '' }),
      ],
      [{ ...articles[0], body }, articles[1]],
      change(),
    )
    const c = formatAdvisoryComment({ items, unreviewed: [] }, change())
    expect(c).toContain(AUTODOC_MARKER)
    expect(c).toContain('- [ ] `content/help/getting-started/join-a-circle.md` — cap changed')
    expect(c).toContain(`article says: "${body}"`)
    expect(c).toContain('diff says: `app/(main)/circles/page.tsx`')
    // A `clear` verdict is not listed at all; it is neither a finding nor a gap.
    expect(c).not.toContain('zaps-and-gems')
  })

  it('never renders an unreviewed article as a checkbox, and names it as a coverage gap', () => {
    // 🔴 THE DEFECT THIS EXISTS FOR. On PR #2539 the comment carried
    //   `- [ ] content/help/the-quest/achievements.md — Not reviewed (the model reply was cut
    //    short) — check this one manually`
    // beside real findings, on every run, for the same two files. A checkbox that looks like a
    // finding but is an apology teaches the reader to ignore the whole list (ADR-970).
    const c = formatAdvisoryComment(
      {
        items: [item({ verdict: 'clear', note: '' })],
        unreviewed: [{ category: 'the-quest', slug: 'achievements', reason: 'truncated' }],
      },
      change(),
    )
    expect(c).toContain('were NOT reviewed')
    expect(c).toContain('This is a gap in the check, not a finding')
    expect(c).toContain('hit its output ceiling')
    expect(c).toContain('> - `content/help/the-quest/achievements.md`')
    // The gap section is a blockquote, and no checkbox anywhere carries the unreviewed file.
    expect(c).not.toContain('- [ ] `content/help/the-quest/achievements.md`')
    expect(c).not.toContain('Not reviewed (the model reply was cut short)')
    // And the header states the coverage honestly rather than implying a full review.
    expect(c).toContain('Vera checked 1 of 2 article(s)')
  })

  it('lists a demoted claim in the collapsed section with the reason it failed', () => {
    const items = groundVerdicts(
      [item({ quote: 'Payout setup lives under Get paid, and takes about a minute.', diffQuote: '+const CAP = 12', diffFile: 'app/(main)/circles/page.tsx' })],
      articles,
      change(),
    )
    const c = formatAdvisoryComment({ items, unreviewed: [] }, change())
    expect(c).not.toContain('- [ ]')
    expect(c).toContain('cover a touched area')
    expect(c).toContain('claim not grounded: the quoted line is not in that article')
    expect(c).toContain('Not a to-do list')
    expect(c).toContain('1 claim(s) were downgraded')
  })

  it('says nothing is contradicted when nothing is grounded', () => {
    const c = formatAdvisoryComment({ items: [item({ verdict: 'clear' })], unreviewed: [] }, change({ files: [] }))
    expect(c).toContain('Nothing in this diff contradicts')
  })

  it('leads with ONE outage banner when the review did not run, not a row per article', () => {
    const review = splitReview(fallbackItems(articles), articles)
    const c = formatAdvisoryComment(review, change(), { kind: 'no-key' })
    expect(c).toContain('⚠️ **The AI review did not run.**')
    expect(c).toContain('ANTHROPIC_API_KEY')
    // one statement of the outage, at the top
    expect(c.match(/The AI review did not run/g)).toHaveLength(1)
    // the list is a lookup, not a to-do list
    expect(c).not.toContain('- [ ]')
    expect(c).toContain('<details>')
    expect(c).not.toContain('Vera checked')
  })

  it('names the failure when the model call threw', () => {
    const review = splitReview(fallbackItems(articles), articles)
    const c = formatAdvisoryComment(review, change({ files: [] }), { kind: 'call-failed', detail: '401 invalid x-api-key' })
    expect(c).toContain('401 invalid x-api-key')
  })

  it('names AI_DISABLED when AI is switched off on purpose', () => {
    const review = splitReview(fallbackItems(articles), articles)
    const c = formatAdvisoryComment(review, change({ files: [] }), { kind: 'ai-disabled' })
    expect(c).toContain('AI_DISABLED')
  })
})

// ── END TO END over the three false positives measured on PR #2539 ───────────────────────────
//
// The run cannot be replayed here (it needs CI and an API key), so this reconstructs the model
// replies as they were reported and asserts the pipeline now refuses them. If the next real run
// still posts an ungrounded claim, this test is the thing that was wrong, not the diagnosis.
describe('PR #2539 regression: the three false positives are refused', () => {
  const settingsBody =
    '- **Appearance**: pick your look. Light or dark, the **Feel** (how dense or roomy things sit, ' +
    'which now changes text size and spacing across the whole site), and a **Seasonal accent**.'
  const billingBody =
    'Everything below is what your Space **pays**. What your Space **receives** is a different page: ' +
    '**Manage, then Get paid**. Billing is your plan, and Get paid is your earnings.'

  const corpus: AutodocArticle[] = [
    { category: 'getting-started', slug: 'your-settings', title: 'Your settings', body: settingsBody },
    { category: 'spaces', slug: 'billing', title: 'Billing', body: billingBody },
    { category: 'spaces', slug: 'plans-and-pricing', title: 'Plans and pricing', body: 'What each Space plan costs.' },
  ]

  // Four colour tokens moved; zero size/spacing/leading/font tokens did.
  const realChange: AutodocChange = {
    files: ['app/globals.css', 'app/(main)/spaces/[slug]/page.tsx'],
    diff:
      'diff --git a/app/globals.css b/app/globals.css\n@@ -40,4 +40,4 @@\n' +
      '-  --accent-warm: oklch(0.72 0.14 60);\n+  --accent-warm: oklch(0.74 0.13 58);\n' +
      '-  --accent-cool: oklch(0.61 0.11 240);\n+  --accent-cool: oklch(0.63 0.10 238);\n',
  }

  it('drops all three claims to "covers" and posts zero checkboxes', () => {
    // The replies as the bot actually produced them: confident notes, no quotable evidence.
    const reply = JSON.stringify([
      {
        category: 'getting-started', slug: 'your-settings', verdict: 'inaccurate',
        note: 'Check if Feel setting now affects text size and spacing globally per the change',
        quote: 'which now changes text size and spacing across the whole site',
        diffFile: 'app/globals.css', diffQuote: '+  --text-base: 1.05rem;',
      },
      {
        category: 'spaces', slug: 'billing', verdict: 'inaccurate',
        note: 'Verify payout setup instructions remain accurate',
        quote: 'Payout setup instructions', diffFile: 'app/(main)/spaces/[slug]/page.tsx', diffQuote: '+payouts',
      },
      {
        category: 'spaces', slug: 'plans-and-pricing', verdict: 'inaccurate',
        note: 'Update for payout/revenue split features', quote: '', diffFile: '', diffQuote: '',
      },
    ])

    const items = groundVerdicts(parseAutodocResponse(reply, corpus), corpus, realChange)
    expect(items).toHaveLength(3)
    expect(items.filter((i) => i.grounded)).toHaveLength(0)
    expect(items.every((i) => i.verdict === 'covers')).toBe(true)

    // your-settings quoted the article correctly but had no diff line to stand on...
    expect(items[0].demotion).toContain('quoted diff line is not in this diff')
    // ...billing quoted a sentence that is not in the article at all...
    expect(items[1].demotion).toContain('not in that article')
    // ...and plans-and-pricing offered nothing.
    expect(items[2].demotion).toContain('no article quote')

    const comment = formatAdvisoryComment({ items, unreviewed: [] }, realChange)
    expect(comment).not.toContain('- [ ]')
    expect(comment).toContain('Nothing in this diff contradicts')
    // Not silence, though: all three still appear, correctly labelled and with the reason.
    for (const a of corpus) expect(comment).toContain(`content/help/${a.category}/${a.slug}.md`)
  })

  it('still surfaces a REAL contradiction in the same shape', () => {
    // The other half of "not quieter": a grounded finding must still land as a checkbox.
    const reply = JSON.stringify([{
      category: 'spaces', slug: 'billing', verdict: 'inaccurate',
      note: 'Get paid moved out of Manage',
      quote: 'What your Space **receives** is a different page: **Manage, then Get paid**.',
      diffFile: 'app/(main)/spaces/[slug]/page.tsx',
      diffQuote: '-      { href: `/spaces/${slug}/manage/get-paid`, label: "Get paid" },',
    }])
    const withHunk: AutodocChange = {
      files: realChange.files,
      diff: realChange.diff +
        'diff --git a/app/(main)/spaces/[slug]/page.tsx b/app/(main)/spaces/[slug]/page.tsx\n@@\n' +
        '-      { href: `/spaces/${slug}/manage/get-paid`, label: "Get paid" },\n' +
        '+      { href: `/spaces/${slug}/earnings`, label: "Get paid" },\n',
    }
    const items = groundVerdicts(parseAutodocResponse(reply, corpus), corpus, withHunk)
    expect(items[0].grounded).toBe(true)
    const comment = formatAdvisoryComment({ items, unreviewed: [] }, withHunk)
    expect(comment).toContain('- [ ] `content/help/spaces/billing.md` — Get paid moved out of Manage')
  })
})

// ── The load-bearing constraint: this module imports nothing ─────────────────────────────────
//
// scripts/help-autodoc.mts runs under `node --experimental-strip-types` and imports this file
// directly, where a relative specifier must carry its file extension. An extensionless import
// added here (`from './schema'`) fails the autodoc job at LOAD, before one line of it runs, and
// the job's log is nearly empty because nothing got far enough to print. That happened once.
//
// The guard measures the consequence — no import statement survives in the source — rather than
// the comment that asks for it.
describe('autodoc.ts stays dependency-free so the CI script can load it directly', () => {
  it('has no import statements', () => {
    const src = readFileSync(new URL('./autodoc.ts', import.meta.url), 'utf8')
    const imports = src
      .split('\n')
      .filter((l) => /^\s*import\s/.test(l) && !/^\s*\/\//.test(l))
    expect(imports).toEqual([])
  })
})

// ── The wiring the unit tests cannot reach ───────────────────────────────────────────────────
//
// The CI script's loop (batch → retry → ground → report) needs CI and an API key, so it is not
// executed here. These are SOURCE-SHAPE guards on the three properties that would silently undo
// the fix if someone simplified the loop back: it must read stop_reason rather than infer
// truncation from a row count, it must pass the diff, and it must run the grounding gate.
describe('scripts/help-autodoc.mts keeps the three properties the fix depends on', () => {
  const src = readFileSync(new URL('../../scripts/help-autodoc.mts', import.meta.url), 'utf8')
  // The script's own header QUOTES the old apology string in order to explain the defect, so a
  // guard that greps the raw file would fire on the documentation of the fix rather than on a
  // regression. Judge the CODE.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')

  it('reads the model stop_reason instead of inferring truncation from a count', () => {
    expect(code).toContain("res.stop_reason === 'max_tokens'")
    // The old inference — "fewer rows than articles means the reply was cut short" — cannot tell a
    // clipped array apart from a skipped or mislabelled article, and named the wrong cause in the
    // comment either way.
    expect(code).not.toMatch(/parsed\.length\s*<\s*articles\.length/)
  })
  it('sends the real diff and runs the grounding gate before formatting', () => {
    expect(code).toContain('changedDiff()')
    expect(code).toContain('groundVerdicts(')
    expect(code).toContain('planAutodocBatches(')
  })
  it('no longer has any way to mint an unreviewed article as an item', () => {
    expect(code).not.toContain('withUnreviewed')
    expect(code).not.toContain('Not reviewed')
    // Unreviewed articles reach the comment only on the separate channel.
    expect(code).toContain('unreviewed: AutodocUnreviewed[]')
  })
  it('warns in the job log when coverage is incomplete, so a swallowed gap is visible', () => {
    expect(code).toContain('article(s) unreviewed::')
  })
})

// ── The diff actually reaches git (regression: PR #2547, 2026-09-11) ────────────────────────
//
// scripts/help-autodoc.mts built its `git diff` as a COMMAND STRING and ran it through execSync,
// which goes via /bin/sh — dash on a GitHub runner. Git's pathspec magic `:(exclude)…` carries
// unquoted parentheses, so dash rejected the whole command with `Syntax error: "(" unexpected`
// and the job reviewed every article with NO DIFF AT ALL. The feature the rebuild existed for was
// inert on its first real run, and the only reason it produced no false findings is that the
// fail-safe held: a loud ::warning, and groundVerdicts refusing to grade an ungrounded claim.
//
// This repo is unusually exposed to it — Next.js route groups and dynamic segments mean real
// source paths like `app/(main)/spaces/[slug]/dispatch-actions.ts` carry both parens and brackets.
//
// The fix is an argv array through execFileSync, which reaches execve without a shell. These arms
// pin the shape that makes that true, and the last one proves the failure mode is real rather
// than remembered.
describe('the autodoc diff pathspecs survive the shell', () => {
  const source = readFileSync('scripts/help-autodoc.mts', 'utf8')

  it('runs git for the diff through execFileSync, never a shell command string', () => {
    // The diff call must not be interpolated into a template literal handed to execSync.
    expect(source).toMatch(/execFileSync\(\s*'git',/)
    expect(source).not.toMatch(/execSync\(\s*`git diff --unified/)
  })

  it('passes every exclude pathspec as its own argv entry, not a joined string', () => {
    expect(source).toMatch(/\.\.\.EXCLUDE_PATHSPECS/)
    // `.join(' ')` on the pathspecs is exactly what put them through a shell.
    expect(source).not.toMatch(/EXCLUDE_PATHSPECS\.join/)
  })

  it('🔴 the failure is real: a shell rejects these pathspecs, argv does not', async () => {
    const { execFileSync } = await import('node:child_process')
    const specs = [':(exclude)pnpm-lock.yaml', ':(exclude)*.png']

    // Shell form — this is what CI ran, and it must still blow up.
    let shellFailed = false
    try {
      execFileSync('/bin/sh', ['-c', `printf '%s' ${specs.join(' ')}`], { encoding: 'utf8' })
    } catch {
      shellFailed = true
    }
    expect(shellFailed).toBe(true)

    // Argv form — the same tokens reach the program untouched.
    const out = execFileSync('printf', ['%s|', ...specs], { encoding: 'utf8' })
    expect(out).toBe(':(exclude)pnpm-lock.yaml|:(exclude)*.png|')
  })
})
