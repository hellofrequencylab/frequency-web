# Tier 4 — Reliability & observability

> Self-contained instructions for one web session. Big picture:
> [`../SESSION-PLAN.md`](../SESSION-PLAN.md). Read `AGENTS.md` and
> `docs/DOCS-PROTOCOL.md` before starting.

## Why this tier

~49 raw `console.*` calls (several in cron/lifecycle paths) give no structure and
risk leaking PII; inline email sends drop silently on failure; cron auth is lenient
when `CRON_SECRET` is unset. Beta needs to be operable and debuggable.

## Prerequisites

**Tier 1 merged** (CI gate). Independent of Tiers 2–3. Branch from latest `main`.

## Scope

1. **Structured logging.** Introduce a small logger (e.g. `pino`) and replace `console.*`
   in server actions, `app/api/**` routes (esp. cron), and `lib/` with leveled,
   context-carrying logs (request id / user id / scope where available). **Never log
   email addresses or tokens.** Confirmed offenders include:
   - `app/api/cron/publish-scheduled/route.ts`, `.../lifecycle-triggers/route.ts`,
     `.../event-reminders/route.ts`
   - `app/api/unsubscribe/route.ts`
   - `lib/email.ts`, `lib/push.ts`, `lib/cron-auth.ts`
   - ~21 server actions across `app/(main)/*`
2. **Cron hardening.** In `lib/cron-auth.ts`, fail-closed when `CRON_SECRET` is unset in
   **production or preview** (currently returns null = unauthenticated runs allowed in
   non-prod). Convert silent `.then(({ error }) => error && console.error(...))` swallows
   in cron routes into tracked failures (collect errors, return a non-200 / surface
   counts so a failed insert doesn't look like success).
3. **Email deliverability.**
   - Document and perform Resend domain verification for `findafreq.com`
     (SPF/DKIM/DMARC) — this is a **manual ops step**; flag clearly what the human must
     do in the Resend dashboard + DNS.
   - Optionally (high ROI) route inline email sends through the existing outbox queue
     `lib/queue/outbox.ts` with idempotency keys + retries instead of fire-and-forget.

## Key files

- new `lib/logger.ts` (or similar); `package.json` (+pino)
- `app/api/cron/*/route.ts`, `app/api/unsubscribe/route.ts`
- `lib/email.ts`, `lib/push.ts`, `lib/cron-auth.ts`, `lib/queue/outbox.ts`
- server actions under `app/(main)/*`

## Validation

```bash
npx tsc --noEmit
npx eslint .
npm test
grep -rn "console\." app lib | grep -v node_modules   # should be near-zero in hot paths
```

## Docs

- Update `docs/ARCHITECTURE.md` with the logging approach and cron-auth behavior.
- Record the Resend domain-verification steps in a git doc (e.g. `docs/START-HERE.md`
  or `docs/LAUNCH.md`).
- **Operator-facing** "how to read logs / verify email is flowing" → Notion "Web
  Platform — Training & Strategy" per `docs/DOCS-PROTOCOL.md`. Link back to the git doc.

## Definition of done

- No raw `console.*` left in `app/api`, server actions, or `lib` hot paths.
- Cron fails closed without a secret in prod/preview; cron insert failures are tracked.
- Resend verification documented (and done, or clearly handed to the human).
- tsc/eslint/test green. Draft PR opened.

## Kickoff prompt

> Read `docs/sessions/tier-4-reliability.md` and complete it end to end: add structured
> logging replacing console.*, harden cron auth + email outbox, document Resend domain
> verification (flag manual DNS steps), update docs, validate, and open a draft PR.
</content>
