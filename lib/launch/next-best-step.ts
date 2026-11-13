// THE NEXT BEST STEP (the pure half). Given what a Space already has (lib/launch/inventory.ts sections, the same list the
// launch overview and the Get Started rail read), say the one next undone thing, in the launch wizard's own order, with
// where it opens and one line on why it matters. null when everything is done, so a caller can stay quiet instead of
// nagging. An item the person chose to skip never comes back as the next step. No state of its own: it only reads
// lib/launch/steps.ts (order) and lib/launch/get-started.ts (the todo list and its hrefs). The lifecycle emails
// (lib/marketing/operator-emails.ts, lib/launch/launched-email.ts) call it. PURE.
//
// VOICE: the labels are plain verbs and the why lines lead with the pain, promise no numbers and carry no em dashes.

import { getStartedView } from './get-started.ts'
import type { InventorySection } from './overview.ts'
import { orderedLaunchSteps, type LaunchStepId } from './steps.ts'

export interface NextBestStep {
  /** The inventory item id (lib/launch/inventory.ts, lib/launch/setup-items.ts). */
  id: string
  /** A plain verb phrase, fit for a button. */
  label: string
  /** A path on the app (relative, leading slash). The caller adds the origin. */
  href: string
  /** One line: what it costs the person to leave this undone. */
  why: string
}

/** The launch step each inventory section belongs to. Sections with no step (the Setup groups) come after the launch's own. */
const SECTION_STEP: Partial<Record<InventorySection['id'], LaunchStepId>> = {
  spotlight: 'spotlight',
  space: 'space',
  website: 'website',
  email: 'people',
  schedule: 'event',
  circle: 'circle',
  journey: 'journey',
  paid: 'paid',
}

/** Sections that are the person's own, not the Space's: never the subject of a Space email. */
const NOT_THE_SPACE: ReadonlySet<InventorySection['id']> = new Set(['personal'])

const COPY: Readonly<Record<string, { label: string; why: string }>> = {
  'sp-live': { label: 'Publish your Spotlight', why: 'Until it is published, anyone who goes looking for you finds nothing.' },
  'sp-words': { label: 'Say what you do', why: 'A page that never says what you do leaves people guessing, and most will not guess.' },
  'sc-name': { label: 'Name your Space', why: 'People remember a name before they remember anything else about you.' },
  'sc-tag': { label: 'Write your tagline', why: 'One line is all a stranger reads before they decide to stay or go.' },
  'sc-about': { label: 'Tell your story', why: 'People join someone they feel they know, and a few plain sentences get them there.' },
  'sc-cover': { label: 'Add a cover photo', why: 'A bare page looks closed. A photo says someone is home.' },
  'sc-logo': { label: 'Add your logo', why: 'It is how people spot you again in a crowded feed.' },
  'w-site': { label: 'Publish your website', why: 'Without one, every link you share points somewhere half-built.' },
  'e-people': { label: 'Add the people you already know', why: 'An empty list means each new thing you do starts from zero.' },
  'c-first': { label: 'Put your first event on the calendar', why: 'Nobody can show up for something that is not on the calendar.' },
  'ci-first': { label: 'Open a Circle', why: 'People who meet once drift. A place to keep talking is what keeps them.' },
  'j-first': { label: 'Write your first Journey', why: 'A guided path gives people a reason to come back next week.' },
  'p-ready': { label: 'Set up payouts', why: 'The first time someone wants to pay you is a bad time to find out you cannot take it.' },
  'm-booking': { label: 'Set your weekly booking times', why: 'People who cannot see a time tend to give up before they ask.' },
  'm-product': { label: 'List your first product or service', why: 'If there is nothing to say yes to, a warm visitor has nowhere to go.' },
  'm-tier': { label: 'Open a membership tier', why: 'Your regulars want a way to back you, and right now there is not one.' },
  'm-donate': { label: 'Turn on donations', why: 'People who care about your work often want to give, if you let them.' },
  'm-offerpage': { label: 'Publish a page for one offer', why: 'One clear page beats a menu when someone only has a minute.' },
  'r-campaign': { label: 'Draft your first email', why: 'The people you know will not remember to check back on their own.' },
  'r-sent': { label: 'Send an email to your people', why: 'A drafted email helps nobody until it goes out.' },
  'r-door': { label: 'Make a link to gather new people', why: 'Without one, a curious person has no easy way to raise a hand.' },
  'r-auto': { label: 'Set up an automation', why: 'It follows up for you, so no one waits for a reply while you are busy.' },
}

const FALLBACK_WHY = 'It is one of the small things that makes your Space easier to say yes to.'

interface NextBestStepOptions {
  /** The Space's niche and the owner's starting intents, when known: the same two inputs the wizard orders by. */
  niche?: string | null
  intents?: readonly unknown[] | null
}

/** The one next undone item, or null when nothing is left. */
export function nextBestStep(sections: readonly InventorySection[], opts: NextBestStepOptions = {}): NextBestStep | null {
  const order = orderedLaunchSteps(opts.niche ?? null, opts.intents ?? null).map((s) => s.id)
  const rankOf = (id: InventorySection['id']): number => {
    const step = SECTION_STEP[id]
    // A step the wizard hides for this Space (Journey for a venue) is not an honest suggestion either.
    if (step) return order.includes(step) ? order.indexOf(step) : -1
    return order.length
  }
  const ranked = sections
    .filter((s) => !NOT_THE_SPACE.has(s.id))
    .map((s, at) => ({ s, at, rank: rankOf(s.id) }))
    .filter((x) => x.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map((x) => x.s)
  const first = getStartedView(ranked).todo.find((t) => !t.skipped)
  if (!first) return null
  const copy = COPY[first.id]
  return { id: first.id, label: copy?.label ?? first.label, href: first.href, why: copy?.why ?? FALLBACK_WHY }
}
