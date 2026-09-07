// Lead unsubscribe for scan-intro emails (ADR-099). Public — no auth (the
// recipient is a non-member). HMAC token over the contacts.id (lib/connections/
// lead-unsub) flips consent_state to 'unsubscribed'. GET = confirm page;
// POST = the write (the confirm form's submit, and the RFC 8058 one-click from
// the mailbox provider, which is POST-only by definition).
//
// ⚠️ GET USED TO ACT (LIVE-156, 2026-09-06). The header above said "GET = human click +
// confirmation page", and the handler did unsubscribe DURING the GET: corporate link scanners and
// mail-client prefetchers fetch every URL in an email, so a lead was opted out before anyone read
// it, and nothing failed loudly (the page rendered "You're unsubscribed" into a fetch nobody was
// looking at). This is the same defect SCAN-552 fixed on the member sibling (app/unsubscribe/
// page.tsx + app/api/unsubscribe/route.ts), and it is fixed here the same way:
//   • GET only VERIFIES the token and renders a confirm button. Nothing is written on this path.
//   • POST performs the unsubscribe: the confirm form posts the same query back here, and the
//     RFC 8058 one-click POST (`List-Unsubscribe-Post: List-Unsubscribe=One-Click`) is unchanged.
// The token in the URL is still the whole authorisation, and POST re-verifies it before writing.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyLeadUnsubToken } from '@/lib/connections/lead-unsub'

export const dynamic = 'force-dynamic'

/**
 * The token gate BOTH methods run, and the only thing GET does. Kept as a file-local helper both
 * handlers call, which is also the shape the authz route scan resolves through
 * (scripts/check-authz-guards.mjs: the gate is in here, in neither export's own body).
 * Returns the verified contact id, or null.
 */
function verifiedContactId(url: URL): string | null {
  const contactId = url.searchParams.get('c')
  const token = url.searchParams.get('t')
  if (!contactId || !token || !verifyLeadUnsubToken(contactId, token)) return null
  return contactId
}

/** THE WRITE. Reached from POST only. */
async function unsubscribe(contactId: string): Promise<boolean> {
  try {
    const db = createAdminClient()
    const { error } = await db
      .from('contacts')
      .update({ consent_state: 'unsubscribed', updated_at: new Date().toISOString() })
      .eq('id', contactId)
    return !error
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const contactId = verifiedContactId(url)
  const ok = contactId ? await unsubscribe(contactId) : false
  return html(ok ? DONE : INVALID, ok ? 200 : 400)
}

// GET IS INERT. It verifies and renders; it never reaches `unsubscribe`.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const contactId = verifiedContactId(url)
  if (!contactId) return html(INVALID, 400)
  return html(confirm(contactId, url.searchParams.get('t') ?? ''), 200)
}

// ── The three states, as standalone HTML (no shell: this is reached from an email) ──────────────

const DONE = `<h1 style="font-size:22px;margin:0 0 12px;">You're unsubscribed</h1>
       <p style="color:#555;line-height:1.6;margin:0;">We won't email you again from Frequency. Sorry for the interruption.</p>`

const INVALID = `<h1 style="font-size:22px;margin:0 0 12px;">Link expired</h1>
       <p style="color:#555;line-height:1.6;margin:0;">This unsubscribe link isn't valid. If you keep receiving emails, reply to one and we'll remove you.</p>`

/** The confirm step: a button that POSTs the same token back. Copy is plain and says what the
 *  click does (CONTENT-VOICE §10, no em dashes). */
function confirm(contactId: string, token: string): string {
  const action = `/u/scan?c=${encodeURIComponent(contactId)}&t=${encodeURIComponent(token)}`
  return `<h1 style="font-size:22px;margin:0 0 12px;">Unsubscribe from Frequency email?</h1>
       <p style="color:#555;line-height:1.6;margin:0 0 20px;">We will stop emailing you at this address.</p>
       <form method="post" action="${escapeAttr(action)}">
         <button type="submit" style="font:inherit;font-weight:600;background:#1a1a1a;color:#fff;border:0;border-radius:8px;padding:10px 18px;cursor:pointer;">Unsubscribe</button>
       </form>
       <p style="color:#777;line-height:1.6;margin:16px 0 0;font-size:14px;">Changed your mind? Just close this page. Nothing changes until you click.</p>`
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function html(inner: string, status: number): NextResponse {
  return new NextResponse(page(inner), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function page(inner: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Frequency</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f5f5f5;margin:0;padding:48px 16px;color:#1a1a1a;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">${inner}</div>
</body></html>`
}
