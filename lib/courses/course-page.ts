// Everything a course page renders and emits, read once: the Journey, its Run, guides and price, shaped for
// the standard course page (components/frequency/site/pages/courses/course.tsx) and its Course node.
// Server-only. Returns null for anything that is not one of Frequency's public courses.
import 'server-only'
import { getPublicJourney, type JourneyPlan, type JourneyPlanItem } from '@/lib/journey-plans'
import { journeyFacts, genericJourneyFaq } from '@/components/journey/discovery-widgets'
import { readJourneyAudience, readJourneyOutcomes } from '@/lib/journeys/outcomes'
import { readJourneyFaq } from '@/lib/journeys/faq'
import { getJourneyOffer } from '@/lib/journeys/paid'
import { journeyBuySignInPath } from '@/lib/journeys/sales-path'
import { journeyCourseSchema } from '@/lib/jsonld'
import { SITE_URL } from '@/lib/site'
import type { CourseView } from '@/components/frequency/site/pages/courses/course'
import { isFrequencyCourse } from './library'
import { courseHref, offersCertified, trackOf } from './tracks'
import { courseRun, getCourseContext, type CourseContext } from './course-context'

export interface CoursePage {
  plan: JourneyPlan
  items: JourneyPlanItem[]
  view: CourseView
  context: CourseContext
  offer: { priceCents: number; currency: string } | null
}

function price(offer: { priceCents: number; currency: string } | null): string | null {
  if (!offer) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (offer.currency || 'usd').toUpperCase(),
    maximumFractionDigits: offer.priceCents % 100 === 0 ? 0 : 2,
  }).format(offer.priceCents / 100)
}

export async function loadCoursePage(slug: string): Promise<CoursePage | null> {
  const found = await getPublicJourney(slug)
  if (!found || !(await isFrequencyCourse(found.plan))) return null
  const { plan, items } = found
  const [context, offer] = await Promise.all([getCourseContext(plan), getJourneyOffer(plan.id)])
  const facts = journeyFacts(items)
  const track = trackOf({ slug: plan.slug, category: plan.category ?? null })
  const authoredFaq = readJourneyFaq(plan.page_config)
  const view: CourseView = {
    slug: plan.slug,
    path: courseHref(plan.slug),
    title: plan.title,
    summary: plan.summary,
    intro: plan.intro,
    image: plan.cover_image,
    trackLabel: track.label,
    audience: readJourneyAudience(plan.page_config) || track.lede,
    outcomes: readJourneyOutcomes(plan.page_config),
    faqs: authoredFaq.length > 0 ? authoredFaq : genericJourneyFaq(plan),
    facts,
    sessions: context.sessions,
    guides: context.guides,
    hostName: context.provider?.name ?? null,
    certificate: plan.certificate_enabled || context.sessions.length > 0,
    certified: offersCertified(plan.slug),
    priceLabel: price(offer),
    startHref: journeyBuySignInPath(plan.slug),
    hasPreview: facts.phaseCount > 0 && facts.lessonCount > 0,
  }
  return { plan, items, view, context, offer }
}

/** The page's Course node: one per course, on its one canonical page. */
export function coursePageSchema(p: CoursePage) {
  return journeyCourseSchema(p.plan, p.items, {
    path: p.view.path,
    provider: p.context.provider ? { name: p.context.provider.name, url: `${SITE_URL}/spaces/${p.context.provider.slug}` } : null,
    offer: p.offer,
    outcomes: p.view.outcomes,
    instructors: p.context.guides.map((g) => ({ name: g.name, ...(g.handle ? { path: `/people/${g.handle}` } : {}) })),
    run: courseRun(p.context.sessions),
  })
}
