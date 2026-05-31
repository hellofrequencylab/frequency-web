import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getBlockedProfiles } from '@/lib/blocking'
import { getInitials } from '@/lib/utils'
import { unblockFromSettings } from './actions'
import { DeleteAccount } from './delete-account'

export const metadata: Metadata = {
  title: 'Account & privacy',
  description: 'Manage blocked members and delete your account.',
}

export default async function AccountSettingsPage() {
  const myProfileId = await getMyProfileId()
  const blocked = myProfileId ? await getBlockedProfiles(myProfileId) : []

  return (
    <div className="max-w-2xl">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-sm text-subtle hover:text-text mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Settings
      </Link>

      <h1 className="text-2xl font-bold text-text mb-1">Account &amp; privacy</h1>
      <p className="text-muted mb-8">Manage who you have blocked and delete your account.</p>

      <section className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle mb-3">
          Blocked members
        </h2>
        {blocked.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-elevated px-4 py-6 text-sm text-muted">
            You haven&rsquo;t blocked anyone. You can block a member from their profile.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface-elevated">
            {blocked.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <Link href={`/people/${p.handle}`} className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-muted">
                    {getInitials(p.display_name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text">
                      {p.display_name}
                    </span>
                    <span className="block truncate text-xs text-subtle">@{p.handle}</span>
                  </span>
                </Link>
                <form action={unblockFromSettings.bind(null, p.id)}>
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text hover:border-border-strong transition-colors"
                  >
                    Unblock
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle mb-3">
          Danger zone
        </h2>
        <DeleteAccount />
      </section>
    </div>
  )
}
