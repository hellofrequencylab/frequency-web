# Support tickets & bug reporting (ADR-159)

> The **ticketing** layer — the concrete, cataloged "talk to a human" tier of the
> support menu ([SUPPORT-SYSTEM.md](SUPPORT-SYSTEM.md) tier 3). Members report bugs /
> ask for help from anywhere (a global button or the Vera chat box) with page +
> activity context and a screenshot auto-captured; they track their ticket history;
> staff triage and reply from a console wired to the member's profile/CRM; and Vera
> reads a member's ticket history in conversation.

## Data model — `supabase/migrations/20260608030000_support_tickets.sql`

| Table | Purpose |
|---|---|
| `support_tickets` | One report. `ref` (human #1000+), `type` (bug/question/feedback/idea), `subject`, `status` (open/in_progress/waiting/resolved/closed), `priority`, `page_url`, `context` jsonb, `screenshot_path`, `assigned_to`, timestamps. |
| `support_ticket_messages` | Threaded conversation. `author_kind` (member/staff/vera/system), `body`, `is_internal` (staff-only notes the member never sees). |

**RLS:** members select/insert their own tickets and their own non-internal messages.
Staff operations run through the **service-role admin client** behind app-code authz
(repo convention). Screenshots live in a **private `support` storage bucket**, served
via short-lived **signed URLs** minted server-side (reports can carry on-screen data).

## Surfaces

| Layer | Where | File(s) |
|---|---|---|
| Capture | Global report dialog (type · subject · details · paste/attach screenshot · captured-context preview) opened via the `open-support` window event | `components/support/report-dialog.tsx`, `support-launcher.tsx`, `report-button.tsx`, `lib/support/context.ts` |
| Entry points | Account menu ("Report a bug" / "Support tickets"), Vera **chat box** footer, Vera **Help** tab | `components/layout/app-shell.tsx`, `components/vera/vera-chat.tsx`, `vera-launcher.tsx` |
| Member history | `/support` (list) + `/support/[id]` (thread + reply; replying reopens a resolved ticket) | `app/(main)/support/*` |
| Staff console | `/admin/support` (filter queue) + `/admin/support/[id]` (thread w/ internal notes, status/priority/assign, public reply or internal note, reporter card → profile + CRM) | `app/(main)/admin/support/*`, `components/support/admin-ticket-controls.tsx` |
| Vera | Member's recent tickets injected into Vera's system prompt; she references them and points members at the report dialog | `lib/ai/vera/agent-claude.ts`, `app/onboarding/vera-actions.ts`, `lib/support/store.ts` (`supportSummaryForVera`) |
| Data layer | All reads/writes (untyped admin handle until type regen) | `lib/support/store.ts`, `lib/support/types.ts` |

Nav: `admin-support` → Studio section (host+; janitor-retunable in the permission grid).

## Roadmap (not yet built)
- One-click DOM screenshot (html2canvas) alongside paste/attach.
- Deeper CRM: a Support panel on the connection/profile detail (ticket count is already
  on the console reporter card via `ticketCountForProfile`).
- A Vera write-tool to open a ticket conversationally (today she points at the richer
  dialog, which captures the screenshot + context).
- Notify on staff reply; SLA timers; tags/labels for richer cataloging.
- Fold the demand signal into the living-docs loop (recurring bug subjects → doc gaps).
