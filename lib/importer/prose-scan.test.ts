import { describe, it, expect } from 'vitest'

// ── The PROSE SAFETY SCAN (docs/BUSINESS-IMPORTER.md §4.2). The prose gate exists because
// a commercial claim can hide inside a sentence, so prose that carries no claim has nothing
// for the gate to protect. These tests pin BOTH directions of that bargain, because both
// failure modes are real:
//   • over-flagging restores the manual confirm ritual we are removing, so the real seeded
//     copy below is pinned CLEAN, and the wellness vocabulary this repo's healers actually
//     use (heal / healing / therapy / somatic / practitioner) never flags on its own;
//   • under-flagging publishes an unverified claim, so every claim kind is pinned DIRTY.
// Zero IO, zero AI: scanProse and cleanProsePaths are pure and total.

import {
  cleanProsePaths,
  scanProse,
  PROSE_CLAIM_ORDER,
  PROSE_CLAIM_RULES,
  type ProseClaim,
} from './prose-scan'
import { offeringBlurbPath } from './reframe/apply'
import type { BusinessProfile } from './schema'

/** The claim kinds a string trips, in report order. */
const claims = (text: string | undefined): ProseClaim[] => scanProse(text).claims

/** Assert a string carries no claim at all. */
const expectClean = (text: string) => {
  expect(scanProse(text)).toEqual({ clean: true, claims: [] })
}

/** Assert a string trips (at least) one claim kind. */
const expectClaim = (text: string, claim: ProseClaim) => {
  const result = scanProse(text)
  expect(result.clean).toBe(false)
  expect(result.claims).toContain(claim)
}

// ── The real copy this must never flag ────────────────────────────────────────────────

describe('scanProse: the seeded copy that must stay CLEAN', () => {
  it('passes a plain "who we are" paragraph', () => {
    expectClean(
      "Daniel Tyack works with people who feel stuck, using a technique called Emotional Alchemy to help them access and work through what's in the way.",
    )
  })

  it('passes a plain offering blurb', () => {
    expectClean('Guided breathwork sessions, with everything you need provided.')
  })

  it('passes a plain positioning line', () => {
    expectClean('Integrative bodywork for people who over-give in social situations.')
  })

  it('passes the wellness vocabulary this repo runs on', () => {
    expectClean(
      'Somatic healing and breathwork therapy with a trauma-informed practitioner who has been doing this a long time.',
    )
    expectClean('A wellness practice built around slow, unhurried healing work.')
  })

  it('passes plain prose that happens to contain numbers', () => {
    expectClean('Sessions run 60 to 90 minutes and we usually meet weekly.')
    expectClean('Daniel has been practicing since 2011 and works from a quiet studio.')
    expectClean('It is a 20 minute drive from the airport, or 5 minutes down the road from the train.')
  })
})

// ── The pinned dirty copy ─────────────────────────────────────────────────────────────

describe('scanProse: the copy that must stay GATED', () => {
  it('catches a price and a phone number hiding in an about', () => {
    expect(claims('Massages from $95. Call (555) 123-4567.')).toEqual(['price', 'phone'])
  })

  it('catches opening hours', () => {
    expect(claims('Open Monday to Friday, 9am to 5pm.')).toEqual(['hours'])
  })

  it('catches a health claim', () => {
    expect(claims('Clinically proven to cure anxiety.')).toEqual(['health'])
  })

  it('catches an unverifiable superlative', () => {
    expect(claims('The best massage studio in Austin.')).toEqual(['superlative'])
  })
})

// ── Per claim kind: positive AND negative ─────────────────────────────────────────────

describe('scanProse: price', () => {
  it('flags a currency amount', () => {
    expectClaim('Sessions are $95.', 'price')
    expectClaim('A single visit is 95 USD.', 'price')
    expectClaim('Rates start at £40 for members.', 'price')
    expectClaim('Introductory rate: €40.', 'price')
  })

  it('flags a price word next to a number', () => {
    expectClaim('Bodywork from 95.', 'price')
    expectClaim('Packages starting at 250.', 'price')
    expectClaim('Breathwork is 120 per session.', 'price')
    expectClaim('Coaching runs 400 per month.', 'price')
    expectClaim('Book a free 30 minute intro call.', 'price')
  })

  it('flags a percentage discount', () => {
    expectClaim('Members get 20% off every booking.', 'price')
  })

  it('leaves price-shaped words alone with no number', () => {
    expectClean('We keep the room free of clutter.')
    expectClean('Everything you need comes from the studio.')
    expectClean('She has been working from a home studio since 2011.')
  })
})

describe('scanProse: phone', () => {
  it('flags the common phone formats', () => {
    expectClaim('Call (555) 123-4567 to book.', 'phone')
    expectClaim('Text 555-123-4567 any time.', 'phone')
    expectClaim('Reach the studio at 555.123.4567.', 'phone')
    expectClaim('Ring +1 555 123 4567 for the waitlist.', 'phone')
  })

  it('does not read ordinary numbers as a phone number', () => {
    expectClean('We have been open since 2011 and see 12 clients a week.')
    expectClean('Room 204 is on the second floor.')
  })
})

describe('scanProse: address', () => {
  it('flags a street-address shape', () => {
    expectClaim('Find us at 1200 South Lamar Blvd.', 'address')
    expectClaim('The studio is at 14 Elm Street.', 'address')
    expectClaim('We are upstairs at 8 Grove Road.', 'address')
    expectClaim('Enter through Suite 210.', 'address')
  })

  it('flags a City, ST zip shape', () => {
    expectClaim('Sessions happen in Austin, TX 78704.', 'address')
  })

  it('does not read a distance or a duration as an address', () => {
    expectClean('It is a 20 minute drive from the airport.')
    expectClean('The room is 5 minutes down the road.')
    expectClean('There are 3 ways to work with Daniel.')
    expectClean('She has 12 years of practice behind her.')
  })
})

describe('scanProse: hours', () => {
  it('flags a clock time', () => {
    expectClaim('Doors open at 9am.', 'hours')
    expectClaim('The last session starts at 5 PM.', 'hours')
    expectClaim('We run 9:00 to 17:30 on weekdays.', 'hours')
  })

  it('flags a weekday range', () => {
    expectClaim('Open Monday to Friday.', 'hours')
    expectClaim('Studio hours are Mon-Fri.', 'hours')
  })

  it('flags an always-open claim', () => {
    expectClaim('Booking is open 24/7.', 'hours')
    expectClaim('We are open daily.', 'hours')
  })

  it('does not read a ratio or a plain weekday mention as hours', () => {
    expectClean('Everything is 1:1 work, never a group.')
    expectClean('Sunlight fills the room and the space stays quiet.')
  })
})

describe('scanProse: rating', () => {
  it('flags a star or score claim', () => {
    expectClaim('Rated 4.8 stars by the people who come back.', 'rating')
    expectClaim('A five-star practice.', 'rating')
    expectClaim('Rated 5/5 across the board.', 'rating')
  })

  it('flags a review count', () => {
    expectClaim('127 reviews and counting.', 'rating')
  })

  it('does not read plain numbers or the word five as a rating', () => {
    expectClean('There are five things we do here.')
    expectClean('Daniel sees about 15 people a week.')
  })
})

describe('scanProse: health', () => {
  it('flags a cure or treatment claim', () => {
    expectClaim('This work cures insomnia.', 'health')
    expectClaim('Bodywork that treats chronic pain.', 'health')
    expectClaim('A practice that eliminates anxiety for good.', 'health')
  })

  it('flags a proof, regulatory, or guarantee claim', () => {
    expectClaim('Clinically proven results.', 'health')
    expectClaim('Proven to help with burnout.', 'health')
    expectClaim('FDA cleared and ready.', 'health')
    expectClaim('Guaranteed results in three sessions.', 'health')
    expectClaim('Guaranteed to change how you sleep.', 'health')
    expectClaim('We diagnose what is going on and go from there.', 'health')
  })

  it('flags a percentage-improvement claim', () => {
    expectClaim('87% of clients report sleeping better.', 'health')
  })

  it('never flags the ordinary vocabulary of a healing practice', () => {
    expectClean('Healing work for people carrying a lot.')
    expectClean('A somatic practitioner offering therapy-adjacent bodywork.')
    expectClean('Breathwork, energy healing, and wellness coaching in one place.')
    expectClean('Daniel treats everyone who walks in with the same care.')
  })

  it('does not flag words that merely contain "cure"', () => {
    expectClean('The room is secure and the storage is a manicure-free zone.')
  })
})

describe('scanProse: superlative', () => {
  it('flags an unverifiable ranking claim', () => {
    expectClaim('The best massage studio in Texas.', 'superlative')
    expectClaim('Voted best breathwork studio three years running.', 'superlative')
    expectClaim('The #1 place to start.', 'superlative')
    expectClaim('The number one choice for tired people.', 'superlative')
    expectClaim('An award-winning practice.', 'superlative')
    expectClaim('World-class bodywork.', 'superlative')
    expectClaim('The leading provider of breathwork in the state.', 'superlative')
  })

  it('does not flag ordinary uses of "best"', () => {
    expectClean('We do our best to make the room feel easy.')
    expectClean('The work brings out the best in you.')
  })
})

// ── Totality, ordering, purity ────────────────────────────────────────────────────────

describe('scanProse: total and stable', () => {
  it('treats absent or empty prose as clean', () => {
    expect(scanProse(undefined)).toEqual({ clean: true, claims: [] })
    expect(scanProse('')).toEqual({ clean: true, claims: [] })
    expect(scanProse('   \n  ')).toEqual({ clean: true, claims: [] })
  })

  it('reports claims in PROSE_CLAIM_ORDER, de-duplicated', () => {
    const text =
      'The best studio in Austin. Clinically proven work. Rated 4.8 stars, 127 reviews. Open 9am daily at 14 Elm Street. Call (555) 123-4567. From $95, or 120 per session.'
    const result = scanProse(text)
    expect(result.clean).toBe(false)
    expect(result.claims).toEqual([...PROSE_CLAIM_ORDER])
    expect(new Set(result.claims).size).toBe(result.claims.length)
  })

  it('is pure: repeat calls return identical results', () => {
    const text = 'Massages from $95. Call (555) 123-4567.'
    expect(scanProse(text)).toEqual(scanProse(text))
    expect(scanProse(text)).toEqual(scanProse(text))
  })
})

describe('PROSE_CLAIM_RULES: inspectable and safe', () => {
  it('covers every claim kind in the order constant', () => {
    const covered = new Set(PROSE_CLAIM_RULES.map((r) => r.claim))
    for (const claim of PROSE_CLAIM_ORDER) expect(covered.has(claim)).toBe(true)
    expect(covered.size).toBe(PROSE_CLAIM_ORDER.length)
  })

  it('documents every rule and never carries the global flag (which would hold state)', () => {
    for (const rule of PROSE_CLAIM_RULES) {
      expect(rule.describes.length).toBeGreaterThan(0)
      expect(rule.pattern.global).toBe(false)
      expect(rule.pattern.sticky).toBe(false)
    }
  })
})

// ── cleanProsePaths ───────────────────────────────────────────────────────────────────

const draft = (over: Partial<BusinessProfile> = {}): BusinessProfile => ({
  name: 'Alchemy Bodywork',
  type: 'business',
  ...over,
})

describe('cleanProsePaths', () => {
  it('returns only the prose paths that scan clean, in draft order', () => {
    const d = draft({
      tagline: 'Integrative bodywork for people who over-give in social situations.',
      about: 'Massages from $95. Call (555) 123-4567.',
      story:
        "Daniel Tyack works with people who feel stuck, using a technique called Emotional Alchemy to help them access and work through what's in the way.",
      offerings: [
        { title: 'Breathwork', blurb: 'Guided breathwork sessions, with everything you need provided.' },
        { title: 'Bodywork', blurb: 'Open Monday to Friday, 9am to 5pm.' },
      ],
    })
    expect(cleanProsePaths(d)).toEqual(['tagline', 'story', 'offerings[0].blurb'])
  })

  it('formats an offering blurb path exactly as reframe stamps it', () => {
    const d = draft({
      offerings: [
        { title: 'One', blurb: 'A quiet hour of bodywork.' },
        { title: 'Two', blurb: 'Sessions are $95.' },
        { title: 'Three', blurb: 'Breathwork in a small group.' },
      ],
    })
    expect(cleanProsePaths(d)).toEqual([offeringBlurbPath(0), offeringBlurbPath(2)])
    expect(offeringBlurbPath(2)).toBe('offerings[2].blurb')
  })

  it('skips absent, empty, and whitespace-only prose', () => {
    const d = draft({
      tagline: '',
      story: '   ',
      offerings: [{ title: 'No blurb' }, { title: 'Blank blurb', blurb: '  ' }],
    })
    expect(cleanProsePaths(d)).toEqual([])
  })

  it('returns nothing for a draft with no prose at all', () => {
    expect(cleanProsePaths(draft())).toEqual([])
  })

  it('returns nothing when every prose field carries a claim', () => {
    const d = draft({
      tagline: 'The best studio in Austin.',
      about: 'Clinically proven to cure anxiety.',
      story: 'Open Monday to Friday, 9am to 5pm.',
      offerings: [{ title: 'Session', blurb: 'From $95 per session.' }],
    })
    expect(cleanProsePaths(d)).toEqual([])
  })

  it('never mutates the draft it is given', () => {
    const d = draft({
      tagline: 'Bodywork for people who over-give.',
      about: 'Massages from $95.',
      offerings: [{ title: 'Session', blurb: 'A quiet hour.' }],
    })
    const before = structuredClone(d)
    cleanProsePaths(d)
    expect(d).toEqual(before)
  })
})
