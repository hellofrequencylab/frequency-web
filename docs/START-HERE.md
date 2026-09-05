# START HERE: orientation for a new developer

Welcome. This is the front door, about 30 minutes to productive.

## 1. Run it locally (~10 min)
Follow **README → "Getting started (developers)"**: `corepack enable`, `pnpm install`,
`pnpm approve-builds`, fill `.env.local` (the README lists exactly which keys and where to
get them. Note `vercel env pull` returns blanks here, so you fill them by hand), then
`pnpm dev` → http://localhost:3000.

## 2. Read these, in order
- **[README.md](../README.md)**: what Frequency is + the 5-layer architecture at a glance.
- **[AGENTS.md](../AGENTS.md)**: the rules every session runs under. Its §"Which plan is live"
  is the authority for what follows in this list.
- **[docs/BUILD-BACKLOG.json](BUILD-BACKLOG.json)** via **`pnpm backlog`**: the ONE list of where
  the work stands. Status never lives in prose; every row says how it is proven.
- **[docs/UX-MATURITY-PLAN.md](UX-MATURITY-PLAN.md)** + **[docs/BUILD-LIST.md](BUILD-LIST.md)**:
  what ships next (the §Sequencing table) and the phase runway around it.
- **[docs/DECISIONS.md](DECISIONS.md)**: the ADR record, the *why*. A plan doc that contradicts
  an ADR is stale, not authoritative.
- **[docs/ARCHITECTURE.md](ARCHITECTURE.md)**: current stack, directory map, and the
  **authorization model you must follow** (the admin client bypasses RLS; authz is enforced
  in app code). Read before touching code.
- **[docs/EDITOR-ARCHITECTURE.md](EDITOR-ARCHITECTURE.md)**: read before touching any block,
  block registry, or the page editor.
- **[docs/WORKFLOW.md](WORKFLOW.md)**: how work flows (branch → PR → preview → merge; local
  *and* on-the-go) and the path to a team-grade setup.
- **[docs/BASELINE-ASSESSMENT.md](BASELINE-ASSESSMENT.md)**: the 2026-06 systems review
  (ADR-246). Read it for the diagnosis; it is history for status.

`docs/DEVELOPMENT-MAP.md`, `BUILD-SEQUENCE.md`, `BUILD-PHASES.md` and `ROADMAP.md` are superseded
history. When the code and a doc disagree, the code wins; fix the doc in the same pass.

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
- **The other locked canons, each machine-enforced.** [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md)
  (compose one of the eight page shells; never hand-roll a layout; the right rail shows on every
  member page), [STUDIO.md](STUDIO.md) (declare a manifest, never build a wizard),
  [MENU-CONTRACT.md](MENU-CONTRACT.md) (add a catalog row, never rewrite the rail), and
  [DEPLOY-SAFETY.md](DEPLOY-SAFETY.md) (a merge is a deploy; four artifact gates run in `postbuild`).

That's it. Start at step 1.
