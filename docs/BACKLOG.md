# Master backlog

The single flat, actionable list of outstanding work, spanning engineering
hygiene, the audit findings, the AI fabric/webmaster, and the product verticals.

- **Vertical/roadmap detail and sequencing:** [`DEVELOPMENT-MAP.md`](DEVELOPMENT-MAP.md)
  is canonical (ROADMAP.md and BUILD-PHASES.md are superseded; kept for history).
- **Rationale / decisions:** [`DECISIONS.md`](DECISIONS.md).
- **AI work detail:** [`AI-STRATEGY.md`](AI-STRATEGY.md).

Legend: done this session (D) | left, sized S/M/L | decision needed (?) | large
greenfield initiative (G).

## A. Security and hardening
- D economy-column lock trigger, map XSS escape, open-redirect fix, gem-farm fix,
  private-reply authz, shared input sanitizer, baseline security headers.
- D email-pipeline durability (email integrity — ADR-043): Resend webhook error
  path (independent suppress vs. log, 503-to-retry/200-ack, instrumented) + outbox
  dead-letter logging/recovery (`requeueDeadLettered`/`countDeadLettered`) + handlers
  throw on malformed payloads instead of silently dropping. Schema-free.
- [ ] Run the two pending migrations (`supabase db push`): `20240304…_lock_economy_columns`
  (critical) and `20240305…_perf_indexes`. (S)
- [ ] Strict CSP with nonces on the theme/JSON-LD inline scripts. (M)
- [ ] Rate-limit `check-handle` / `search-handles` / beta; webhook replay protection. (S)
- [ ] `admin_audit_log` for role changes / suspensions / content removals (ROADMAP P7.27). (S)
- [ ] (G) RLS convergence (Phase 2, tiered — ADR-042): ~115 files bypass RLS via the
  admin client. D Tier 1 own-row/public reads migrated to the session client (the
  `lib/auth.ts` caller-identity anchor used by every authed request, plus
  `viewer-stats.ts` and `site-header.tsx`). Tier 2 cross-user aggregates (capacity
  counts, feed scope fan-out, capability resolver) need `SECURITY DEFINER` RPCs +
  policy tests — blocked on the harness (section D). Tier 3 (cron/webhooks/admin)
  stays service-role. (L)

## B. Performance and scale
- D hot-path indexes (events/rsvps/memberships), per-request auth `cache()`,
  admin-emails batched (was 200 sequential calls).
- [ ] Paginate People and Circles (unbounded scans). (M)
- [ ] `force-dynamic` -> ISR on partner/CMS pages. (S)
- [ ] Profile zap-sum via SQL aggregate. (S)
- [ ] `<img>` -> `next/image` on high-volume surfaces (51 sites). (M)
- [ ] (G) Scale ladder (Phase 4, metric-gated): Supavisor, read replicas,
  denormalized feed read-model + hybrid fan-out, table partitioning, Supabase
  Broadcast realtime, Redis/search/vector on signal. (L)

## C. Correctness / economy integrity (mostly product decisions)
- [ ] `awardZaps` auto-promotes to `luminary` past the earned gate. (?)
- [ ] Store redeem TOCTOU race. (?)
- [ ] `lifetime_gems` doubles as the spendable wallet (semantics). (?)
- [ ] Collapse the four zap-award paths into one atomic helper. (M)
- [ ] `welcome_member` achievement is unobtainable. (S)

## D. Quality / CI / test harness (AI-webmaster Layer 1 and shared prerequisite)
- [ ] Gate `tsc` + `eslint` in CI (nothing blocks merges today). (S)
- [ ] Clear lint debt: 73 `no-explicit-any`, 12 unescaped entities, 6
  set-state-in-effect, 27 unused vars; ignore build artifacts in eslint config. (S)
- [ ] Add Dependabot + CodeQL + secret scanning. (S)
- [ ] Build the vitest verification + consent (`shouldSend`) harness; this gates
  ALL agent autonomy (ADR-028). Vitest is installed with ~20 tests today. (M)

## E. AI fabric and webmaster (Sentinel) (planned; see AI-STRATEGY.md)
- [ ] AI core (`lib/ai/`): model router, prompt cache, pgvector RAG, usage ledger
  + caps + kill switch, governance kernel. (M)
- [ ] Member surfaces in order: support bot, encouragement, host copilot,
  calendar, mentor, program management. (M-L)
- [ ] Sentinel Layer 2: scheduled sweeps via Agent SDK + scoped GitHub App,
  findings ledger, autonomy tiers (gated on D). (M)

## F. Engagement / gamification / practices / programs
- [ ] Reward amount-edit UI + member-facing season banner/countdown. (S)
- [ ] `practice.verified` host/peer verification layers. (M)
- [ ] Device attestation + mutual-confirm (P2P) verifiers for captures. (M)
- [ ] Repeatable-node idempotency keying for captures. (S)
- [ ] Realtime reward feedback via Supabase Broadcast (cross-device). (M)
- [ ] Programs content depth (only 4 seed frameworks). (M)
- [ ] Program-as-template "Add to Circle" instantiation (sets adopter as host). (M)
- [ ] Cohort / acquisition-source analytics. (M)

## G. Circles / hierarchy / discovery / IA
- [ ] Circle-discovery visual map layer (proximity list shipped). (M)
- [ ] Member directory filters (`/people` is a flat list). (M)
- [ ] Hub/Nexus-scoped events (confirm `events.scope_type`). (M)
- [ ] Multi-topic circles (one `topical_channel_id` today). (M)
- [ ] Growth-loop UX ("nearly full -> seed a new circle") + circle lineage. (M)
- [ ] Milestone "wake-up" gating map (declarative role+milestone unlocks). (M/L)
- [ ] (G) Density / demand read-model (PostGIS) for expansion + grant story. (L)
- [ ] Soften the newcomer Region->Outpost->Nexus->Hub breadcrumb. (S)

## H. Messaging / social graph
- [ ] Friend suggestions ("people in your circle you haven't met"). (M)
- [ ] (G) Two-way Inbox / member message replies. (L)
- [ ] (G) Postgres-backed sync engine pilot (PowerSync/Electric/Zero) on messaging
  or feed for instant/offline UI. (L)

## I. CRM / comms / lifecycle / live agent
- [ ] (G) Live Claude operator replacing the deterministic stub (`lib/studio/agent.ts`)
  + bounded tools/caps/audit (ADR-028; this is the CRM half of the AI fabric). (L)
- [ ] Notification router/registry (event -> category -> channels -> template),
  make `engagement_events` truly multi-subscriber. (M)
- [ ] Migrate inline email/push send-sites onto the outbox queue with
  `SELECT … FOR UPDATE SKIP LOCKED`. (M)
- [ ] **Verify `frequencylocal.com` in Resend (blocking for volume — ADR-046).** Transactional
  mail sends via Resend, a separate path from Workspace mail; with DMARC now at `p=quarantine`,
  Resend mail is quarantined until the domain is verified in Resend (its own DKIM + SPF).
  Use a dedicated `send.` subdomain to isolate bulk reputation from the human-mail apex, then
  set `EMAIL_FROM` to that sender. (S)
- [ ] Deliverability hardening (subdomain reputation isolation, open/click analytics). (M)
- [ ] Richer Studio engine: segment builder, pipelines (Kanban), drip sequences,
  React Email templates, non-member unsubscribe. (L)
- [ ] `engagement_score` projection off the backbone + `email_events`. (S)
- [ ] Funnel conversion + acquisition source + cohort retention analytics. (M)
- [ ] Semantic search across dispatches/posts + AI digest summarizer. (M)

## J. CMS / page framework / marketing / SEO
- [ ] Submit sitemap to Google/Bing + set `NEXT_PUBLIC_SITE_URL` (supersedes the
  custom-domain half of ROADMAP P3.31; the domain is already live). (S)
- [ ] Domain setup: point `frequencylocal.com` (GoDaddy -> Vercel) at the apex,
  301 the retired `go.findafreq.com`, update auth/OAuth redirect URLs. (S)
- [ ] Page-editor polish: visual focal-point/crop picker; `page_revisions` rollback. (S)
- [ ] Per-Nexus subdomains (`encinitas.frequencylocal.com`). (M)
- [ ] Formal module/widget slot registry + fully scope-aware right rail. (M)
- [ ] Reconcile "Interests" (member) vs "Topics" (public) wording + the "tune in" verb. (S)

## K. Monetization / money foundation / Vault / verticals
- [ ] (G) Money foundation: entity partition + entity-tagged `financial_transactions`
  ledger (ADR-029/032). Gates every revenue vertical. (L)
- [ ] (G) Stripe Connect dual rails (`create_checkout`/`process_payout`/`record_commission`). (L)
- [ ] (G) Freemium / Vault / membership cash-in (ADR-037) + `/upgrade` + `/settings/billing`. (L)
- [ ] Persona axis `profile_personas` (verification + Connect binding, ADR-030). (M)
- [ ] Module registry formalized so verticals self-declare (ADR-033). (M)
- [ ] Subscription-as-bridge entitlement (ADR-035) + store seams (digital/physical,
  reviews/disputes). (M)
- [ ] (G) Verticals: The Collective (first commerce, D1), Local Marketplace (free,
  Stage B), Lab Spaces (D5). (L each)
- [ ] Affiliate referral -> commission -> payout ledger. (M)
- [ ] Donations and Grants rail (Foundation, one-time + recurring; "Support Us"). (M)
- [ ] Inter-entity Lab bridge (ADR-038; mostly legal). (M)
- [ ] Physical merch fulfillment (`store_items` physical flag + shipping flow). (M)

## L. Mobile / capabilities / API
- [ ] (G) Mobile app (Expo/RN) on the shared contract; native QR/NFC/geofence/push.
  The intended primary doorway; nothing built yet. (L)
- [ ] Expose view-model RPCs over a typed endpoint both web and mobile call. (M)
- [ ] Decide mobile stack details / contract transport. (?)

## M. Moderation / safety / trust
- [ ] Content-type-agnostic moderation (generalize `reports.target_type`, ADR-036). (M)
- [ ] Ratings / reviews / disputes for paid offerings. (M)
- [ ] Crew task-volunteering UI inline on circle pages (`crew_tasks` is a catalog today). (M)

## N. Teaser gate / access tiers
- [ ] Extend the teaser gate to event/interest/best-practice pages; flip
  `TEASER_GATE_ENABLED` on at paid launch. (S)
- [ ] Capability resolver gains tier/entitlement input (free vs entitled sets, ADR-037). (M)
- [ ] Website Membership tiers horizontal (resolver input + `/upgrade`). (M)

## O. Docs / config / decisions
- [ ] Production env config: `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_APP_URL`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`.
- [ ] Doc fixes: em-dash sweep (23 files, the rule is violated in AGENTS.md too);
  ADR range "029->036" -> "029->040" in 5 docs; ARCHITECTURE route-group map adds
  `(studio)`/`(help)`/`(marketing)`. Add `NEXT_PUBLIC_APP_URL` and
  `NEXT_PUBLIC_SITE_URL` to `.env.example`.
- [ ] Doc-vs-code discrepancies to reconcile: partner redemption-on-capture IS
  built (`lib/engagement/capture.ts`) yet DEVELOPMENT-MAP / BUILD-PHASES list it
  outstanding (only the discount application may remain); the PAGE-EDITOR-SPEC
  "spec only" banner contradicts its "all phases shipped" section.
- [ ] (?) Open legal decisions blocking the money verticals: which entity sells the
  paid tier; dues vs donation / deductibility / UBIT; inter-entity bridge
  mechanism; marketplace in-app payment; web's role post-mobile.

## Accepted (no action)
- `npm audit`: 4 moderate transitive advisories (postcss in Next's toolchain,
  uuid in `@measured/puck`). The only fix downgrades Next to 9.x; not worth it.

---

## Rollout summary

About 70 line items remain. They cluster into three greenfield mega-initiatives
(Money foundation + Vault in K, Mobile in L, RLS convergence in A) plus the AI
fabric/webmaster (D/E/I), which all share one critical path:

> CI gates + test/consent harness (D) -> RLS convergence (A) -> money foundation
> (K) -> then verticals, mobile, and the live agent/webmaster graduate to autonomy.

**Top strategic initiatives (G):** money foundation, freemium/Vault, mobile, The
Collective, RLS convergence, live agent, persona axis, marketplace, density
read-model, scale ladder.

**Near-term unblockers (small, launch-gating):** run the two migrations; apex
cutover + prod env config; submit the sitemap; the `shouldSend` consent test.

## Production deploy checklist (env vars)
- `CRON_SECRET` (required in production; cron endpoints reject without it).
- `UNSUBSCRIBE_SECRET` (required; HMAC signing for unsubscribe links).
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (web push).
- `NEXT_PUBLIC_SITE_URL` (drives metadata, sitemap, robots, JSON-LD; the
  `lib/site.ts` fallback is a Vercel preview URL, so this must be set in prod).
- `NEXT_PUBLIC_APP_URL` (canonical app URL used by email/digest/ICS/auth redirects;
  falls back to `frequencylocal.com` in several server paths today).
- `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`.
- Supabase URL / anon key / service-role key.
