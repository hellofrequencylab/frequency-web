# AI controls: the master switch + audit

> **Status:** ✅ Live · janitor-only · `/admin/ai`. Source: `app/(main)/admin/ai/*`, `lib/platform-flags.ts`, `supabase/migrations/20260606010000_platform_flag_events.sql`. Decision: [ADR-098](DECISIONS.md) (addendum).

A janitor-facing operator surface to turn AI on/off platform-wide, see today's spend against the per-feature caps, and read the full toggle history, instead of only flipping the flag via SQL.

## What it controls

`platform_flags.ai_enabled`: the **DB-backed kill switch** layered on top of the env switch (`ANTHROPIC_API_KEY` + `AI_DISABLED`). The live gate is `aiAvailable()` = **flag on AND key present**. It governs *every* AI surface: Vera chat, win-back drafts, help search, and the Profile Creator harvest (scan + Vera assist). Off ⇒ all of them fall back to their deterministic, non-AI behaviour. See [AI-STRATEGY.md](AI-STRATEGY.md).

## The page (`/admin/ai`)

- **Master switch**: a logged toggle (writes through `setPlatformFlag`). Warns when no API key is configured (switch on but AI still inactive).
- **Today's usage**: spend per feature (from `ai_usage`) against each feature's daily cap (`lib/ai/budget.ts`). A feature at its cap pauses itself for the day.
- **Switch history**: recent toggles: on/off, who, when, and `source` (`admin` from the UI, `setup` from a script, `system`).

## Data & logging

- **`platform_flags`** (`key`, `value boolean`, `updated_at`): the flag itself (public read, service-role writes).
- **`platform_flag_events`** *(new)*: append-only audit: `flag_key`, `value` (new), `previous` (old), `changed_by` → `profiles`, `source`, `created_at`. Operator-only (RLS on, no policy → service role only). Written by `setPlatformFlag()` on every change; the flag write is authoritative and the audit insert is best-effort (a failed log never undoes the toggle).

## Access

Reached from **Admin → Platform → AI controls**, janitor-only (`requireAdmin('janitor')` in the page; the Platform group in `app/(main)/admin/sections.ts` is janitor-floored). The toggle action re-asserts `requireAdmin('janitor')`.

## The model-agnostic gateway seam (env)

Every AI call in the app funnels through **one chokepoint**: `getAnthropic()` (`lib/ai/client.ts`) → `completeText` / `completeRaw` / `runToolLoop` (`lib/ai/complete.ts`). Nothing constructs the SDK or calls `messages.create` directly anymore (the lone exception is `scripts/help-autodoc.mts`, a CI script that can't import the `@/`-aliased wrapper under Node type-stripping, so it uses the shared `getAnthropic()` client + the `MODELS` tier registry instead). That single chokepoint is what makes the **provider a one-line swap** (ENTITY-SPACES-BUILD §B.7 / Epic 0.5b, ADR-318).

| Env var | Default | Effect |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset | The direct-Anthropic key. Present ⇒ AI is configured. |
| `AI_DISABLED` | unset | `=1` hard-disables AI at the env level (below the DB kill switch). |
| **`AI_GATEWAY_URL`** | **unset** | **The gateway flag.** Unset ⇒ the **direct Anthropic path** (current behaviour, byte-for-byte). Set to a model-agnostic gateway base URL (Vercel AI Gateway, which exposes an **Anthropic-compatible `/v1/messages`** exit at zero markup) ⇒ the *same SDK* is pointed at that `baseURL`, so every existing call routes through the gateway unchanged. Only the transport (host + auth header) swaps; the models registry, request shapes, tiering, and parsing are identical. |
| `AI_GATEWAY_API_KEY` | falls back to `ANTHROPIC_API_KEY` | Authenticates to the gateway when `AI_GATEWAY_URL` is set. Omit it to reuse the existing Anthropic key through the gateway. |

`aiEnabled()` is true when **either** the direct key **or** the gateway is configured (and `AI_DISABLED !== '1'`). The DB-backed `platform_flags.ai_enabled` switch still layers on top via `aiAvailable()`, unchanged. The default (flag unset) is exactly today's behaviour: no behaviour change for any call until an operator opts in by setting `AI_GATEWAY_URL`.
