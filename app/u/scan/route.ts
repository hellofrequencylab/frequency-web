// Lead unsubscribe for scan-intro emails (ADR-099). Public — no auth (the
// recipient is a non-member). HMAC token over the contacts.id (lib/connections/
// lead-unsub) flips consent_state to 'unsubscribed'. GET = human click +
// confirmation page; POST = RFC 8058 one-click from the mailbox provider.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyLeadUnsubToken } from '@/lib/connections/lead-unsub'

export const dynamic = 'force-dynamic'

async function unsubscribe(contactId: string | null, token: string | null): Promise<boolean> {
  if (!contactId || !token || !verifyLeadUnsubToken(contactId, token)) return false
  try {
    const db = createAdminClient() as unknown as SupabaseClient
    await db
      .from('contacts')
      .update({ consent_state: 'unsubscribed', updated_at: new Date().toISOString() })
      .eq('id', contactId)
    return true
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const ok = await unsubscribe(url.searchParams.get('c'), url.searchParams.get('t'))
  return new NextResponse(ok ? 'Unsubscribed' : 'Invalid link', { status: ok ? 200 : 400 })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const ok = await unsubscribe(url.searchParams.get('c'), url.searchParams.get('t'))
  const inner = ok
    ? `<h1 style="font-size:22px;margin:0 0 12px;">You're unsubscribed</h1>
       <p style="color:#555;line-height:1.6;margin:0;">We won't email you again from Frequency. Sorry for the interruption.</p>`
    : `<h1 style="font-size:22px;margin:0 0 12px;">Link expired</h1>
       <p style="color:#555;line-height:1.6;margin:0;">This unsubscribe link isn't valid. If you keep receiving emails, reply to one and we'll remove you.</p>`
  return new NextResponse(page(inner), {
    status: ok ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function page(inner: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Frequency</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f5f5f5;margin:0;padding:48px 16px;color:#1a1a1a;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">${inner}</div>
</body></html>`
}
