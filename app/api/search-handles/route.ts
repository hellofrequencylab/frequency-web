import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  if (!q || q.length < 1) {
    return NextResponse.json({ profiles: [] })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, handle, display_name, avatar_url')
    .or(`handle.ilike.${q}%,display_name.ilike.${q}%`)
    .limit(6)

  return NextResponse.json({ profiles: data ?? [] })
}
