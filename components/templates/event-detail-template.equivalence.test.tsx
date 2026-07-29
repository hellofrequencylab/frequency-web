import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DetailTemplate } from './detail-template'
import { EventDetailTemplate } from './event-detail-template'

// THE BYTE-IDENTITY PROOF for the event layout extraction (owner directive 2026-07-28: "make this
// block layout the standard for All events").
//
// The photographed page — app/(main)/events/[slug]/page.tsx — used to hand-roll its own frame around
// DetailTemplate. That frame moved into EventDetailTemplate. The claim this file pins is that the
// move changed NOTHING about what the page renders: same wrapper, same props on DetailTemplate, same
// subtitle stack in the same order, same children in the same order, same bottom bar.
//
// Rendering the real page needs auth, Supabase and a browser, none of which exist in the test env.
// So the equivalence is proven at the JSX level, where it is actually decidable: `Reference` below is
// a VERBATIM copy of the JSX skeleton the page had at f92f1ae (every leaf replaced by a sentinel, so
// the comparison is of STRUCTURE, not content), and `Subject` is the same sentinels fed through the
// template. A single changed wrapper, class, or ordering fails the equality.
//
// 🔴 DO NOT EDIT `Reference` TO MAKE A FAILURE PASS. It is the "before". If it and `Subject` disagree,
// the template is wrong, not the reference. Changing the standard is a deliberate act: update the
// template, update `Reference`, and say so in the PR.

// PageAdminBar is a client component (usePathname + usePageAdmin) with no router in the node test
// env. It is stubbed identically for BOTH sides of the equality, so it cannot mask a difference.
vi.mock('@/components/layout/page-admin-bar', () => ({
  PageAdminBar: () => <hr data-stub="page-admin-bar" />,
}))

/** A sentinel leaf. Identity is carried in the attribute, so a swapped slot is a diff. */
const S = ({ id }: { id: string }) => <i data-slot={id} />

// ── The "before": the page's own JSX skeleton at f92f1ae, leaves replaced by sentinels. ──────────
function Reference() {
  return (
    <div className="pb-24 lg:pb-0">
      <S id="structuredData" />
      <S id="notice-cancelled" />
      <S id="notice-claimed" />

      <DetailTemplate
        hero={<S id="cover" />}
        titleScale="display"
        title={<S id="title" />}
        actions={<S id="actions" />}
        badges={<S id="badges" />}
        subtitle={
          <div className="space-y-1.5">
            <S id="when" />
            <S id="where" />
            <S id="cadence" />
            <S id="nextDate" />
            <S id="seriesRail" />
            <S id="belonging" />
            <S id="hostedBy" />
            <S id="credit" />
            <S id="reward" />
          </div>
        }
      >
        <S id="bodyLead" />
        <S id="gallery" />
        <S id="interior" />
      </DetailTemplate>

      <S id="actionBar" />
    </div>
  )
}

// ── The "after": the same sentinels, composed through the standard. ──────────────────────────────
function Subject() {
  return (
    <EventDetailTemplate
      structuredData={<S id="structuredData" />}
      notices={
        <>
          <S id="notice-cancelled" />
          <S id="notice-claimed" />
        </>
      }
      cover={<S id="cover" />}
      title={<S id="title" />}
      actions={<S id="actions" />}
      badges={<S id="badges" />}
      identity={{
        when: <S id="when" />,
        where: <S id="where" />,
        cadence: <S id="cadence" />,
        nextDate: <S id="nextDate" />,
        seriesRail: <S id="seriesRail" />,
        belonging: <S id="belonging" />,
        hostedBy: <S id="hostedBy" />,
        credit: <S id="credit" />,
        reward: <S id="reward" />,
      }}
      bodyLead={<S id="bodyLead" />}
      gallery={<S id="gallery" />}
      interior={<S id="interior" />}
      actionBar={<S id="actionBar" />}
    />
  )
}

describe('EventDetailTemplate renders the photographed event page byte-identically', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    const html = renderToStaticMarkup(<Reference />)
    expect(html.length).toBeGreaterThan(400)
    // Every slot actually reached the output, so the equality below is comparing a full page.
    for (const id of ['cover', 'title', 'badges', 'actions', 'when', 'reward', 'interior', 'actionBar']) {
      expect(html).toContain(`data-slot="${id}"`)
    }
  })

  it('produces the same markup as the page produced before the extraction', () => {
    expect(renderToStaticMarkup(<Subject />)).toBe(renderToStaticMarkup(<Reference />))
  })

  it('keeps the identity lines in the standard order, whatever order the caller writes them in', () => {
    const html = renderToStaticMarkup(<Subject />)
    const order = ['when', 'where', 'cadence', 'nextDate', 'seriesRail', 'belonging', 'hostedBy', 'credit', 'reward']
    const positions = order.map((id) => html.indexOf(`data-slot="${id}"`))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(positions.every((p) => p > -1)).toBe(true)
  })
})

describe('a surface differs by an ABSENT SLOT, never a fork', () => {
  it('drops the mobile bar reservation when there is no action bar (the public twin)', () => {
    const html = renderToStaticMarkup(
      <EventDetailTemplate hasActionBar={false} title={<S id="title" />} interiorMain={<S id="main" />} />,
    )
    expect(html).not.toContain('pb-24')
    expect(html).toContain('data-slot="title"')
  })

  it('renders no operator action column and no bottom bar when those slots are omitted', () => {
    const html = renderToStaticMarkup(<EventDetailTemplate title={<S id="title" />} />)
    expect(html).not.toContain('data-slot="actions"')
    expect(html).not.toContain('data-slot="actionBar"')
    // No identity lines supplied -> no empty subtitle container carrying the subtitle margin.
    expect(html).not.toContain('space-y-1.5')
  })

  it('gives a module-less surface the SAME interior geometry as the module engine', () => {
    const html = renderToStaticMarkup(
      <EventDetailTemplate title={<S id="title" />} interiorMain={<S id="main" />} interiorSide={<S id="side" />} />,
    )
    expect(html).toContain('grid gap-6 lg:grid-cols-5 lg:gap-8')
    expect(html).toContain('@container space-y-4 lg:col-span-3')
    expect(html).toContain('@container order-first space-y-4 lg:order-none lg:col-span-2')
    // Side stacks ABOVE main on a phone, exactly as the module engine's main-side does.
    expect(html.indexOf('data-slot="main"')).toBeLessThan(html.indexOf('data-slot="side"'))
  })

  it('prefers an explicit `interior` (the module engine) over the main/side pair', () => {
    const html = renderToStaticMarkup(
      <EventDetailTemplate title={<S id="title" />} interior={<S id="modules" />} interiorMain={<S id="main" />} />,
    )
    expect(html).toContain('data-slot="modules"')
    expect(html).not.toContain('data-slot="main"')
  })
})
