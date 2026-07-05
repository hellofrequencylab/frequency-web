import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false } }

// RETIRED (ADR-522 follow-up): the Puck Spotlight editor is gone. The GRID is the single engine end to
// end — members design their page with the in-rail Layout builder on their own profile (/people/<handle>),
// and the public /spotlight/<handle> renders that same grid. This route now just forwards owners to the
// grid builder so any old link or bookmark lands in the right place. Owner-only + session-derived: it
// resolves the caller's own handle and redirects there; a signed-out visitor 404s, and a member without a
// handle falls back to Settings.
export default async function RetiredSpotlightEditorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: me } = await supabase
    .from('profiles')
    .select('handle')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const handle = (me as { handle?: string | null } | null)?.handle
  redirect(handle ? `/people/${handle}` : '/settings/profile')
}
