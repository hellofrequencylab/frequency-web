import { redirect } from 'next/navigation'

// The Friends surface folded into the Network hub (ADR-172). Its people/relationships
// view now lives at /network/friends; the old ?mode=contacts split resolves to the
// canonical My Contacts at /network/contacts. This stub keeps every legacy /friends
// link (nav, notifications, invites, external) working via a redirect.
export default async function FriendsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const { mode } = await searchParams
  if (mode === 'contacts') redirect('/network/contacts')
  redirect('/network/friends')
}
