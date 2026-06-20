# AI Strategy: the AI fabric and the AI webmaster

How Frequency embeds Claude across the product (member-facing assistants and an
internal repo-maintaining agent), and how we keep the cost of credits bounded.
Decision record: [`DECISIONS.md` ADR-041](DECISIONS.md). Governance kernel reused
from ADR-027/028 ("The Studio" CRM agent). Vertical roadmap context:
[`DEVELOPMENT-MAP.md`](DEVELOPMENT-MAP.md).

## Core principle: one brain, many faces

We do not build a separate philosophy per AI surface. ADR-027/028 already define a
bounded-tool, copilot-first, Action-Queue, autonomy-tiered, capped, kill-switched,
fully-audited agent. Every AI surface (support bot, encouragement, host copilot,
the webmaster) reuses that same governance kernel. Build the kernel once.

## Architecture (on the current stack)

```
   trigger  ->  AI core (lib/ai/*)                    ->  Anthropic API
 (action,        - model router (Haiku -> Sonnet -> Opus)   (server only)
  cron,          - prompt cache (system + KB + tool schemas)
  queue)         - bounded tool registry + executor
                 - usage ledger + per-feature caps + kill switch
                 - RAG over pgvector
```

- **Runs server-side only.** Interactive surfaces use server actions / route
  handlers (streamed). Proactive surfaces ride the existing engagement event
  backbone and the `process-queue` cron, so AI is just another queue consumer.
- **Grounding (RAG).** Reuse the existing pgvector pipeline (`profiles.embedding
  vector(384)`) to embed the help center (`content/help`), practices, programs,
  and circle activity. Retrieve relevant context, do not stuff whole histories.
- **Tools, not free text.** The agent acts only through typed tools
  (`suggest_event_time`, `draft_announcement`, `summarize_circle`,
  `find_members_at_risk`, `flag_for_human`), so consent, safety, and caps are
  structural rather than prompt-dependent.
- **Governance.** Copilot-first: propose into the Action Queue, a human approves.
  Autonomy graduates per action type as the audit log earns trust. Hard frequency
  and spend caps, dry-run, kill switch.

## Member-facing surfaces

| Surface | Model tier | Sync/Async | Grounding | Notes |
|---|---|---|---|---|
| Support bot | Haiku | sync | RAG help center | Deflect to host/janitor on low confidence; crisis goes to a human, never advise |
| Encouragement | Haiku, Batch | async (cron) | gamification signals | Fires on streak-risk / first practice / milestone; respects frequency caps |
| Host/Guide copilot | Sonnet | sync | circle data | Draft announcements, summarize activity, surface at-risk members |
| Calendar support | Haiku/Sonnet | sync | events + recurrence | Suggest times, conflicts, draft descriptions |
| Mentor support | Sonnet | sync + async | mentee history | Check-in suggestions, progress summaries |
| Program management | Opus (design) / Sonnet (ops) | async | program/season data | Curriculum design is rare so Opus; ongoing tracking is Sonnet/Batch |

Also in scope over time: onboarding concierge, "find your people" semantic
matching, circle-notes summarizer, personalized digest, staff analytics copilot,
moderation triage assist, translation / plain-language accessibility.

## Balancing the cost of credits

Cost is `requests x (in_tokens x in_price + out_tokens x out_price)`. Pull every
factor down, and tie spend to revenue. Ranked by leverage:

1. **Model tiering.** Default Haiku; escalate to Sonnet/Opus only when a cheap
   classifier says it is needed. The single biggest lever.
2. **Prompt caching.** Cache the system prompt, knowledge base, and tool schemas.
3. **Batch API (about 50% off).** All non-realtime work (encouragement, digests,
   summaries, reports) goes through it. The queue makes this natural.
4. **RAG over stuffing.** Send the few relevant chunks, not whole histories.
5. **Caps + usage ledger + kill switch.** A usage ledger modeled on the zaps
   ledger attributes cost per feature and per user, with per-feature budgets and a
   global off switch.
6. **Monetize the expensive AI.** Gate mentor/program copilots and unlimited
   support behind membership (ADR-037 / the Vault). Free users get basic Haiku;
   members get the rich copilots. AI becomes a conversion driver, not pure COGS.
7. **Output discipline.** `max_tokens`, structured/tool outputs, stop sequences.
8. **Debounce.** Batch via the queue; do not fire on every event.

**Target metric:** AI COGS as a percent of member LTV, plus a hard
dollar-per-active-member-per-month ceiling. Instrument from day one.

## Safety guardrails (non-negotiable for a wellness community)

Crisis / self-harm detection routes to a human immediately; never give medical or
legal advice. Integrate content-agnostic moderation (ADR-036). Human-in-the-loop
for anything member-facing and irreversible. Label AI clearly. Honor notification
preferences and unsubscribe. Minimize PII in prompts (the Anthropic API does not
train on our data; data-minimize anyway).

## The AI webmaster ("Sentinel")

An agent that runs periodic security/perf/correctness/docs sweeps and proposes
updates. It automates the deep audit pattern that produced much of the current
[`BACKLOG.md`](BACKLOG.md).

### Two layers (do not make the AI re-do what a linter does for free)

- **Layer 1: deterministic guardrails (always-on, near-free, every PR/push).**
  `tsc` + `eslint` gating (neither gates today, the #1 gap), Dependabot, CodeQL
  code scanning, secret scanning + push protection, Supabase advisors against each
  migration, and a small vitest RLS/authz suite that asserts the column-lock and
  membership gates stay enforced.
- **Layer 2: agentic sweeps (scheduled, budgeted, the Claude part).** Does the
  reasoning a linter cannot: is this admin-client mutation authz'd, is this an
  N+1, does this doc match the schema, is this dependency bump safe given how we
  use it. Opens PRs; never merges security-sensitive changes itself.

### Cadence

| When | Scope | Model | Output |
|---|---|---|---|
| Every PR | the diff | Haiku/Sonnet | inline review; auto-applies trivial fixes |
| Nightly | last 24h changes + blast radius | Sonnet | findings issue + small fix PRs |
| Weekly (deep) | one rotating subsystem (authz/economy/perf/docs) | Opus | full audit report + PRs |
| Weekly (deps) | Dependabot PRs | Sonnet | reads changelogs, checks our usage, runs tests, approves safe minors / flags majors |
| Monthly | doc drift + dead code + header/CSP posture | Sonnet | doc-sync PRs + posture report |

Diff-scoped nightly and one-subsystem-per-week is what keeps cost bounded.

### Mechanism

Runner is Claude Code on the web on a scheduled trigger, or the Claude Agent SDK
invoked from a GitHub Actions `schedule:` cron. It reads the repo, migrations,
Supabase advisors, `npm audit`/Dependabot, and CI logs; it writes branches + PRs,
a findings ledger table in Supabase, and a digest.

### Governing the webmaster itself (this is a security control)

An autonomous agent with repo and infra write is a new attack surface, so least
privilege is mandatory:

- Scoped GitHub App token: open PRs and comment only. Never merge to `main`, never
  push to protected branches.
- No production access: it proposes migrations, a human runs `supabase db push`.
  It cannot read prod secrets, the service-role key, or member PII.
- Branch protection + required human review on anything touching
  `supabase/migrations`, auth, RLS, or `lib/ai/*`.
- Spend cap + kill switch via the usage ledger; a runaway sweep halts itself.
- Full audit log of every action with rationale.

### Prerequisite

Per ADR-028's own rule ("no agent autonomy until a test harness exists"), the
webmaster runs in propose-only mode until the vitest verification + consent
harness lands. Propose-only is still highly valuable (it is what the manual audit
did).

## Phased rollout

1. **Support bot over the help center.** Narrow, highly cacheable, copilot-first.
   Stand up the AI core + usage ledger + caps here. Full build spec (RAG search,
   gte-small embeddings, the living-docs loop) in [SUPPORT-SYSTEM.md](SUPPORT-SYSTEM.md)
   (ADR-067); it shares the kernel with Vera ([AI-VERA.md](AI-VERA.md), ADR-066).
2. **Encouragement** (Batch + Haiku). Proves the proactive/cron path and the cost
   model at volume.
3. **Host copilot.** First revenue-gated surface.
4. **Sentinel Layer 1** (CI gates) in parallel; **Layer 2** once the test harness
   exists.
5. Expand to calendar, mentor, and program management once cost-per-member is
   proven.

The critical path is shared with the product roadmap: CI gates + test/consent
harness -> RLS convergence -> then the live agent, the webmaster, and the
member-facing surfaces all graduate to autonomy together.
