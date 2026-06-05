# AI controls — the master switch + audit

> **Status:** ✅ Live · janitor-only · `/admin/ai`. Source: `app/(main)/admin/ai/*`, `lib/platform-flags.ts`, `supabase/migrations/20260606010000_platform_flag_events.sql`. Decision: [ADR-098](DECISIONS.md) (addendum).

A janitor-facing operator surface to turn AI on/off platform-wide, see today's spend against the per-feature caps, and read the full toggle history — instead of only flipping the flag via SQL.

## What it controls

`platform_flags.ai_enabled` — the **DB-backed kill switch** layered on top of the env switch (`ANTHROPIC_API_KEY` + `AI_DISABLED`). The live gate is `aiAvailable()` = **flag on AND key present**. It governs *every* AI surface: Vera chat, win-back drafts, help search, and the Profile Creator harvest (scan + Vera assist). Off ⇒ all of them fall back to their deterministic, non-AI behaviour. See [AI-STRATEGY.md](AI-STRATEGY.md).

## The page (`/admin/ai`)

- **Master switch** — a logged toggle (writes through `setPlatformFlag`). Warns when no API key is configured (switch on but AI still inactive).
- **Today's usage** — spend per feature (from `ai_usage`) against each feature's daily cap (`lib/ai/budget.ts`). A feature at its cap pauses itself for the day.
- **Switch history** — recent toggles: on/off, who, when, and `source` (`admin` from the UI, `setup` from a script, `system`).

## Data & logging

- **`platform_flags`** (`key`, `value boolean`, `updated_at`) — the flag itself (public read, service-role writes).
- **`platform_flag_events`** *(new)* — append-only audit: `flag_key`, `value` (new), `previous` (old), `changed_by` → `profiles`, `source`, `created_at`. Operator-only (RLS on, no policy → service role only). Written by `setPlatformFlag()` on every change; the flag write is authoritative and the audit insert is best-effort (a failed log never undoes the toggle).

## Access

Reached from **Admin → Platform → AI controls**, janitor-only (`requireAdmin('janitor')` in the page; the Platform group in `app/(main)/admin/sections.ts` is janitor-floored). The toggle action re-asserts `requireAdmin('janitor')`.
