import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, faqSchema } from '@/lib/jsonld'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
import { FrequencySubscribe } from '@/components/frequency/site/pages/funnel/frequency-subscribe'

export const metadata: Metadata = {
  title: 'Get notes from Frequency',
  description:
    "A few notes a month from Daniel Tyack, through Frequency: Circles, practices, and events. Leave your email, confirm the link, and you're on the list.",
  alternates: { canonical: '/subscribe' },
  // A retention page for people already here, not a search landing (SCAN-1017): out of the index and
  // the sitemap, links still followed.
  robots: { index: false, follow: true },
  openGraph: {
    ...OG_SITE,
    images: ROOT_OG_IMAGES,
    title: 'Get notes from Frequency',
    description: 'A few notes a month on Circles, practices, and events. Confirm your email and you’re on the list.',
    url: '/subscribe',
  },
  // Metadata merges per TOP-LEVEL KEY: setting only `openGraph` inherits the root `twitter`
  // block verbatim, so the X/Slack card served generic site copy. Mirror this page's own.
  twitter: {
    card: 'summary_large_image',
    title: 'Get notes from Frequency',
    description: 'A few notes a month on Circles, practices, and events. Confirm your email and you’re on the list.',
  },
}

export const revalidate = 3600

const HOW_IT_WORKS = [
  { t: 'Leave your email', b: 'Enter your address below. First name is optional. It takes ten seconds.' },
  { t: 'Confirm it’s you', b: 'We send one email with a link. Click it and you’re on the list. No link, no list.' },
  { t: 'Hear from Daniel', b: 'A few notes a month on Circles, practices, and events. Unsubscribe any time, one click.' },
]

const FAQS = [
  {
    q: 'Who is emailing me?',
    a: 'Daniel Tyack, through Frequency. Real notes from a real person, not an automated drip.',
  },
  {
    q: 'How often will you email me?',
    a: 'A few times a month at most. Circles, practices, events, and the odd invite when something opens near you.',
  },
  {
    q: 'Why do I have to confirm?',
    a: 'So nobody ends up on the list by accident or because someone typed the wrong address. You only get notes after you click the confirm link we send.',
  },
  {
    q: 'Can I leave later?',
    a: 'Any time. Every email has a one-click unsubscribe, and it always works.',
  },
]

export default function SubscribePage() {
  const schema = (
    <JsonLd
      data={[
        faqSchema(FAQS.map((f) => ({ q: f.q, a: f.a }))),
        breadcrumbSchema([{ name: 'Subscribe', path: '/subscribe' }]),
      ]}
    />
  )
  return (
    <>
      {schema}
      <FrequencySubscribe steps={HOW_IT_WORKS} faq={FAQS} />
    </>
  )
}
