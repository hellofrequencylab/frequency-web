// THE WAYS A CLIENT CAN PUT THEIR WEBSITE ON A DOMAIN (PROG-E10). One registry so the Domain section,
// and later Vera and onboarding, offer the same choices in the same order. Each method is its own build
// phase with its own ledger row; a method that is not built yet is listed as coming so the panel's shape
// never changes when it lands.
//
//   dns        Copy records into the DNS provider, guided and re-checked by the app (LIVE-743, live).
//   one-click  Sign in to the DNS provider and approve, through a Domain Connect service (LIVE-747).
//   buy        Buy a new domain inside Frequency; it is configured with no DNS step (LIVE-748).

export type DomainMethodKey = 'dns' | 'one-click' | 'buy'

export interface DomainMethod {
  key: DomainMethodKey
  label: string
  description: string
  /** Built and switched on. A method that is not yet built shows as Coming soon. */
  available: boolean
}

export const DOMAIN_METHODS: readonly DomainMethod[] = [
  {
    key: 'dns',
    label: 'Use a domain I own',
    description: 'Add two records where your domain is managed. We show you exactly what to enter and check it for you.',
    available: true,
  },
  {
    key: 'one-click',
    label: 'Connect automatically',
    description: 'Sign in to your domain provider and approve. We set the records for you.',
    available: false,
  },
  {
    key: 'buy',
    label: 'Buy a new domain',
    description: 'Search for a domain and buy it here. It works right away with nothing to set up.',
    available: false,
  },
]
