import type { Metadata } from 'next'
import { PageHero } from '@/components/marketing/marketing-ui'
import { BetaForm } from '@/components/marketing/beta-form'

export const metadata: Metadata = {
  title: 'Join the Beta',
  description:
    'Request your spot in the Frequency community Beta. We’re opening it to a small group at a time.',
  alternates: { canonical: '/beta' },
  openGraph: {
    title: 'Join the Frequency Beta',
    description: 'Be one of the first. Request your spot in the community Beta.',
    url: '/beta',
  },
}

export default function BetaPage() {
  return (
    <>
      <PageHero
        eyebrow="The community beta"
        title="Be one of the first."
        subtitle="We’re opening the Frequency community to a small group at a time. Add your name and we’ll reach out when a spot opens for you."
      />

      <section className="px-6 pb-24">
        <div className="max-w-md mx-auto">
          <BetaForm />

          <div className="mt-10 grid grid-cols-3 gap-3 text-center">
            <Perk title="Real life" body="Local circles that meet in person." />
            <Perk title="No noise" body="No algorithms, no endless feed." />
            <Perk title="Early access" body="Shape it before anyone else." />
          </div>
        </div>
      </section>
    </>
  )
}

function Perk({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-wide text-primary-strong">{title}</p>
      <p className="mt-1 text-xs text-muted leading-snug">{body}</p>
    </div>
  )
}
