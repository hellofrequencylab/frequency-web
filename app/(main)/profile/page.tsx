import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// ── /profile — "my profile", resolved per member ─────────────────────────────────────────────
//
// 🔴 WHY A REDIRECT ROUTE AND NOT A MENU HREF (owner, 2026-08-06: "the menu editor doesn't let
// me select /profile and the menu link is going to /settings/profile").
//
// A member's profile lives at /people/<their handle>. A menu row is STATIC DATA — one href
// stored once and served to everybody — so there is no href an operator could type into the
// Menu Manager that means "my profile". Until now the closest available answer was
// /settings/profile, which is the profile EDITOR, not the profile. That is why the rail's
// Profile pin has been pointing at a settings form: not a mistake in the menu, a missing route.
//
// lib/menus/defaults.ts carried the note for this exact gap — "/profile has never existed as a
// route and there is no redirect for it, so this pin 404'd for every member who clicked it".
// This is that redirect. With it, /profile is a real destination the Menu Manager can point at,
// ⌘K can offer, and a member can type, and it resolves per session at request time.
//
// THREE OUTCOMES, all deliberate:
//   • signed in with a handle  → /people/<handle>, the profile itself
//   • signed in, no handle yet → /settings/profile, where they can claim one (the only screen
//                                that can fix the reason the first branch failed)
//   • signed out               → /sign-in?next=/profile, and they land here again after
//
// No UI of its own on purpose. Everything a profile page renders already lives at
// /people/[handle]; a second implementation here would be a fork that drifts.
export default async function MyProfileRedirect() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/profile')

  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('handle').eq('id', profileId).maybeSingle()

  if (!data?.handle) redirect('/settings/profile')
  redirect(`/people/${data.handle}`)
}
