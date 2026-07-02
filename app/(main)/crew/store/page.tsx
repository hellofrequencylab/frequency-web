import { notFound } from 'next/navigation'
import { CrewPreviewBanner } from '@/components/crew/crew-preview-banner'
import { DashboardTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'
import { getVaultData } from '@/lib/vault/vault-data'

// The Vault (ADR-270/294). Module-driven: the whole interior — standing hero, the leaderboard
// link, Your Vault, Trophies, Awards, and the Gem Store — is arranged by the operator through the
// page's Layout editor (Settings ▾ → Page → Layout). Each block self-fetches off the one cached
// Vault read (lib/vault/vault-data). The page itself only carries the Dashboard chrome + the
// free-member preview banner (the store block owns its own CrewGate + the redeem authority).

export default async function StorePage() {
  const data = await getVaultData()
  if (!data) notFound()

  return (
    <>
      {!data.canSpend && <CrewPreviewBanner />}

      <DashboardTemplate
        eyebrow="The Quest"
        title="Vault Store"
        description="Your Vault and the Vault Store in one place. Everything you earn by showing up, and what you can spend it on."
        back={{ href: '/crew', label: 'Crew Dashboard' }}
      >
        <PageModules route="/crew/store" />
      </DashboardTemplate>
    </>
  )
}
