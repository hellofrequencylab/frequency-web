// The Business of Community 101, as e-learning data: a self-paced Journey, the first course of Creator Lab, by Daniel Tyack.
//
// Content source (the owner's course spec, 2026-11-17/18), adapted, never extended:
//   - business-of-community-101.md           the session spec (eight beats, story structure, leadership model, chunks,
//                                            practice, commitment, artifacts, field assignment, build beat, certificate, 102)
//   - business-of-community.md               the argument ("Frequency, the how-often kind"; return frequency is the metric)
//   - business-of-community-101-overview.md  strategy and rulings (always free and evergreen; the build beat is SHOWN in the
//                                            free course and DONE inside a Space; Certified lives inside a Space and needs
//                                            the four builds plus the capstone; every free lesson ends in an if-then)
//
// Data only: no database writes here. A seed script imports BOC_101 and writes it into the Journey tree.
// Sessions 2, 3 and 4 have no written story yet (spec "OPEN" item 1): their story lessons say so plainly and pose the
// spec's own reflection prompts. No prices or plan names appear anywhere: "a paid Space" only, per the overview's rule.
//
// VOICE. docs/CONTENT-VOICE.md 5b-5e: sentence case, contractions, no em dashes, no exclamation points, no surface
// jargon. Product nouns per docs/NAMING.md: Space, Circle, Event, Journey.

type Lesson = { title: string; body: string; minutes: number; type?: 'lesson' | 'reading' | 'exercise' | 'reflection' | 'resource' }
type Module = { title: string; body: string; lessons: Lesson[] }
export interface SeedJourney {
  key: string
  slug: string
  title: string
  summary: string
  intro: string
  category: string
  difficulty: 'gentle' | 'standard'
  tags: string[]
  dailyMinutes: number
  sequential: boolean
  cover: string
  modules: Module[]
}

/** Paragraphs joined by a blank line. A paragraph may hold '- ' bullet lines joined by '\n'. */
const b = (...paras: string[]): string => paras.join('\n\n')
const list = (...items: string[]): string => items.map((i) => `- ${i}`).join('\n')

const NOT_ADVICE =
  "This is general information, not legal or tax advice. Rules differ by place. Check with your city, your insurer and a professional before you rely on any of it."

const COMMIT_CLOSE =
  "Write it down. Then say it out loud to one person: a friend, your accountability partner, anyone who'll remember. A plan you've only thought about is easy to drop. One you've said to someone is harder to."

// ── Page copy ────────────────────────────────────────────────────────────────────────────────────
export const BOC_SUMMARY =
  "A free four-week course that teaches you to run your community like it's going to last, built on one question: how many people came back?"

export const BOC_SESSIONS = [
  {
    n: 1,
    name: 'The Engine',
    idea: "Structure isn't the opposite of soul. It's what keeps the soul from burning out.",
    question: 'What am I willing to carry, every month, for a year?',
    build: 'Create your Space, pick a starter preset, publish your first Event, see it on your calendar.',
    playbook: 'Space in an hour',
    leaveWith: 'A live Space and one Event.',
  },
  {
    n: 2,
    name: 'The Container',
    idea: "A container isn't what you believe. It's what you've written down, said out loud, and will enforce.",
    question: 'Who is this space for, and what am I protecting?',
    build:
      'Wall settings and pinned agreements, member roles, a second person on the team, reports and bans.',
    playbook: 'Who decides, who receives',
    leaveWith: 'Agreements live and one other person holding a role.',
  },
  {
    n: 3,
    name: 'The Gathering',
    idea: "Whatever authority you don't hold, the loudest guest will.",
    question: 'What is this gathering for, that someone could disagree with?',
    build: 'Free RSVP or ticket tiers, event questions, a co-host, check-in at the door, then who came back.',
    playbook: 'Run one Event end to end',
    leaveWith: 'One Event run and your first return number.',
  },
  {
    n: 4,
    name: 'The Exchange',
    idea: 'Charging is what makes your presence renewable.',
    question: 'What does it cost me to keep showing up?',
    build:
      'Memberships, donations, your shop, ticket shares with another Space, and your contacts imported so the list is yours.',
    playbook: 'Price it, publish it, own the list',
    leaveWith: 'A published ladder, a live tier, and contacts imported.',
  },
] as const

const S = BOC_SESSIONS

// ── THE FOUR-WEEK SHAPE (2026-11-17, owner: "strip it down to 4 weeks, a massive simplification") ──────
// One phase per week, the same five lessons every week, so a learner always knows where they are:
//   1. The idea      the one idea, the one question, the story (stopped at the decision)
//   2. The tools     the session's four tools, one short paragraph each
//   3. Practice      the one thing you say or do out loud
//   4. Build it      the same practice on Frequency, inside your own Space
//   5. Commit        one if-then, the one-page sheet, and what to do before next week
// "Start here" lives in the Journey intro; the capstone, Certified and what's next close Week 4.

const buildLesson = (s: (typeof BOC_SESSIONS)[number], steps: string[], note?: string): Lesson => ({
  title: 'Build it on Frequency',
  type: 'exercise',
  minutes: 15,
  body: b(
    'The same practice, done inside your own Space.',
    list(...steps),
    ...(note ? [note] : []),
    `You leave with: ${s.leaveWith.charAt(0).toLowerCase()}${s.leaveWith.slice(1)} No Space yet? Do it on paper. It still counts as practice.`,
  ),
})

const week = (n: number, s: (typeof BOC_SESSIONS)[number], lessons: Lesson[]): Module => ({
  title: `Week ${n} · ${s.name}`,
  body: b(`The one idea: ${s.idea}`, `The one question: ${s.question}`),
  lessons,
})

// ── Week 1 · The Engine ──────────────────────────────────────────────────────────────────────────
const week1 = week(1, S[0], [
  {
    title: 'The idea: slow is smooth',
    type: 'reading',
    minutes: 6,
    body: b(
      "Every week runs the same way: an idea, four tools, a practice out loud, a build on Frequency, and one commitment. About an hour. Find someone to tell your commitments to. That's most of the magic.",
      "Now the story. Six weeks and a room. You also have the whole vision: weekly gatherings, a membership, workshops, a retreat by summer. Launching it all at once feels like momentum.",
      'Stop. Launch the whole vision, or one small thing you can repeat? Write your answer before you read on.',
      "Rushing doesn't remove steps. It moves them later, where they cost more. The agreement you didn't write and the price you didn't work out show up in month three, in front of people. One small thing you can repeat gets the steps done while they're cheap.",
      'There\'s a phrase for this, from Navy SEAL training: slow is smooth, smooth is fast.',
    ),
  },
  {
    title: 'The tools: charter, board, horizon, season',
    type: 'lesson',
    minutes: 10,
    body: b(
      "The Charter. One page: a purpose someone could disagree with, who it's for, the one offering, and what you won't do. That last line is what lets you say no to good ideas that aren't yours to carry.",
      'The Board. Every open piece of work somewhere you can see it. Three things active at once, no more. Sticky notes, a spreadsheet or an app: visible and capped is what matters.',
      "The Horizon. Fourteen days. If it isn't happening in the next two weeks, it goes to the parking lot. One weekly review, same time every week, keeps it honest.",
      "The Season. Thirteen weeks, three priorities, and one cool-down week on the calendar before it starts. Rest is scheduled, not earned. The person who burns out takes the whole gift with them.",
    ),
  },
  {
    title: 'Practice: say what you carry',
    type: 'exercise',
    minutes: 10,
    body: b(
      "Stand up and say every open loop out loud. The unanswered email, the half-promised event, the money thing you're avoiding. Say it to a friend who just listens, or record it on your phone.",
      'Then sort it. Three go on the board. Everything else goes to the parking lot: written down, not forgotten, not active.',
      "Notice what it's like to carry three things instead of everything.",
    ),
  },
  buildLesson(S[0], [
    'Create your Space from Start a Space',
    'Pick a starter preset in Manage, Mode. It only seeds a layout and wording; every tool stays on',
    'Publish your first Event from New event',
    'Open your Space calendar and see it there',
  ]),
  {
    title: 'Commit, and fill in your sheet',
    type: 'reflection',
    minutes: 10,
    body: b(
      'Write the whole sentence: "When [weekly review time] arrives, I will open the board and empty my head, even if nothing is due." Name the time and the place. "Sunday evening" is a wish. "Sunday at 7pm at the kitchen table" is a plan.',
      COMMIT_CLOSE,
      'Your one-page sheet:',
      list('Purpose (could someone disagree?):', "Who it's for:", 'The one offering:', "What we won't do:", 'Active (three max):', 'Weekly review time:', 'This season: three priorities and one cool-down week'),
      'Before next week: run one weekly review at the time you picked.',
    ),
  },
])

// ── Week 2 · The Container ───────────────────────────────────────────────────────────────────────
const week2 = week(2, S[1], [
  {
    title: 'The idea: test before the title',
    type: 'reading',
    minutes: 6,
    body: b(
      "Every room has a container, whether you built it or not. If you didn't, the habits of whoever is there build it for you.",
      'Daniel tells this week\'s story live in the workshop, and it lands here after the pilot. The point of it: character shows in what someone does when nobody is watching, and the test comes before the title.',
      'Until then, use your own. Write a few honest sentences on one of these, and stop at the moment of decision:',
      list(
        'A role you gave someone and regretted. What was the first sign?',
        "A boundary you didn't set. What was the night you paid for it?",
      ),
      "Then count the rules your gatherings run on that you've actually written down, said out loud, and would enforce. Keep the number.",
    ),
  },
  {
    title: 'The tools: agreements, ladder, decisions, roles',
    type: 'lesson',
    minutes: 10,
    body: b(
      'Agreements. Read aloud at every opening, not just posted. Confidentiality and its limits, speak from I, the right to pass, no fixing, consent for touch, and the practical ones: phones, shoes, clean-up. Add a welcome ritual for new people.',
      'The Ladder. Four steps, written before you need them, because you won\'t be calm when you do: a private word, limited participation, time away, out. Name one person who receives concerns, and when the concern is about you, it can\'t be you.',
      'Decisions. Anything that affects the group goes by consent: ask "any strong objection?", not "does everyone agree?" Everything else goes by advice: you decide after asking the people it affects.',
      'Roles. No title before unglamorous work. The people who should lead are the ones who come early to set up the room and stay to pick up the trash. Give roles a term, and keep one helper for every ten people.',
    ),
  },
  {
    title: 'Practice: the no',
    type: 'exercise',
    minutes: 10,
    body: b(
      "Pick one real boundary your room needs. Say it out loud three times, to a friend or your phone's camera, until it stops apologizing: no rising tone, no \"sorry, but\".",
      'Then receive one. Have your friend say a boundary to you, and answer with two words: "Got it."',
    ),
  },
  buildLesson(S[1], [
    'In Manage, Community wall, choose who can read the wall and who can post',
    'Post your agreements on the wall and pin them, so every member sees them first',
    'In Settings, Members, give one other person a role: Admin, Moderator or Editor',
    'Reports land in Community wall, where you can remove a post or ban a person. Agree who reads them',
  ], 'A free Space has one team seat, yours. A second team member comes with a paid Space.'),
  {
    title: 'Commit, and fill in your sheet',
    type: 'reflection',
    minutes: 10,
    body: b(
      'Write the whole sentence: "When someone crosses [line], I will [first step], within 24 hours." Name a line you can see. "Disrespect" is too vague. "Talks over someone who\'s sharing" isn\'t.',
      COMMIT_CLOSE,
      'Your one-page sheet:',
      list('Our agreements, as I read them aloud:', 'Step 1, a private word:', 'Step 2, limited participation:', 'Step 3, time away:', 'Step 4, out:', 'Who receives concerns:', 'Our welcome ritual:'),
      'Before next week: read your agreements aloud at your next gathering, all of them, before anything else starts.',
    ),
  },
])

// ── Week 3 · The Gathering ───────────────────────────────────────────────────────────────────────
const week3 = week(3, S[2], [
  {
    title: 'The idea: preparation buys presence',
    type: 'reading',
    minutes: 6,
    body: b(
      "Every gathering has someone in charge. If it isn't you, it's whoever is loudest.",
      "Daniel tells this week's story live in the workshop, and it lands here after the pilot. The point of it: what you prepare beforehand decides whether you're free in the room or trapped by it.",
      'Until then, use your own. Write a few honest sentences, and stop at the moment of decision:',
      list(
        'A gathering that came apart at a transition. Where were you standing?',
        'A night you had to choose between fixing the room and holding it.',
      ),
    ),
  },
  {
    title: 'The tools: purpose, arc, run of show, peak and close',
    type: 'lesson',
    minutes: 10,
    body: b(
      '"A sound bath" is a category. "A place where people who can\'t sleep learn one thing to do at 2am" is a purpose. Someone could disagree with it, and that\'s what makes it useful. Ask who it serves, and who dilutes it.',
      'The Arc. Arrive and engage, what came up, grounding. Coming down takes at least as long as going up. Announce the arc, name what\'s optional, never touch without asking, and make leaving cost nothing.',
      "The Run of Show. One page: clock, beat, owner. A beat with no owner is yours by default. Add three short checklists: one week out, doors, shutdown.",
      'Peak and close. People remember the best moment and the ending, so design those two on purpose. The next morning, take fifteen minutes: what was supposed to happen, what happened, why, and what you\'ll keep or change.',
    ),
  },
  {
    title: 'Practice: run the room',
    type: 'exercise',
    minutes: 10,
    body: b(
      'Stand up and walk your next gathering out loud, beat by beat, saying the words you\'ll actually say.',
      "Halfway through, get interrupted: a friend cuts in with a question or a late arrival, or a timer goes off. Handle it, then find your place on the run of show and carry on. That's what the page is for.",
    ),
  },
  buildLesson(S[2], [
    'On your Event, keep it a free RSVP, or set ticket tiers. Selling tickets needs a paid Space',
    'Add event questions, so you know who is coming before they arrive',
    'Invite a co-host from the Event',
    'Reminders go to everyone who RSVPs on their own. Make sure the Event says what to bring',
    'Check people in at the door from Settings, Check-in',
    "Afterwards, mark who came on the Event's manage page. Once one Event works, duplicate it for the next date",
  ]),
  {
    title: 'Commit, and fill in your sheet',
    type: 'reflection',
    minutes: 10,
    body: b(
      'Write the whole sentence: "At my next gathering, the peak is [X] and the close is [Y]." Be concrete. "Good energy at the end" isn\'t a close. "One word each, then I say the date of the next one" is.',
      COMMIT_CLOSE,
      'Your one-page sheet:',
      list('Purpose (could someone disagree?):', 'Who it serves, who dilutes it:', 'Run of show (clock, beat, owner):', 'One week out / doors / shutdown:', 'The peak:', 'The close:'),
      "Hosting at home? Homeowners' insurance usually excludes business activity, waivers only go so far, and selling food has its own rules. Ask your city and an insurer. " + NOT_ADVICE,
      'Before next week: run one gathering off your run of show, review it the next morning, and look at who came. Next time, look at who came back.',
    ),
  },
])

// ── Week 4 · The Exchange ────────────────────────────────────────────────────────────────────────
const week4 = week(4, S[3], [
  {
    title: 'The idea: charging keeps you here',
    type: 'reading',
    minutes: 6,
    body: b(
      "A full room, people genuinely moved, and not enough in the basket to cover the night. That isn't a generosity problem. It's a structure problem.",
      "Daniel tells this week's story live in the workshop, and it lands here after the pilot. The point of it: a generous act, a number said out loud, and the cost that was paid.",
      'Until then, write down what your last gathering cost: rent, supplies, food, gas. Then what came in. Don\'t round in your favor. You\'ll use both numbers in the next lesson.',
    ),
  },
  {
    title: 'The tools: break-even, ladder, base, loop',
    type: 'lesson',
    minutes: 10,
    body: b(
      'Break-even. Fixed costs ÷ (price − cost per head). A $425 night at $4 a head needs 14 people at $35, and 21 at $25. Ten dollars of kindness costs seven more people to find, invite and welcome, every time.',
      'The Ladder. Three published prices: supported, sustaining, solidarity. The middle one sits at or above break-even. Cap the supported spots by number, not by asking who deserves one. A donation basket needs three things beside it: the cost per head, a suggested amount, and where any extra goes.',
      'The Base. Memberships cover the rent; events are upside. $1,400 a month at $45 is 32 members. Keeping them is the work: get each new member to four visits in their first month.',
      "The Loop. Guest, member, helper, leader: each step is someone carrying a bit more. Growth comes from the people already inside, so keep your list of them yourself, not on a platform that can turn down your reach.",
    ),
  },
  {
    title: 'Practice: say your price',
    type: 'exercise',
    minutes: 10,
    body: b(
      'Say your price out loud. No "it\'s only", no "but if that\'s too much", no rising tone at the end.',
      "Say it to a friend who answers with silence, and don't fill the silence. Repeat until it lands flat, the way you'd say the time.",
    ),
  },
  buildLesson(S[3], [
    'In Settings, Memberships, set one membership and what it includes. A free one works on any Space',
    'In Settings, Donations, turn on donations and write the ask: cost per head, a suggested amount, where any extra goes',
    'In Settings, Shop, list one thing you already make or sell',
    'In your Space CRM, import your contacts, so the list is yours. People keep control of their own email settings',
  ], 'Taking money and the CRM need a paid Space. On a free Space, set up the free parts now.'),
  {
    title: 'Commit, and finish your Community Book',
    type: 'reflection',
    minutes: 15,
    body: b(
      'Write the whole sentence: "My floor is $___. I won\'t go below it, and I\'ve told ___." Set the floor from your break-even.',
      COMMIT_CLOSE,
      'Your one-page sheet:',
      list('Fixed costs, cost per head, price:', 'Break-even and my floor:', 'Supported / sustaining / solidarity:', 'Members needed to cover the month:', 'How each new member gets to four visits:'),
      "Your four sheets plus a 13-week season plan are your Community Book. Finish all four weeks for Attended, 10 contact hours. Submit the Book and do the four builds in your own Space for Certified: a certificate of completion and competency, not an accredited certification. Review is free through January 31, 2027. After that it comes with a paid Space. Submissions stay open six weeks after Week 4.",
      "Starting out on your own? Keep a separate bank account from day one, and change how you're set up only when you need to. " + NOT_ADVICE,
      'What\'s next: Business Hours, the weekly room on Zoom for paid Spaces, where you bring one number and one stuck thing. And for Certified graduates, 102 when it opens.',
    ),
  },
])

// ── The Journey ──────────────────────────────────────────────────────────────────────────────────
export const BOC_101: SeedJourney = {
  key: 'boc-101',
  slug: 'the-business-of-community-101',
  title: 'The Business of Community 101',
  summary: BOC_SUMMARY,
  intro: b(
    "Frequency. Not the sound kind. The how-often kind. The question that decides whether a community lives isn't how many people came. It's how many came back.",
    'Four weeks: The Engine, The Container, The Gathering, The Exchange. Each week is five short lessons, about an hour, and ends with one commitment you say out loud. By the end you know what a gathering costs you, what you charge, who came back, and who to text next week.',
    'Free, by Daniel Tyack. It works on a spreadsheet and a phone. The build steps happen inside a Space.',
  ),
  category: 'Creator Lab',
  difficulty: 'standard',
  tags: ['creator lab', 'hosting', 'community business', 'pricing', 'gatherings', 'leadership', 'return frequency'],
  dailyMinutes: 10,
  sequential: true,
  cover: '/brand/frequency/photos/gathering-03.jpg',
  modules: [week1, week2, week3, week4],
}
