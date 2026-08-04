import { redirect } from 'next/navigation'

// The settings suite is one page now (DAWN 2 screen pass): the connection and location
// controls render as the #connections section of /settings (see ../page.tsx +
// section.tsx). This route stays as a permanent anchor redirect so every existing link
// (the admin rail bank, docs) keeps landing on the same controls.

export default function ConnectionsRedirect() {
  redirect('/settings#connections')
}
