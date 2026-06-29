import type { Metadata } from 'next'
import Link from 'next/link'
import { getMyProfileId } from '@/lib/auth'
import { getBlockedProfiles } from '@/lib/blocking'
import { getInitials } from '@/lib/utils'
import { FocusTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { unblockFromSettings } from './actions'
import { DeleteAccount } from './delete-account'
import { DownloadData } from './download-data'

export const metadata: Metadata = {
  title: 'Account & privacy',
  description: 'Manage blocked members, download your data, and delete your account.',
}

export default async function AccountSettingsPage() {
  const myProfileId = await getMyProfileId()
  const blocked = myProfileId ? await getBlockedProfiles(myProfileId) : []

  return (
    <FocusTemplate
      title="Account & privacy"
      description="Manage who you have blocked and delete your account."
      back={{ href: '/settings', label: 'Settings' }}
    >
      <section className="mb-10">
        <SectionHeader title="Blocked members" />
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

      <section className="mb-10">
        <SectionHeader title="Your data" />
        <DownloadData />
      </section>

      <section>
        <SectionHeader title="Danger zone" />
        <DeleteAccount />
      </section>
    </FocusTemplate>
  )
}
