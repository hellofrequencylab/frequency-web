import { redirect } from 'next/navigation'

// The settings suite is one page now (DAWN 2 screen pass): the notification grid, SMS
// card, and consent scopes render as the #notifications section of /settings (see
// ../page.tsx + section.tsx). This route stays as a permanent anchor redirect so every
// existing link (emails' "Manage preferences", /unsubscribe, /manage-emails, the admin
// rail bank) keeps landing on the same controls.

export default function NotificationsRedirect() {
  redirect('/settings#notifications')
}
