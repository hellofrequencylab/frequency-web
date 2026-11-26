import Link from 'next/link'
import { getMyProfileId } from '@/lib/auth'
import { getBlockedProfiles } from '@/lib/blocking'
import { getInitials } from '@/lib/utils'
import { paidSpacesEndedByDelete } from '@/lib/account'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { loadSetupHidden } from '@/lib/launch/setup-hidden-io'
import { showSetupFromSettings, unblockFromSettings } from './actions'
import { DeleteAccount } from './delete-account'
import { DownloadData } from './download-data'
import { EraseDrafts } from './erase-drafts'
import { YourStanding } from './standing'
import { createClient } from '@/lib/supabase/server'
import { requestPasswordReset } from '@/app/sign-in/actions'
import { SignInSubmit } from '@/app/sign-in/submit'
import { turnOffMfa } from '@/app/sign-in/mfa-actions'
import { isStaffAccount } from '@/lib/auth/staff-account'

// The Account and privacy SECTION of the unified Settings page (DAWN 2 screen pass).
// This is the server half that used to be app/(main)/settings/account/page.tsx,
// unchanged in behavior: the blocked list (with unblock), the data export, and the
// danger zone (erase saved drafts + the delete-account flow). The old
// /settings/account route now redirects here.

export async function AccountSection() {
  const myProfileId = await getMyProfileId()
  // Both reads are keyed to the session's own profile. paidSpaces names the Spaces whose paid plan
  // deleting the account would end (LIVE-628, ADR-1601), so the danger zone says so before the confirm.
  const [blocked, paidSpaces] = await Promise.all([
    myProfileId ? getBlockedProfiles(myProfileId) : Promise.resolve([]),
    myProfileId ? paidSpacesEndedByDelete() : Promise.resolve([]),
  ])

  const setupHidden = myProfileId && launchSystemEnabled() ? await loadSetupHidden(myProfileId) : false
  // SIGN-IN AND PASSWORD (SEC-045). Setting or changing a password goes through the member's own inbox:
  // the reset email proves they hold the mailbox right now, which is the re-check a password change
  // needs, and it works the same for someone who joined with Google or a magic link and has none yet.
  const {
    data: { user: authUser },
  } = await (await createClient()).auth.getUser()
  const signInEmail = authUser?.email ?? null
  // TWO-STEP CODE (SEC-046): shown to staff only, because only the staff gates enforce it. Resetting it
  // needs a session that already proved a code (mfa-actions.ts re-checks), and the next admin visit asks
  // for a fresh setup, which is how someone moves to a new phone.
  const isStaff = await isStaffAccount()
  const hasTwoStep = (authUser?.factors ?? []).some((f) => f.factor_type === 'totp' && f.status === 'verified')

  return (
    <div className="space-y-8">
      {setupHidden && (
        <div>
          <p className="eyebrow text-muted mb-2">Finish setup</p>
          <form action={showSetupFromSettings} className="flex items-center justify-between gap-4 rounded-card border border-border bg-surface px-4 py-3">
            <span className="text-body-sm text-text">You hid the Finish setup reminder. Your list is still here when you want it.</span>
            <button type="submit" className="btn pa sm">Bring it back</button>
          </form>
        </div>
      )}
      {signInEmail && (
        <div>
          <p className="eyebrow text-muted mb-2">Sign-in and password</p>
          <form action={requestPasswordReset} className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-4 py-3">
            <input type="hidden" name="email" value={signInEmail} />
            <span className="min-w-0 flex-1 text-body-sm text-text">
              Sign in with a magic link, Google, or a password. To set or change your password, we will email a link
              to <span className="font-semibold [overflow-wrap:anywhere]">{signInEmail}</span>.
            </span>
            <SignInSubmit variant="secondary">Email me a password link</SignInSubmit>
          </form>
          {isStaff && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface px-4 py-3">
              <span className="min-w-0 flex-1 text-body-sm text-text">
                {hasTwoStep
                  ? 'Two-step code is on. Admin asks for a code from your authenticator app once per sign-in. New phone? Reset it and set it up again.'
                  : 'Staff need a two-step code from an authenticator app to open admin.'}
              </span>
              {hasTwoStep ? (
                <form action={turnOffMfa}>
                  <SignInSubmit variant="secondary">Reset two-step code</SignInSubmit>
                </form>
              ) : (
                <Link href="/sign-in?step=mfa-setup&next=%2Fsettings%2Faccount" className="btn pa sm">
                  Set up two-step code
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <p className="text-meta font-medium text-muted uppercase tracking-wide mb-2">Blocked members</p>
        {blocked.length === 0 ? (
          <p className="rounded-card border border-border bg-surface-elevated px-4 py-6 text-body-sm text-muted">
            You haven&rsquo;t blocked anyone. You can block a member from their profile.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface lift-1">
            {blocked.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <Link href={`/people/${p.handle}`} className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-surface-elevated text-meta font-semibold text-muted">
                    {getInitials(p.display_name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-medium text-text">
                      {p.display_name}
                    </span>
                    <span className="block truncate text-meta text-subtle">@{p.handle}</span>
                  </span>
                </Link>
                <form action={unblockFromSettings.bind(null, p.id)}>
                  <button
                    type="submit"
                    className="shrink-0 rounded-control border border-border bg-surface px-3 py-1.5 text-body-sm font-medium text-text hover:border-border-strong transition-colors"
                  >
                    Unblock
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      {myProfileId && (
        <div>
          <p className="eyebrow text-muted mb-2">Your standing</p>
          <YourStanding profileId={myProfileId} />
        </div>
      )}

      <div>
        <p className="text-meta font-medium text-muted uppercase tracking-wide mb-2">Your data</p>
        <DownloadData />
      </div>

      <div>
        <p className="text-meta font-medium text-muted uppercase tracking-wide mb-2">Danger zone</p>
        <div className="space-y-3">
          <EraseDrafts />
          <DeleteAccount paidSpaces={paidSpaces} />
        </div>
      </div>
    </div>
  )
}
