// SEO pillar (Labs track): "tools for community builders", "best tools to build a
// community", "community building software". Answer-first toolkit page. Speaks to
// the Latent Leader / builder assembling the stack (CONTENT-VOICE §2b), not the
// Seeker. Relational register, no health claims. Single-pillar Labs.
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import {
  PhotoHero,
  Section,
  Lead,
  Body,
  PullQuote,
  ZigZag,
  Statement,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, faqSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'Tools for community builders'
const DESCRIPTION =
  'The tools a community builder actually needs: a way in for new people, a place to gather, a shared feed, and recognition that brings folks back. Here is the toolkit, and how Frequency Labs covers it in one place.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the Article schema.
const HERO_IMAGE = '/images/site/group-of-friends.jpg'
const GATHER_IMAGE = '/images/site/breathwork-circle.jpg'
const STACK_IMAGE = '/images/site/community-1.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/tools-for-community-builders' },
    openGraph: {
      title: 'Tools for community builders · Frequency',
      description:
        'Membership, gatherings, a shared feed, and recognition: the four tools every community builder needs, and how Frequency Labs covers them in one place.',
      url: '/tools-for-community-builders',
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// Answer-first FAQ: relational register only, no health claims. Each answer fully
// resolves the question in its first sentence or two. Fed into the FAQPage schema
// below verbatim.
const FAQ = [
  {
    q: 'What tools do community builders need?',
    a: 'Four things: a way in so new people can find and join you, a place to gather on a rhythm, a shared feed so the group stays connected between meetings, and a bit of recognition so people feel seen and come back. Everything else is optional. Nail those four and you have the working parts of a real community.',
  },
  {
    q: 'Do I need separate apps for events, chat, and members?',
    a: 'No, and stitching four apps together is how most community builders burn out. A calendar tool, a chat app, a spreadsheet of members, and a payment link that none of them talk to means you spend your energy on plumbing instead of people. One place that handles membership, gatherings, the feed, and recognition together is far easier to actually keep running.',
  },
  {
    q: 'What is the best tool to build a community?',
    a: 'The best tool is the one that covers the four jobs, a way in, a place to gather, a shared feed, and recognition, without making you the glue between five other apps. Frequency Labs bundles them into a Space: a front door in Discover, Circles and Runs to gather, Channels and Dispatch for the feed, and Zaps and Gems for recognition, all in one place.',
  },
  {
    q: 'How do I get new people to find my community?',
    a: 'You need a public front door: a page people can actually land on when they search for what you do. A private group chat has no way in for a stranger. On Frequency your Space gets a page in Discover and sorts under the Channels you list, so the neighbors who care about the same thing can find their way to your room.',
  },
  {
    q: 'What keeps members coming back?',
    a: 'A steady rhythm and a little recognition. People return to a group where the time never moves and where showing up gets noticed. A shared feed keeps the room warm between meetings, and light recognition, a streak, a marker for the regulars, tells people they belong here without turning it into a leaderboard grind.',
  },
  {
    q: 'Do I need to be technical to use community-building tools?',
    a: 'No. Good community tools are built for a host, not an engineer. If you can set a time, send a message, and welcome someone new, you can run the software. The point of a toolkit like Frequency is to take the technical weight off you, so the job stays about the people in the room.',
  },
]

export default function ToolsForCommunityBuildersPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/tools-for-community-builders',
            published: '2026-07-02',
            updated: '2026-07-02',
            image: [HERO_IMAGE, GATHER_IMAGE, STACK_IMAGE],
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'Tools for community builders', path: '/tools-for-community-builders' },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A group of friends standing close together outdoors, laughing"
        focal="object-center"
        eyebrow="The toolkit"
        title="Tools for community builders"
        subtitle="A way in, a place to gather, a shared feed, and a little recognition. Four jobs, one stack. Here is what a community builder actually needs, and how to stop stitching five apps together."
      >
        <Button href="/spaces">
          Get the toolkit <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          A community builder needs four tools: a way in so new people can find you,
          a place to gather on a rhythm, a shared feed so the group stays connected
          between meetings, and a bit of recognition so people feel seen and come
          back.
        </Lead>
        <Body>
          That is the whole list. Most builders end up with a chat app, a calendar,
          a spreadsheet of members, and a payment link that none of them talk to,
          then spend their energy being the glue. This page walks the four jobs and
          shows how one Space covers them, so your time goes to the people, not the
          plumbing.
        </Body>
      </Section>

      <PullQuote tone="surface">
        Four apps that do not talk to each other{' '}
        <span className="text-primary">is how good communities die tired.</span>
      </PullQuote>

      {/* One concept per section. Question H2 in the reader's words, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          A way in: how do new people find you?
        </h2>
        <Lead>
          You need a public front door, a page a stranger can land on when they
          search for what you do. A private group chat has no way in.
        </Lead>
        <Body>
          This is the tool most communities skip, and it is why they stall at the
          same twelve people. On Frequency your community runs as a Space with a page
          in Discover, sorted under the Channels you list, so the neighbors who care
          about the same thing can actually find their way to your room. A front door
          plus a clear rhythm turns a closed circle into a place people can join.
        </Body>
      </Section>

      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          A place to gather: what holds the group together?
        </h2>
        <Lead>
          A standing gathering on a rhythm, not a string of one-off events. The room
          is the product, and it needs a format so it lasts past week three.
        </Lead>
        <Body>
          Events tools are good at a single night and bad at the thing that actually
          builds community, which is the same people meeting again and again. On
          Frequency you host Circles that walk a Journey together as a Run, so a group
          keeps a shared thread week after week instead of starting cold each time.
          The format comes with it, so you are not inventing the night from scratch.
        </Body>
      </Section>

      {/* Illustrated beat: the shared feed, with a real gathering photo. */}
      <ZigZag
        img={GATHER_IMAGE}
        alt="A circle of friends sitting together outdoors for a shared practice"
        eyebrow="A shared feed"
        title="Keep the room warm between meetings."
        imgAspect="landscape"
        tone="surface"
      >
        <p>
          A community is not only the hour you are in the room. It is the days in
          between, and those need somewhere to live. Channels give your people topics
          to gather around, and Dispatch lets you send an update or a reminder that
          lands with everyone at once.
        </p>
        <p>
          The point is not more notifications. It is that the group stays connected
          between gatherings, so nobody has to wonder whether it is still happening.
          A warm feed between meetings is what makes the next meeting easy to say yes
          to.
        </p>
      </ZigZag>

      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Recognition: what brings people back?
        </h2>
        <Lead>
          A little recognition, given honestly. People return to a group where
          showing up gets noticed, without it turning into a leaderboard grind.
        </Lead>
        <Body>
          On Frequency, real-world participation earns Zaps, and online activity
          earns Gems, so the people who keep showing up and pitching in get seen for
          it. The regulars can step up along a real path, from Member to Crew to Host
          to Guide, so recognition is not a gold star, it is a way to share the room.
          None of it uses guilt or fake streaks. It just tells people they belong
          here.
        </Body>
      </Section>

      <Statement tone="surface">
        You do not need five apps.{' '}
        <span className="text-primary">You need four jobs, done in one place.</span>
      </Statement>

      {/* Hand off to the product: the stack, in one Space. */}
      <ZigZag
        img={STACK_IMAGE}
        alt="A small group gathered on a sunlit lawn, settled into easy conversation"
        eyebrow="How Frequency helps"
        title="The whole stack, in one Space."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'The operator playbook', href: '/how-to-run-a-community-space' }}
      >
        <p>
          Frequency Labs bundles the four jobs into a Space so you stop being the glue
          between apps. The front door lives in Discover, the gathering runs as
          Circles and Runs, the feed runs on Channels and Dispatch, and the
          recognition runs on Zaps and Gems. One place, one login, one room.
        </p>
        <p>
          You keep your voice and your practice. The toolkit carries the parts that
          usually trip a builder up, so a community you are holding together by hand
          today can run on rails tomorrow.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors: get the toolkit, or see the venue. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          The fastest way to get the toolkit is to claim a Space: your front door,
          your Circles, your feed, and your recognition in one place, free to start.
          If you want to see where the Labs toolkit is headed as a physical third
          space, tour The Lab. Both are the same idea at different sizes.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/spaces">
            Get the toolkit <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/the-lab" variant="secondary">
            Tour The Lab
          </Button>
        </div>
      </Section>

      {/* FAQ: answer-first pairs, mirrored into the FAQPage schema above. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-7">
          Common questions
        </h2>
        <FaqList items={FAQ} />
      </Section>

      <BetaCTA
        heading="Stop being the glue between five apps."
        body="Frequency Labs puts the front door, the gatherings, the feed, and the recognition in one Space. Join the Beta and get the toolkit."
      />
    </>
  )
}
