import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// One-shot endpoint — creates a profile for the currently authenticated user
// if one doesn't already exist.
// DELETE THIS FILE once your real data pipeline is sorted.
export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  // Get the caller's auth user.
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated', detail: authError?.message }, { status: 401 })
  }

  const admin = createAdminClient()

  // Check if a profile already exists.
  const { data: existing } = await admin
    .from('profiles')
    .select('id, handle')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ message: 'Profile already exists', profile: existing })
  }

  // Derive handle from email local-part + short random suffix (mirrors the trigger).
  const emailLocal = (user.email ?? 'user').split('@')[0].replace(/[^a-z0-9_]/gi, '_')
  const suffix = Math.random().toString(36).slice(2, 8)
  const handle = `${emailLocal}_${suffix}`

  const { data: created, error: insertError } = await admin
    .from('profiles')
    .insert({
      auth_user_id: user.id,
      display_name: user.email ?? handle,
      handle,
      is_active: true,
    })
    .select('id, handle, display_name')
    .single()

  if (insertError) {
    return NextResponse.json({ error: 'Insert failed', detail: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    message: 'Profile created',
    profile: created,
    profile_url: `/people/${created.handle}`,
  })
}
