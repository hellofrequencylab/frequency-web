import { redirect } from 'next/navigation'

// The settings suite is one page now (DAWN 2 screen pass): the appearance controls
// render as the #appearance section of /settings (see ../page.tsx + section.tsx).
// This route stays as a permanent anchor redirect so every existing link (admin rail
// bank, docs, bookmarks) keeps landing on the same controls.

export default function AppearanceRedirect() {
  redirect('/settings#appearance')
}
