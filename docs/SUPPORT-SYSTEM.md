# Support System — help desk, AI search, and living docs

Status: **partly built (help center) / rest is design.** Decisions: [ADR-067](DECISIONS.md)
(AI search + the living-docs loop) and [ADR-066](DECISIONS.md) (Vera is the voice). Runs on the
AI core ([ADR-041](DECISIONS.md)/[AI-STRATEGY.md](AI-STRATEGY.md)) under the governance kernel
([ADR-028](DECISIONS.md)). Builds on the docs-as-code help center ([HELP-CENTER.md](HELP-CENTER.md))
and the documentation router ([DOCS-PROTOCOL.md](DOCS-PROTOCOL.md)).

**The shape in one line:** the help desk is a **support menu** (search → ask Vera → human) backed by
a **living knowledge base** that the AI keeps current and that real member questions keep growing —
with a **human approval gate** so nothing publishes itself.

> We already have ~70% of this designed or built. This doc connects the rails — it does **not**
> start over. The "next level" is three moves: search → AI/RAG, the drift *nudge* → an AI that
> *drafts the doc + a staff checklist*, and a *coverage measure* so the AI works a gap list.

---

## 1. The support menu — three tiers, in priority order

A single contextual launcher, available app-wide (not just at `/help`):

| Tier | What | Cost | When it's the answer |
|---|---|---|---|
| 1 · **Instant search** | Client-side substring match over the article index (today's `<HelpSearch>`) | Free, instant | The member half-knows what they want; show it as they type |
| 2 · **Ask Vera** | Grounded RAG answer in Vera's voice, **with citations** | Cheap (Haiku), on explicit ask only | A real "how do I…" question; escalate only when the member presses Enter / "Ask" |
| 3 · **Talk to a human** | Route to host/guide/janitor (Vera offers a warm intro) | — | Low confidence, anything sensitive, or the member wants a person |

This ordering **is** the bridge doctrine ([AI-VERA.md §3](AI-VERA.md)): the cheap/no-AI path is the
default, AI is the middle escalation, and a human is always one tap past that.

## 2. What exists today ✅

| Capability | Where | State |
|---|---|---|
| Docs-as-code help center (Markdown, static, SEO, public) | `content/help/`, `lib/help/content.ts`, `app/(help)/help/` | ✅ Built |
| Per-article metadata: `featureKeys`, `audience`, `status`, `updated` | front-matter | ✅ Built — **`featureKeys` is the linchpin** |
| Drift detection (code/route changed w/o doc update) | `.claude/hooks/docs-drift-check.sh` + `.github/workflows/docs-drift.yml` | ✅ Built — but only *nudges a human* |
| Doc-routing agent (git / help / Notion, right voice) | `/sync-docs` skill | ✅ Built |
| Public "What's new" | `docs/CHANGELOG.md` → `/help/changelog` | ✅ Built |
| RAG substrate (`profiles.embedding vector(384)`) + Claude SDK | Supabase + `@anthropic-ai/sdk` | ✅ Present |
| AI plan: support bot (Haiku + RAG), one governed core | [AI-STRATEGY.md](AI-STRATEGY.md) | ✅ Designed |

## 3. The gaps 🔴

| Gap | Today | Target |
|---|---|---|
| **AI search** | `<HelpSearch>` = client-side substring match | Semantic RAG: embed → retrieve → Haiku answers **with citations + human fallback** |
| **AI *authors* docs** | Drift hook pings a person to go write it | AI drafts/updates the article + CHANGELOG from the diff, opens a PR |
| **Coverage & review** | No measure of "is everything documented"; no staff review surface | Coverage matrix (every feature → fresh article) + a **PR-based staff review** of AI drafts |

> ⚠️ **Reality check:** `profiles.embedding vector(384)` exists but **no embedding pipeline is built**
> — only the column. This initiative builds that pipeline for help content.

---

## 4. The architecture — one closed loop

The whole "living system" is a single loop with **one human checkpoint**, fed by real demand:

**Supply (keep docs current):**
```
PR touches a user-facing route
   └─► drift detector reads which featureKeys changed        (signal already exists)
        └─► AI doc-writer drafts/updates the help article + CHANGELOG line
             (member voice, grounded in the diff)
             └─► opens / updates a PR  ── NOT auto-merged
                  └─► generates a STAFF REVIEW CHECKLIST       ← "the list to double-check"
                       (what changed · which articles · claims to verify · screenshots to refresh)
                            └─► staff approve in GitHub → merge → re-embed → search is fresh
```

**Demand (grow docs from real questions):**
```
member asks Vera → query + confidence logged (ai_help_queries)
   └─► recurring "no confident answer" questions become the AI's to-write list
        (real questions write the docs — this is what makes it *living*)
```

Both halves run on the **shared AI core** (`lib/ai/`) — the support bot and the doc-writer are two
faces of one kernel ([AI-STRATEGY.md](AI-STRATEGY.md): "one brain, many faces").

---

## 5. AI search (RAG) — the build

### Embeddings — gte-small via a Supabase Edge Function (ADR-067)
Anthropic has no embeddings API, so search needs its own model. **gte-small in a Supabase Edge
Function (Transformers.js):** 384-d (matches the existing column), **zero per-call cost**,
server-side, no new vendor — fits the anti-lock-in + cost-discipline posture. We standardize on
gte-small for the help index (and ideally the eventual `profiles` pipeline too; both 384-d, the
swap is free). The same model embeds **both** the index and the query (consistency is mandatory).

### Data layer (new migration)
- **`help_chunks`** — `(id, category, slug, heading, content, content_hash, embedding vector(384),
  updated_at)`. Articles chunked **by heading** so a citation points at a section.
- **`match_help_chunks(query_embedding, match_count, min_similarity)`** RPC — cosine `<=>`,
  `SECURITY DEFINER`, **anon-callable** (help is public) but returns **published chunks only**.
- HNSW index on `embedding`.

### Indexing pipeline (build the missing rail)
- `lib/help/index-build.ts`: read published articles (reuse `lib/help/content.ts`) → chunk by
  heading → embed → **upsert by `content_hash`** (only re-embed changed chunks; idempotent).
- `pnpm help:index` runs **in CI on merge to main** → search is always fresh. (Can move to an
  enqueued `notification_queue` job later.)
- ⚠️ **Runtime bundling:** the indexer reads `content/help/**` from disk **at runtime** (nightly
  `embed-help` cron + admin "Build index"). Next's tracer can't follow those dynamic `fs` reads, so
  `content/help/**/*` is pinned into the serverless bundle via `outputFileTracingIncludes` in
  `next.config.ts`. Without it the read returns `[]`, the index builds **empty**, and Ask Vera can
  only deflect. The reindex now **throws on zero articles** so this fails loud, not silent (ADR-129).

### Retrieval + answer
- `lib/ai/help-rag.ts` (**testable core, no I/O** — same split as `lib/studio/winback.ts`):
  `question → embed → match_help_chunks → assemble context → Haiku (strict grounded prompt) →
  { answer, citations[], confidence }`, in **Vera's voice**.
- **Deterministic fallback** = return the top vector/substring matches as plain links — so search
  *never breaks* when AI is off, over budget, or keyless.
- **Confidence gate:** below threshold, or "not covered" ⇒ human hand-off + closest articles.
  **Never answer without ≥1 retrieved chunk** (no ungrounded output).
- Route handler `app/(help)/help/ask/route.ts`: POST `{question}`, **streamed**, server-only,
  rate-limited, capped via the usage ledger, killable via `platform_flags.ai_enabled`.

### UI
- Keep instant substring results **as you type** (free, fast). Add an **"Ask"** affordance that
  streams a cited answer inline + a **"talk to a human"** action — honoring the
  [HELP-CENTER.md](HELP-CENTER.md) "swap behind the same `<HelpSearch>` props" design.
- Log every query → **`ai_help_queries`** (question, confidence, deflected?) — the seed for the
  demand-side loop (§4).

---

## 6. The living-docs loop (auto-author + staff review)

- **Trigger:** the existing `featureKeys` drift signal — a PR touching a user-facing route whose
  `featureKeys` map to an article flags that article for review.
- **Author:** the AI doc-writer drafts/updates the article + a `CHANGELOG.md` line, in member voice,
  grounded in the diff (member-facing behavior only; pure refactors are skipped per DOCS-PROTOCOL).
- **Review = PR-based (ADR-067).** The draft lands as a commit on the PR with a **staff checklist**
  in the PR body (what changed · which articles · claims to verify · screenshots to refresh). Staff
  approve in GitHub; git stays the source of truth; CI + Vercel preview already gate it. *(An
  in-product Studio "Docs to review" queue is a deliberate later option if non-engineers need to
  approve end-to-end — not built first.)*
- **Nothing auto-publishes.** AI proposes, a human approves, merge re-embeds. This is the ADR-028
  copilot-first rule applied to docs.

## 7. Coverage as a system (so "document everything" is measurable)

- **Feature-key registry** — a canonical manifest of feature keys so the AI and humans share one
  vocabulary (the same keys used in article `featureKeys`).
- **Coverage matrix** — every feature key × *does it have a published, fresh article?* A script/report
  surfaces: 🔴 feature with no article · ⚠️ stale (its `featureKeys` changed after the article's
  `updated` date) · ✅ covered + fresh. The AI works the gap list; humans review a queue rather than
  hunting for work.

## 8. Best practices (the principles that keep it sane)

1. **Git is the source of truth; docs ship with the feature** (already the posture — no docs SaaS).
2. **`featureKeys` is the contract** between code and docs; maintain the registry.
3. **RAG answers are grounded + cited + confidence-gated**; never improvise (wellness-grade).
4. **AI proposes, humans approve — nothing auto-publishes** (ADR-028 governance).
5. **Measure coverage, freshness, and unanswered queries; let the AI work the lists.**
6. **Cost discipline:** Haiku default, prompt-cache the system prompt, AI only on explicit ask,
   batch the doc-writing (AI-STRATEGY cost levers).

## 9. Governance, safety, cost — reused, not reinvented

Inherited from the shared kernel (ADR-028/041): bounded behavior, **kill switch**
(`platform_flags.ai_enabled`) + per-feature **caps** via the usage ledger, **prompt caching**,
Haiku-default model tiering, **crisis/sensitive → human, never advise**, data-minimized to Anthropic,
**AI always labeled**, and **no autonomous writes until the test/consent harness exists**.

## 10. Relationship to Vera

The "Ask Vera" tier **is** Vera's contextual-help surface ([AI-VERA.md §8](AI-VERA.md)) — same
persona, same kernel, not a separate bot. The support menu surfaces all three tiers; Vera is tier 2
and offers the tier-3 human hand-off. The `lib/ai/` core and the RAG help bot are the **shared first
builds** for both this initiative and Vera (Phases A–B below).

## 11. Phasing

| Phase | Deliverable | Needs AI core? | Shared with Vera? |
|---|---|---|---|
| **0 · Foundation & coverage** | Feature-key registry · coverage matrix report · backfill missing core articles · the app-wide **support menu** launcher | ❌ Ship now | — |
| **1 · AI search** | `lib/ai/` kernel (Haiku router, ledger, caps, kill switch) · gte-small Edge Function · `help_chunks` + RPC · indexing pipeline · RAG bot (cited + fallback) wired into the menu and `<HelpSearch>` | ✅ | ✅ Phases A–B |
| **2 · Living loop** | Drift → AI doc-writer drafts on PRs · PR-based staff review checklist · `ai_help_queries` → proposed articles · re-embed on merge | ✅ | shares the kernel |

Phase 0 is the highest-leverage thing to do today and needs **zero AI**: you can't have "AI that
documents everything" until you can *measure* what "everything" is.

## 12. Decisions locked (ADR-067)

- **AI search = RAG over `content/help` on the shared kernel**, grounded + cited + confidence-gated,
  in Vera's voice; deterministic substring fallback always available.
- **Embeddings = gte-small via a Supabase Edge Function** (384-d, key-free, server-side);
  standardized platform-wide.
- **The living-docs loop with PR-based staff review** (AI drafts + checklist → human approves in
  GitHub → merge re-embeds). In-product review queue is a later option, not first.
- **Coverage is measured** via a feature-key registry + matrix; the AI works the gap/staleness list.

## 13. Go-live / enablement checklist (turning AI search on)

AI search ships **dark** — the kernel + data layer exist but answer nothing until enabled, by design
(the kill switch defaults OFF). To turn it on, in order:

1. ⏳ **CI secrets** — add `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to the repo, then
   run the `help-index` workflow (or `pnpm help:index`) to **populate `help_chunks`** (embeddings).
2. ⏳ **Build the RAG endpoint** (Step 6) and **wire "Ask Vera"** into the support launcher (Step 7).
3. ⏳ **Flip the kill switch** — set `platform_flags.ai_enabled = true` once the index is populated
   and the endpoint is live.
4. ⏳ **Confirm cost guardrails** — `ANTHROPIC_API_KEY` present, per-feature daily cap set
   (`FEATURE_DAILY_CAP_USD` in `lib/ai/budget.ts`).

Until step 3, the launcher's "Ask" stays a placeholder and search falls back to the instant
substring match — the product is whole either way.
