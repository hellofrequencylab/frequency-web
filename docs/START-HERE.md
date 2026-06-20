# START HERE: orientation for a new developer

Welcome. This is the front door, about 30 minutes to productive.

## 1. Run it locally (~10 min)
Follow **README → "Getting started (developers)"**: `corepack enable`, `pnpm install`,
`pnpm approve-builds`, fill `.env.local` (the README lists exactly which keys and where to
get them. Note `vercel env pull` returns blanks here, so you fill them by hand), then
`pnpm dev` → http://localhost:3000.

## 2. Read these, in order
- **[README.md](../README.md)**: what Frequency is + the 5-layer architecture at a glance.
- **[docs/DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md)**: the single source of truth for *what*
  we're building and in what order.
- **[docs/ARCHITECTURE.md](ARCHITECTURE.md)**: current stack, directory map, and the
  **authorization model you must follow** (the admin client bypasses RLS; authz is enforced
  in app code). Read before touching code.
- **[docs/WORKFLOW.md](WORKFLOW.md)**: how work flows (branch → PR → preview → merge; local
  *and* on-the-go) and the path to a team-grade setup.
- **[docs/BASELINE-ASSESSMENT.md](BASELINE-ASSESSMENT.md)**: the current systems assessment +
  the active cleanup roadmap (ADR-246): what's clean, what's being hardened.

## 3. How to ship a change
`main` is **protected**. Branch, open a PR, get green CI + a Vercel preview, then merge
(merging deploys to production). Details in README + WORKFLOW.

## House rules that will bite you if ignored
- **Non-standard Next.js.** Read `node_modules/next/dist/docs/` before writing Next code
  (see `AGENTS.md`). Training-data conventions may be wrong here.
- **Docs protocol.** Technical → git (`docs/*.md`, ADR in `docs/DECISIONS.md`);
  instructional/operator → Notion. See `docs/DOCS-PROTOCOL.md`.
- **One shared database (today).** Local, preview, and prod share one Supabase project.
  Never run destructive/migration commands against it, and do **not** `supabase db push`
  (see [WORKFLOW.md → Scaling to a team](WORKFLOW.md#scaling-to-a-team)).
- **Naming + voice canon.** `docs/NAMING.md` + `docs/CONTENT-VOICE.md` govern every
  member-facing word (and AI-generated copy). Consult before writing UI copy.

That's it. Start at step 1.
