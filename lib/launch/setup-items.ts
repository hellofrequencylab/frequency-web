// THE SETUP ITEMS (LIVE-1916), the pure half. After Publish the Get Started list grows past the launch's own steps into
// one check-off item per Space tool a person is likely to want: booking times, a product, memberships, donations, a first
// campaign, a capture link, an automation. Each is done only when a real record says so, and each opens the tool itself
// (the module catalog's own link, passed in). lib/launch/setup-coverage.test.ts fails when a Space tool exists that is
// neither covered here nor exempted with a reason, so a new tool cannot ship without its setup item. PURE.

import type { SetupExtras } from './done-checks.ts'
import type { InventorySection } from './overview.ts'

const done = (n: number) => n > 0

/** The module ids these items open, one per item. The coverage test reads this. */
export const SETUP_ITEM_MODULES = {
  'm-booking': 'space.booking',
  'm-product': 'space.services',
  'm-tier': 'space.memberships',
  'm-donate': 'space.donations',
  'r-campaign': 'space.comms',
  'r-sent': 'space.comms',
  'r-door': 'space.doors',
  'r-auto': 'space.automation',
} as const

type SetupItemId = keyof typeof SETUP_ITEM_MODULES

export function setupSections(x: SetupExtras, hrefs: Readonly<Record<string, string>>): InventorySection[] {
  const item = (id: SetupItemId, label: string, n: number, found: (n: number) => string) => ({
    id,
    label,
    state: done(n) ? ('done' as const) : ('todo' as const),
    found: done(n) ? found(n) : undefined,
    href: hrefs[SETUP_ITEM_MODULES[id]],
  })
  return [
    {
      id: 'money',
      title: 'Money',
      items: [
        item('m-booking', 'Set the weekly times people can book', x.bookingTimes, (n) => `${n} time${n === 1 ? '' : 's'} set`),
        item('m-product', 'List your first product or service', x.products, (n) => `${n} listed`),
        item('m-tier', 'Open a membership tier', x.membershipTiers, (n) => `${n} open`),
        item('m-donate', 'Turn on donations', x.donationAsks, (n) => `${n} amount${n === 1 ? '' : 's'} offered`),
      ],
    },
    {
      id: 'reach',
      title: 'Reach',
      items: [
        item('r-campaign', 'Draft your first email campaign', x.campaigns, (n) => `${n} drafted`),
        item('r-sent', 'Send a campaign to your people', x.campaignsSent, (n) => `${n} sent`),
        item('r-door', 'Make a capture link for new people', x.captureLinks, (n) => `${n} made`),
        item('r-auto', 'Set up an automation', x.automations, (n) => `${n} running`),
      ],
    },
  ]
}
