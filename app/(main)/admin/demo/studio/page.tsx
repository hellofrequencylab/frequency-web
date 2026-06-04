import { redirect } from 'next/navigation'

// The Seed Studio now lives on /admin/demo alongside the management controls
// (one combined page). Keep this route as a redirect so old links/bookmarks land
// in the right place.
export default function SeedStudioRedirect() {
  redirect('/admin/demo')
}
