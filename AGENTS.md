<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Naming + voice — consult BEFORE writing or editing ANY copy

Two locked canons govern everything a member, visitor, or operator can read (UI
copy, notifications, practice/Journey/help pages, marketing, emails, error/empty
states, SEO/meta, AND every word any AI feature generates — Vera, blurbs, drafts):

- **[`docs/NAMING.md`](docs/NAMING.md)** — terminology. Always wins on names.
- **[`docs/CONTENT-VOICE.md`](docs/CONTENT-VOICE.md)** — demographic, voice, and
  SEO/AIO. The voice is "a camp counselor you actually respect": proper nouns carry
  the magic, sentences stay plain, never narrate the reader's feelings, pass the
  skeptic test. **No em dashes in brand copy.** Run its §10 checklist on every piece.

AI-generated copy must read these too: the shared primer in
`lib/ai/voice.ts` injects the rules into Vera and every generation path. If this
guide and the naming canon conflict, the naming canon wins on names.

# Documentation protocol (git ⇄ Notion) — follow on every change

When you plan or ship anything, route the docs by audience. Full spec:
[`docs/DOCS-PROTOCOL.md`](docs/DOCS-PROTOCOL.md).

- **Technical** (schema, migrations, code, APIs, config, decisions+rationale) →
  **git**: update the relevant `docs/*.md`; add an ADR to `docs/DECISIONS.md` for any
  decision. Code + `supabase/migrations/` are the source of truth.
- **Instructional** (how a human uses / operates / moderates / understands the live
  product; worldview, strategy) → **Notion** "Web Platform — Training & Strategy"
  database (data source `collection://96c71490-1114-4c73-9547-88b5140126ed`, under the
  Web Community page). **Update the existing subject page in place**; create a page only
  for a genuinely new subject. Never put changelogs/build-logs or copied code in Notion —
  link back to the git doc via the page's "Source of truth" property.
- **Neither** (pure refactor, no operator impact) → git only; no Notion page.

Keep Notion lean: one page per durable subject, instructional voice, link don't duplicate.

# Presentation standard — applies to everything we produce

Every artifact (doc, report, PR, email draft, in-product UI) is presentation-ready in
whatever surface it lands in. Polished is the default, not a finishing step. Full spec:
[`docs/PRESENTATION.md`](docs/PRESENTATION.md). Lead with the answer, prefer scannable
tables, use the ✅/⏳/⚠️/🔴 status legend, never hardcode hex in UI.

# Page framework — every interior page composes the kit (never hand-roll a layout)

One shell, five templates, one chrome map. Full spec:
[`docs/PAGE-FRAMEWORK.md`](docs/PAGE-FRAMEWORK.md) §3 + §8.

- **Pick a template** from `@/components/templates` by *what the content is*, and fill its
  slots — never re-declare a header, card, or grid:
  **Stream** (a flow of items) · **Index** (a collection to browse) · **Detail** (one
  entity: context band + tabs) · **Dashboard** (metric-led operator workspace) ·
  **Focus** (a centered, no-rail compose/edit/settings surface).
- **Register the rail** in one place — `lib/layout/page-chrome.ts` (`'global'` /
  `'scoped'` / `'none'`). The shell reads it; pages never toggle the rail themselves.
  Adding a Focus page = one line here, not an edit to `app-shell.tsx`.
- **Compose, don't author:** headers come from `PageHeading`, stats from `StatCard`,
  browse cards from `EntityCard`/`PersonCard`, sections from `SectionHeader`, empties from
  `EmptyState`. No `text-[10/11px]` content type; semantic tokens only.
- **Speed is structural:** Server Components by default; never block the shell on slow
  awaits — push them behind per-section `<Suspense>` (PAGE-FRAMEWORK §5).
