import { Suspense } from 'react'
import { buttonClasses } from '@/components/ui/button'
import { SpacePayoutSetupPromptById } from '@/components/billing/payout-setup-prompt'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/field'
import { readStorefrontConfig } from '@/lib/spaces/storefront'
import { StorefrontBannerField } from './storefront-banner-field'
import { saveStorefrontSettingsAction } from './shop-actions'

// The Storefront tab of the Shop console (ADR-596). The settings for the public per-Space Shop tab:
// its renameable name and whether it shows on the Space profile (Phase 6 renders the public tab from
// preferences.storefront). Plus a pointer to payout onboarding. Server-action form, read-only for a
// staff preview. No em or en dashes.

const LABEL = 'mb-1 block text-body-sm font-medium text-text'

export function StorefrontTab({
  slug,
  spaceId,
  preferences,
  readOnly,
}: {
  slug: string
  spaceId: string
  preferences: unknown
  readOnly: boolean
}) {
  const cfg = readStorefrontConfig(preferences)

  return (
    <div className="mt-4 space-y-6">
      <form action={saveStorefrontSettingsAction.bind(null, slug)} className="space-y-4 rounded-card border border-border bg-surface p-5">
        <div>
          <label htmlFor="tabLabel" className={LABEL}>
            Shop tab name
          </label>
          <Input
            id="tabLabel"
            name="tabLabel"
            maxLength={40}
            defaultValue={cfg.tabLabel}
            disabled={readOnly}
            placeholder="Shop"
          />
          <p className="mt-1 text-meta text-subtle">This is the label members see for your storefront tab.</p>
        </div>
        <div>
          <span className={LABEL}>Shop banner</span>
          <StorefrontBannerField
            spaceId={spaceId}
            initialUrl={cfg.bannerUrl}
            initialFocus={cfg.bannerFocus}
            disabled={readOnly}
          />
        </div>
        <div>
          <Checkbox
            name="published"
            defaultChecked={cfg.published}
            disabled={readOnly}
            label="Show the Shop tab on my public page"
            wrapperClassName="flex"
          />
          <p className="mt-1 text-meta text-subtle">
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

      {/* THE ONE CONNECT PROMPT (LIVE-233). This card used to be a hand-written "Getting paid" panel
          whose only action was a LINK to /settings/billing, one of four such panels in the repo, each
          with its own sentence. It now renders the shared prompt, and since LIVE-290 that includes the
          Express dashboard link once the owner is ready - rendering NOTHING in that case is exactly
          how the "Getting paid" button disappeared from this tab. Before that: nothing once the owner
          is ready, Stripe's hosted onboarding started inline when they are not, and a line naming the
          owner when the reader is an admin who cannot onboard for them. */}
      <Suspense fallback={null}>
        <SpacePayoutSetupPromptById spaceId={spaceId} channels={['orders']} whenReady="status" />
      </Suspense>
    </div>
  )
}
