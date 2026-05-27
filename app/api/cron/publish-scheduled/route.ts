import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: due, error } = await admin
    .from('dispatches')
    .select('id')
    .eq('status', 'draft')
    .not('scheduled_for', 'is', null)
    .lte('scheduled_for', now)

  if (error) {
    console.error('[cron/publish-scheduled]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ published: 0 })
  }

  const ids = due.map((d: { id: string }) => d.id)
  const { error: updateError } = await admin
    .from('dispatches')
    .update({ status: 'published', published_at: now, updated_at: now })
    .in('id', ids)

  if (updateError) {
    console.error('[cron/publish-scheduled] update error', updateError.message)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  revalidatePath('/broadcast')
  revalidatePath('/feed')
  revalidatePath('/admin/dispatches')

  return NextResponse.json({ published: ids.length, ids })
}
