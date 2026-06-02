<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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
