import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { readStorefrontConfig } from '@/lib/spaces/storefront'
import { saveStorefrontSettingsAction } from './shop-actions'

// The Storefront tab of the Shop console (ADR-596). The settings for the public per-Space Shop tab:
// its renameable name and whether it shows on the Space profile (Phase 6 renders the public tab from
// preferences.storefront). Plus a pointer to payout onboarding. Server-action form, read-only for a
// staff preview. No em or en dashes.

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const LABEL = 'mb-1 block text-sm font-medium text-text'

export function StorefrontTab({
  slug,
  preferences,
  readOnly,
}: {
  slug: string
  preferences: unknown
  readOnly: boolean
}) {
  const cfg = readStorefrontConfig(preferences)

  return (
    <div className="mt-4 space-y-6">
      <form action={saveStorefrontSettingsAction.bind(null, slug)} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <div>
          <label htmlFor="tabLabel" className={LABEL}>
            Shop tab name
          </label>
          <input
            id="tabLabel"
            name="tabLabel"
            maxLength={40}
            defaultValue={cfg.tabLabel}
            disabled={readOnly}
            className={FIELD}
            placeholder="Shop"
          />
          <p className="mt-1 text-xs text-subtle">This is the label members see for your storefront tab.</p>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" name="published" defaultChecked={cfg.published} disabled={readOnly} className="h-4 w-4" />
            Show the Shop tab on my public page
          </label>
          <p className="mt-1 text-xs text-subtle">
            When this is on, your Shop tab shows on your page with every Live item. Turn it off to hide the
            whole tab.
          </p>
        </div>
        {!readOnly && (
          <div className="flex justify-end">
            <button type="submit" className={buttonClasses('primary', 'md')}>
              Save
            </button>
          </div>
        )}
      </form>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-base font-bold text-text">Getting paid</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          Payouts run on Stripe Connect, straight to your account. Set up a payout account so you can take
          orders when payments turn on.
        </p>
        <Link href="/settings/billing" className={buttonClasses('secondary', 'md')}>
          Set up payouts
        </Link>
      </div>
    </div>
  )
}
