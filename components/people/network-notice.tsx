import { cookies } from 'next/headers'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NetworkNoticeClose } from './network-notice-close'
import { networkNoticeCookie } from './network-notice-cookie'

// THE HOW-TO NOTICE for the three Network surfaces (Members, Friends, My Contacts). Closable, and the
// close is remembered per member (a cookie, no column), so it greets a new member once and then gets out
// of the way. Server Component: it reads the cookie, so a member who closed it never sees it flash.

const ROWS = [
  { href: '/network', name: 'Members', line: 'Everyone on Frequency. Search by name, place, interest or role.' },
  { href: '/network/friends', name: 'Friends', line: 'People you have connected with. Requests, introductions and who to reconnect with.' },
  { href: '/network/contacts', name: 'My Contacts', line: 'Your own address book of people you have met. Private to you unless you share one.' },
] as const

export async function NetworkNotice() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const closed = (await cookies()).get(networkNoticeCookie(user.id))?.value === '1'
  if (closed) return null
  return (
    <NetworkNoticeClose>
      <p className="h3">Three ways to keep your people close</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-3">
        {ROWS.map((r) => (
          <li key={r.href} className="t2">
            <Link href={r.href} className="font-semibold text-text underline-offset-2 hover:underline">
              {r.name}
            </Link>
            {'. '}
            {r.line}
          </li>
        ))}
      </ul>
    </NetworkNoticeClose>
  )
}
