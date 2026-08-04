import Link from 'next/link'
import { getMyProfileId } from '@/lib/auth'
import { getBlockedProfiles } from '@/lib/blocking'
import { getInitials } from '@/lib/utils'
import { unblockFromSettings } from './actions'
import { DeleteAccount } from './delete-account'
import { DownloadData } from './download-data'

// The Account and privacy SECTION of the unified Settings page (DAWN 2 screen pass).
// This is the server half that used to be app/(main)/settings/account/page.tsx,
// unchanged in behavior: the blocked list (with unblock), the data export, and the
// delete-account flow. The old /settings/account route now redirects here.

export async function AccountSection() {
  const myProfileId = await getMyProfileId()
  const blocked = myProfileId ? await getBlockedProfiles(myProfileId) : []

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Blocked members</p>
        {blocked.length === 0 ? (
          <p className="rounded-card border border-border bg-surface-elevated px-4 py-6 text-sm text-muted">
            You haven&rsquo;t blocked anyone. You can block a member from their profile.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface lift-1">
            {blocked.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <Link href={`/people/${p.handle}`} className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-surface-elevated text-xs font-semibold text-muted">
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
      </div>

      <div>
        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Your data</p>
        <DownloadData />
      </div>

      <div>
        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Danger zone</p>
        <DeleteAccount />
      </div>
    </div>
  )
}
