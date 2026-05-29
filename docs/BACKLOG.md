# Backlog

## Product roadmap

The MVP build list lives at [`../ROADMAP.md`](../ROADMAP.md), prioritized P0–P7
with status markers. That file is the single source of truth for feature work and
is mirrored to the team's Notion. Update both when status changes.

As of 2026-05-28, all P0 and P1 items are shipped; open work starts at P2
(curriculum/practice tables) and P3 (discovery, with P3.31 — submit sitemap +
custom domain — flagged as the highest-leverage remaining SEO move).

## Engineering / handoff cleanup

These came out of the security + handoff audit (the work behind these docs and
`lib/{action-result,auth,cron-auth}.ts`).

### Done
- Authorization added to `createPost` (host+ for announcements, membership for
  group-scoped posts).
- `UNSUBSCRIBE_SECRET` required in production.
- Shared caller-identity helpers extracted to `lib/auth.ts` and adopted across all
  server-action files (no more per-file copies of `getMyProfileId` /
  `getCallerProfile`).
- Server-action error contract unified behind `ActionResult<T>`
  (`lib/action-result.ts`); three conventions documented there and in
  [ARCHITECTURE.md](ARCHITECTURE.md#server-action-error-contract).
- Supabase clients typed with the generated `Database` type. Two latent runtime
  bugs surfaced and fixed in the process: `createNexus` never sent the NOT-NULL
  `outpost_id`; the duplicate-membership check queried a non-existent table.
- Cron auth made **fail-closed** across all 5 endpoints via
  `lib/cron-auth.ts` (was fail-open when `CRON_SECRET` was unset).
- Handoff docs (this `docs/` folder).

### Known remaining hygiene
- **Pre-existing ESLint debt:** ~100 `@typescript-eslint/no-explicit-any` errors
  across admin/broadcast/store/cron files (gem/metadata/profile result casts), plus
  a handful of unused-var warnings. Not introduced by the audit; worth a typed-row
  pass.
- **ESLint config lints build output:** the config picks up generated `.next/`
  files (a doubly-nested `frequency-web/frequency-web/.next/...` path appears).
  Add an ignore for build artifacts.
- **No test framework.** `tsc` + `eslint` + manual verification are the only
  safety nets. Introducing even a thin integration-test layer (especially around
  the admin-client authz checks) would de-risk future changes substantially.

### Open canonical-URL gap (SEO)
The app is served at `go.findafreq.com`, but `lib/site.ts` falls back to
`frequency-web-three.vercel.app` when `NEXT_PUBLIC_SITE_URL` is unset — so
canonical tags, `sitemap.xml`, `robots.txt`, OpenGraph, and JSON-LD can advertise
the wrong domain. **Fix:** set `NEXT_PUBLIC_SITE_URL=https://go.findafreq.com` in
the Vercel project (no code change needed; everything reads from `SITE_URL`). This
supersedes the "point a custom domain at the app" half of ROADMAP P3.31 — the
domain is already live; only the env var is missing.

## Production deploy checklist (env vars)

- `CRON_SECRET` — **required in production**; cron endpoints now reject without it.
- `UNSUBSCRIBE_SECRET` — required in production (HMAC signing for unsubscribe links).
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — web push.
- `NEXT_PUBLIC_SITE_URL` — set to the custom domain (drives metadata, sitemap,
  robots, JSON-LD).
- Supabase URL / anon key / service-role key.

See `.env.example` for the full list.
