'use client'

import { LogOut } from 'lucide-react'
import { clearDeviceSparkDrafts } from '@/components/studio/spark/draft/use-spark-draft'

// THE SIGN-OUT FORM, in one place.
//
// WHY A COMPONENT FOR FOUR LINES OF JSX. There were two copies of this form — one in
// `user-menu.tsx`, one in `app-shell.tsx` — identical apart from their button and icon classes. Two
// copies of a security-relevant control is how one of them gets a fix and the other does not, and
// the thing being added here is exactly that kind of fix. One form, two call sites, no drift.
//
// WHAT THE HANDLER DOES. Sign-out is a POST to `/auth/signout`, which clears the session cookie
// SERVER-side and redirects. Nothing in that round trip can touch `localStorage`, and the Spark
// draft store lives there — so a member's half-typed answers survived their own sign-out and were
// then offered to whoever signed in next on the same browser, under a card reading "You started
// this". See the note on `clearAllDrafts` (components/studio/spark/draft/draft-store.ts) for the
// full path and for the half of it this does NOT close.
//
// The handler runs synchronously before the browser navigates, and `clearDeviceSparkDrafts` never
// throws (a blocked or full `Storage` returns 0). So this cannot become the reason a sign-out
// fails, which is the only way it could be worse than doing nothing. `onSubmit` rather than
// `onClick` so the same thing happens however the form is submitted — Enter on the button included.
//
// The SERVER copy of a draft (`studio_draft`, keyed by profile id) is deliberately untouched: it is
// already the author's own and nobody else can reach it, and signing out on a borrowed machine must
// not destroy work the member expects to find on their own one.
//
// Both classes are the CALLER'S, unchanged from the markup this replaced — the menu row is neutral,
// the shell's is `danger`. Styling was never the reason to unify these.

export function SignOutForm({
  buttonClassName,
  iconClassName = 'w-4 h-4',
}: {
  buttonClassName: string
  iconClassName?: string
}) {
  return (
    <form action="/auth/signout" method="POST" onSubmit={() => void clearDeviceSparkDrafts()}>
      <button type="submit" className={buttonClassName}>
        <LogOut className={iconClassName} />
        Sign out
      </button>
    </form>
  )
}
