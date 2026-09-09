import { notFound } from 'next/navigation'
import { DashboardTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'
import { getVaultData } from '@/lib/vault/vault-data'

// The Vault (ADR-270/294). Module-driven: the whole interior — standing hero, the leaderboard
// link, Your Vault, Trophies, Awards, and the Vault Store — is arranged by the operator through the
// page's Layout editor (Settings ▾ → Page → Layout). Each block self-fetches off the one cached
// Vault read (lib/vault/vault-data). The page itself only carries the Dashboard chrome; the store
// block owns the grid and the redeem action is the authority.
//
// 🔴 NO PREVIEW BANNER. A `CrewPreviewBanner` stood here for any member who could not spend, and it
// is gone with the `vault_cash_in` gate (ADR-1295, owner ruling 2026-09-09, OWN-071). Nobody is
// previewing the Vault any more; every signed-in member spends what they earned.

export default async function StorePage() {
  // The read still runs here: it is request-cached and notFound()s a logged-out viewer before the
  // modules below self-fetch off the same cache.
  const data = await getVaultData()
  if (!data) notFound()

  return (
    <DashboardTemplate
      eyebrow="The Quest"
      title="Vault Store"
      description="Your Vault and the Vault Store in one place. Everything you earn by showing up, and what you can spend it on."
      back={{ href: '/crew', label: 'Crew Dashboard' }}
    >
      <PageModules route="/crew/store" />
    </DashboardTemplate>
  )
}
