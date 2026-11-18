// The Business of Community 101: the workbook Journey behind Frequency's live business workshop, by Daniel Tyack.
//
// NOT A SELF-PACED COURSE (owner 2026-11-17: "Remove the self paced course. This is just the workshop run periodically
// and the Business Hours cohort"). The offer is a free four-week LIVE workshop on Zoom, run several times a year (the first is
// the January 2027 launch cohort), plus Business Hours, a weekly members-only cohort for Spaces on the Business plan.
// This Journey is the workshop's workbook: each week is an overview and a lesson to read before the live session, and
// homework to do after it.
//
// THE SHAPE (owner rework 2026-11-17: "zoom out, meeting models that follow PULSE, make sense for beginners").
// The workshop teaches four meetings a beginner can run with their own people. Every one of them follows PULSE, the
// five-beat rhythm every Frequency gathering uses (scripts/seed-frequency-hosts.mts, PULSE): Presence, Unite, Lead,
// Settle, Exhale. The LIVE SESSION runs on PULSE too (LIVE_SESSION below). The workbook does not: owner 2026-11-17,
// "Why do we have 5 lessons a week? Each week should have an overview, lesson and homework."
//
//   Overview   before Thursday: the idea, the story, what you'll leave with, and what to bring
//   Lesson     before Thursday: the meeting beat by beat, a worked example, and how to stay steady in it
//   Homework   after Thursday: one commitment, run the meeting, fill in your page, report back in the cohort Circle
//
// Targets this shape is built to (cohort course practice, checked 2026-11-17): 90-minute live sessions over 4 to 6
// weeks; about 3 to 4 hours a week in all (Maven's "medium" intensity is about 4); short pre-work so live time goes to
// practice, not lecture; one light deliverable a week (the page); a public commitment at the end of each session and
// a check-in on it at the start of the next (the report backs); replays plus a catch-up window for people who miss a
// week (Certified review stays open to February 28). Live sessions use small-group check-ins so a big cohort still
// feels like a circle.
//
// One tool a week, not four. One running example (Maya, a sound healer starting a monthly sound bath) so a beginner
// sees the same small community grow. One number all the way through: how many came back.
//
// TWO WAYS IN (owner ruling 2026-11-17). The live workshop (four 90-minute sessions on Zoom, run on PULSE, several times a year)
// is free for anyone. Business Hours (a weekly hour on PULSE, a members-only Circle) is for Spaces on the Business plan.
// Certified review is free for Community Books submitted by February 28, 2027, then comes with the Business plan.
//
// STORIES. Week 1 carries the two stories the owner named (Navy SEAL "slow is smooth", Bob Taylor's two-week rule).
// Weeks 2 to 4: the owner tells a story live in the workshop and will add it here. Each STORY slot below is marked; until
// then the Presence lesson stands on its own (the idea plus a prompt from the learner's own life). Never ship an IOU.
//
// Data only: no database writes here. scripts/seed-frequency-hosts.mts imports BOC_101 and writes the Journey tree.
//
// VOICE. docs/CONTENT-VOICE.md: sentence case, contractions, no em dashes, no exclamation points. Plain words for
// beginners. No benchmarks without a source. Product nouns per docs/NAMING.md: Space, Circle, Event, Journey.

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
  /** A live schedule (scripts/seed-frequency-hosts.mts SeedJourney). */
  meeting?: { format: 'online' | 'in_person'; schedule: string; eventSlug?: string }
  certificate?: boolean
  /** Guides by profile handle, in order. */
  guides?: string[]
}

/** Paragraphs joined by a blank line. A paragraph may hold '- ' bullet lines joined by '\n'. */
const b = (...paras: string[]): string => paras.join('\n\n')
const list = (...items: string[]): string => items.map((i) => `- ${i}`).join('\n')

const NOT_ADVICE =
  'This is general information, not legal or tax advice. Rules differ by place. Check with your city, your insurer and a professional before you rely on any of it.'

const SAY_IT =
  "Write it down. Then say it out loud to one person who'll remember: a friend, a partner, someone from the workshop. A plan you've said to someone is a lot harder to drop."

// ── The facts every surface shares ────────────────────────────────────────────────────────────────
export const BOC_SUMMARY =
  "Frequency's free four-week live workshop for anyone who gathers people. Four simple meetings on the PULSE rhythm, and one question: how many came back?"

/** The four weeks: the meeting each one teaches, and its one idea. Sales pages read these. */
export const BOC_WEEKS = [
  {
    n: 1,
    name: 'The Engine',
    meeting: 'The weekly sit-down',
    length: '30 minutes, once a week',
    idea: 'Small and steady beats big and burned out.',
    leaveWith: 'A weekly 30-minute meeting with yourself that keeps you from carrying everything at once.',
  },
  {
    n: 2,
    name: 'The Container',
    meeting: 'The opening',
    length: 'the first 30 minutes of any gathering',
    idea: 'People relax when they know what will happen.',
    leaveWith: 'An opening you can run every time: your purpose in one line, three agreements read aloud, and a check-in round.',
  },
  {
    n: 3,
    name: 'The Gathering',
    meeting: 'The full gathering',
    length: '90 minutes, plus ten the next day',
    idea: 'A plan on paper frees you to be present in the room.',
    leaveWith: 'A one-page run sheet for a 90-minute gathering, and a ten-minute habit the next day to see who came back.',
  },
  {
    n: 4,
    name: 'The Exchange',
    meeting: 'The money hour',
    length: '45 minutes, once a month',
    idea: 'Charging is what lets you keep showing up.',
    leaveWith: 'Your break-even number, one price you can say without flinching, and a monthly hour to keep both honest.',
  },
] as const

/** The questions, shared by the Journey page (page_config story) and both sales pages. */
export const BOC_FAQ: { q: string; a: string }[] = [
  {
    q: 'What does it cost?',
    a: 'Nothing. The workshop is free for anyone. Certified review is free for Community Books submitted by February 28, 2027, then comes with the Business plan.',
  },
  {
    q: 'When is the next workshop?',
    a: 'The launch Run meets Thursdays, 10 to 11:30 AM Pacific, on Zoom: January 7, 14, 21 and 28, 2027, the month Frequency launches. Anyone can join. Save your seat on the Week 1 event and the Zoom link comes to you. New Runs start through the year.',
  },
  {
    q: 'How much time does it take?',
    a: 'About three hours a week. Before Thursday, 15 minutes: a short overview and one lesson. Thursday, 90 minutes live. After, your homework: run that week’s meeting once with your own people and post a three-line report back.',
  },
  {
    q: 'I haven’t started anything yet. Is it for me?',
    a: 'Yes. It assumes you’re starting from scratch. If you run something already, you’ll fix the parts that wear you out.',
  },
  {
    q: 'What is PULSE?',
    a: 'The five-beat rhythm every Frequency gathering follows: Presence, Unite, Lead, Settle, Exhale. Every meeting in this workshop runs on it, and so does each session.',
  },
  {
    q: 'Do I need a Space?',
    a: 'No. Everything works on paper and a phone. If you have a Space, each week ends with an optional step to set it up there.',
  },
  {
    q: 'What is Business Hours?',
    a: 'A weekly hour on Zoom for Spaces on the Business plan, Wednesday mornings at 10 AM Pacific, run on PULSE in a members-only Circle. Bring one number and one stuck thing.',
  },
  {
    q: 'Is it accredited?',
    a: 'No. Certified is a certificate of completion and competency from Frequency, not an accredited certification.',
  },
]

/** What a learner leaves with, for the Journey page's outcomes list. */
export const BOC_OUTCOMES = [
  'Run a 30-minute weekly sit-down, so you stop carrying everything at once',
  'Open any gathering with your purpose, three agreements and a check-in round',
  'Run a 90-minute gathering off one page, and see who came back the next day',
  'Know your break-even, and say your price without flinching',
]

const W = BOC_WEEKS

const week = (w: (typeof BOC_WEEKS)[number], lessons: Lesson[]): Module => ({
  title: `Week ${w.n} · ${w.name}`,
  body: b(`This week's meeting: ${w.meeting.toLowerCase()} (${w.length}).`, `The one idea: ${w.idea}`),
  lessons,
})

/** The optional last step of every week. Short, and never the point. */
const inYourSpace = (...steps: string[]) => b('Optional, if you have a Space on Frequency:', list(...steps))

/** The close of every homework. The report backs are next Thursday's check-in round. */
const REPORT_BACK =
  "Report back in your Run's Circle before next Thursday. Three lines: what happened, your number (how many came back), and one thing you're stuck on. Next session starts from these."

/** What a week asks of you, said once in Week 1's overview and in the FAQ. */
const HOW_A_WEEK_WORKS = list(
  'Before Thursday, about 15 minutes: read the overview and the lesson.',
  'Thursday, 90 minutes live on Zoom: learn the meeting together and practice it.',
  'After, your homework: run the meeting once with your own people, fill in your page, and report back.',
)

const LIVE_SESSION = list(
  'Presence: the idea, and a story that carries it.',
  'Unite: check-ins in small groups, starting from your report backs.',
  "Lead: the week's meeting, beat by beat, and a short practice run.",
  'Settle: what the meeting stirs up in you, and how to stay steady with it.',
  'Exhale: your one commitment for the week, said out loud.',
)

// ── Week 1 · The Engine · the weekly sit-down ─────────────────────────────────────────────────────
const week1 = week(W[0], [
  {
    title: 'Overview · Slow is smooth',
    type: 'reading',
    minutes: 6,
    body: b(
      'Welcome to the workshop. Every week has the same three parts:',
      HOW_A_WEEK_WORKS,
      'All in, that’s about three hours a week, and most of it is doing the thing with your own people. Each live session runs on PULSE, the five beats every Frequency gathering uses:',
      LIVE_SESSION,
      "Here's where most people start. You've got a room for a night, a few friends who said they'd come, and a whole vision: a weekly gathering, a membership, workshops, a retreat by summer. Launching all of it at once feels like momentum.",
      "Navy SEALs train by a phrase: slow is smooth, smooth is fast. Rush, and you fumble. Fumbling is slower than doing it right the first time. A community is the same. The agreement you didn't write and the price you didn't work out still show up later, in front of people, when they cost more.",
      'Bob Taylor, who co-founded Taylor Guitars and has been a mentor of mine for years, gave me the other half: if it isn’t happening in the next two weeks, don’t worry about it. Write it down and let it wait.',
      `This week's meeting is the weekly sit-down: ${W[0].length}, with yourself. You'll leave with ${W[0].leaveWith.charAt(0).toLowerCase()}${W[0].leaveWith.slice(1)}`,
      'Bring to Thursday:',
      list(
        'Every open loop in your head about your community, one line each: the text you owe, the room you need to book, the idea you keep circling.',
        'The names of the people who came to your last gathering. No gathering yet? Five people you’d invite. This list starts the only number this workshop cares about: how many came back.',
      ),
    ),
  },
  {
    title: 'Lesson · The weekly sit-down',
    type: 'lesson',
    minutes: 10,
    body: b(
      'Your first meeting is with yourself. Thirty minutes, same time every week. If you have a helper, invite them. It runs on PULSE like everything else:',
      list(
        'Presence, 3 minutes. Phone face down. Three slow breaths. Read your purpose line out loud, if you have one.',
        'Unite, 5 minutes. Look back at the week. Who came? Who came back? Who did you mean to reach and didn’t?',
        'Lead, 15 minutes. Your two-week list. Only what happens in the next fourteen days goes on it, and only three things are active at once. Everything else goes on a parking list: written down, not forgotten, not now.',
        'Settle, 4 minutes. Sit with the list. Notice what still feels heavy, and choose one thing to set down this week.',
        'Exhale, 3 minutes. Say your three things out loud. Close the notebook.',
      ),
      "Here's Maya, a sound healer starting a monthly sound bath in a borrowed yoga room. Her head held twenty-two things. After her first sit-down, three were active: confirm the room for the 14th, text eight people, buy tea. The retreat idea went on the parking list. It's still there. It's fine there.",
      'Staying steady. Overwhelm usually shows up in the body before it shows up in the plan: the chest, the jaw, the shoulders. It’s the body saying the plan is bigger than the week. When you feel it, put a hand there, breathe out longer than you breathe in, three times, and say "Not now" to one item. We’ll practice this together on Thursday.',
    ),
  },
  {
    title: 'Homework · Run your first sit-down',
    type: 'exercise',
    minutes: 10,
    body: b(
      'Finish this sentence: "Every ___ at ___, at ___, I sit down for 30 minutes, even if nothing is due." Name the day, the time and the place. "Sunday" is a wish. "Sunday at 7pm at the kitchen table" is a plan.',
      SAY_IT,
      'Then run one sit-down at the time you picked, and fill in your page:',
      list('My purpose, in one line (we gather so that ___):', 'My sit-down time and place:', 'Active, three at most:', 'Parking list:', 'Who came last time:'),
      REPORT_BACK,
      inYourSpace('Add your next gathering as an Event, so it sits on your Space calendar.', 'Open your calendar during your sit-down instead of keeping it in your head.'),
    ),
  },
])

// ── Week 2 · The Container · the opening ──────────────────────────────────────────────────────────
// STORY SLOT (owner): the Overview below gets Daniel's Week 2 story when he writes it.
const week2 = week(W[1], [
  {
    title: 'Overview · Say it out loud',
    type: 'reading',
    minutes: 4,
    body: b(
      "Every room has rules. If you don't say them, the loudest person in the room makes them, and the quiet people stop coming back.",
      "This isn't about being strict. People relax when they know what will happen, when they're allowed to pass, and that what they share stays put. Saying it out loud at the start is how you give them that. It takes about two minutes.",
      `This week's meeting is the opening: ${W[1].length}. You'll leave with ${W[1].leaveWith.charAt(0).toLowerCase()}${W[1].leaveWith.slice(1)}`,
      'Bring to Thursday: a room where you felt at ease from the first minute. What did the person running it do before anything else started?',
    ),
  },
  {
    title: 'Lesson · The opening',
    type: 'lesson',
    minutes: 10,
    body: b(
      'The opening is the first 30 minutes of any gathering: the Presence and Unite beats of PULSE. Get these right and the rest of the gathering gets easier.',
      list(
        'Presence, 10 minutes. Start on time. Welcome people by name at the door. Once everyone’s in, say your purpose in one sentence: "We gather so that ___." Then a few breaths together.',
        'Unite, 20 minutes. Read your three agreements out loud. Then a check-in round: one question everyone can answer, one person at a time, while everyone else just listens.',
      ),
      'Three agreements to start with. Use these word for word until you have your own:',
      list(
        'Everything here is an invitation. Join in, go gently, or pass. No reason needed.',
        'What’s shared here stays here. Take the lessons home. Leave the stories.',
        'Speak for yourself, and no fixing. Listen without advising.',
      ),
      'A good first check-in question: "What\'s one word for how you\'re arriving tonight?"',
      'When someone crosses a line, keep it simple: a quiet, kind word afterwards, just the two of you. "Hey, tonight you jumped in while she was sharing. Next time, wait for your turn." Decide now who people can tell if something feels off, and say it in your opening.',
      'Maya read her three agreements at her first sound bath and felt silly for about ten seconds. Then a guest told her it was the first time she had relaxed all week.',
      'Staying steady. Saying a rule out loud can feel like a risk: what if they think I’m bossy? You may feel it in your throat, or as a rush to apologize. Feel your feet, breathe out first, then say the agreement slowly. Notice the urge to add "sorry" or "if that\'s okay," and let it pass. We’ll practice saying and receiving a boundary together on Thursday.',
    ),
  },
  {
    title: 'Homework · Run your opening',
    type: 'exercise',
    minutes: 10,
    body: b(
      'Finish this sentence: "At my next gathering, I\'ll read our three agreements out loud before anything else starts."',
      SAY_IT,
      'Then run the opening at your next gathering. No gathering this week? Run it out loud for a friend. Fill in your page:',
      list('My purpose, said out loud (we gather so that ___):', 'Our three agreements:', 'Our check-in question:', 'If something feels off, people can tell:', 'My number (who came back):'),
      REPORT_BACK,
      inYourSpace('Post your agreements on your Community wall and pin them, so new people see them first.'),
    ),
  },
])

// ── Week 3 · The Gathering · the full gathering ───────────────────────────────────────────────────
// STORY SLOT (owner): the Overview below gets Daniel's Week 3 story when he writes it.
const week3 = week(W[2], [
  {
    title: 'Overview · The plan holds you',
    type: 'reading',
    minutes: 4,
    body: b(
      "A lot of us worry that planning a gathering will kill the magic. It's the other way around. When the plan is on paper, you don't have to hold it in your head, and you can actually be with the people in front of you.",
      'Gatherings rarely fall apart in the middle. They wobble at the edges: a late start, a messy change from one part to the next, an ending that just fizzles out. A plan covers the edges.',
      `This week's meeting is the full gathering: ${W[2].length}. You'll leave with ${W[2].leaveWith.charAt(0).toLowerCase()}${W[2].leaveWith.slice(1)}`,
      'Bring to Thursday: the one moment in your gatherings that wobbles most, the start, the middle or the end, and what happens when it does.',
    ),
  },
  {
    title: 'Lesson · The full gathering',
    type: 'lesson',
    minutes: 12,
    body: b(
      'This is PULSE at full length, the 90-minute gathering. Whatever you lead, whether it’s sound, breath, movement, music, a craft or a conversation, it goes in the middle. The four beats around it keep the gathering personal and safe.',
      list(
        'Presence, 10 minutes. Your opening, part one: start on time, welcome, purpose, breath.',
        'Unite, 20 minutes. Your opening, part two: agreements and the check-in round.',
        'Lead, 35 minutes. Your offering. Clear steps, an invitation, and a way to opt out. Watch the room more than your notes.',
        'Settle, 15 minutes. Quiet time to take it in. Rest, journal or sit, before anyone has to talk.',
        'Exhale, 10 minutes. One word each, a thank you, and the date of the next one, said out loud. End on time.',
      ),
      'Write it on one page: a column for the time, one for the beat, and one for the words you’ll actually say. That’s your run sheet. If the gathering runs short, trim Lead. Never skip Exhale.',
      'Then the next-day ten. The morning after, take ten minutes: mark who came, compare it with last time, and text three people. Say thank you, give the next date, and, if they missed it, "We missed you."',
      'Maya’s second sound bath had eleven people. Six had come to the first one. Her number went from zero to six, and she texted the five who were new.',
      "Staying steady. People take their pace from you. If you're rushed, the room rushes. Before people arrive, take three minutes: feet on the floor, hand on your belly, a long exhale, your purpose line said once to yourself. When it wobbles: slow down, breathe out, look at your run sheet, and say the next line on the page.",
    ),
  },
  {
    title: 'Homework · Run one gathering off the page',
    type: 'exercise',
    minutes: 10,
    body: b(
      'Finish this sentence: "My next gathering is on ___. I\'ll run it off my run sheet, and the next morning I\'ll do my ten minutes."',
      SAY_IT,
      'Your page for the week is your run sheet: time, beat, and the words you’ll say, for all five beats. Add the three people you’ll text the next day. Then run the gathering and do the next-day ten.',
      "Hosting at home? Homeowners' insurance often doesn't cover business activity, and selling food has its own rules. " + NOT_ADVICE,
      REPORT_BACK,
      inYourSpace('Set up your gathering as an Event with RSVP, so you know who is coming.', 'Use check-in at the door, then mark who came on the Event, so your Space counts who came back for you.'),
    ),
  },
])

// ── Week 4 · The Exchange · the money hour ────────────────────────────────────────────────────────
// STORY SLOT (owner): the Overview below gets Daniel's Week 4 story when he writes it.
const week4 = week(W[3], [
  {
    title: 'Overview · Generous and paid',
    type: 'reading',
    minutes: 4,
    body: b(
      "A full room, people genuinely moved, and not enough in the basket to cover the gathering. It happens to almost everyone who gathers people from the heart. It isn't a generosity problem. It's a structure problem.",
      "If your gatherings cost you more than they give back, sooner or later you stop. Then nobody gets the gift. Charging isn't the opposite of generosity. It's what lets you keep showing up.",
      `This week's meeting is the money hour: ${W[3].length}. You'll leave with ${W[3].leaveWith.charAt(0).toLowerCase()}${W[3].leaveWith.slice(1)}`,
      'Bring to Thursday:',
      list(
        "What your last gathering cost: rent, supplies, snacks, gas. Then what came in. Don't round in your favor.",
        'On a scale of zero to ten, how easy it is for you to say your price out loud. Just notice the number.',
      ),
    ),
  },
  {
    title: 'Lesson · The money hour',
    type: 'lesson',
    minutes: 12,
    body: b(
      'Once a month, 45 minutes, on PULSE. Money gets easier when it has a regular time and isn’t a 2am worry.',
      list(
        'Presence, 5 minutes. Breathe. Open your numbers.',
        'Unite, 10 minutes. Last month: what came in, what went out, and your number. Who came back?',
        'Lead, 20 minutes. Find your break-even and set one price.',
        'Settle, 5 minutes. Sit with the number before you decide anything else.',
        'Exhale, 5 minutes. Say your price out loud, to someone.',
      ),
      'Break-even is how many people you need so the gathering pays for itself. Add up what the gathering costs. Then take what each person pays you, minus what each person costs you, and divide.',
      'Maya’s room is $120 and her supplies are $30, so the gathering costs $150. Tea and a handout cost $2 a person. At $25 a ticket, each person leaves her $23, and $150 ÷ $23 means she needs 7 people. At $15, she needs 12. Ten dollars off the price means finding five more people, every single time.',
      "Set your price at or above break-even. If you want to keep the door open to people with less, set aside a few pay-what-you-can spots and decide the number of them ahead of time. Don't decide person by person who deserves one.",
      'At your gathering, say it once, in Exhale: what it costs to keep this going, the price, and where to pay. Then stop talking.',
      'Staying steady. For most people who gather from the heart, money is where the body tightens most: the throat, the chest, a laugh at the end. Sit tall, and on the out-breath say the whole sentence: "It\'s $25, and that keeps this room going." No "only", no "but if that\'s too much." On Thursday you’ll say it to someone and let the silence sit.',
    ),
  },
  {
    title: 'Homework · Your money page, and your Community Book',
    type: 'exercise',
    minutes: 15,
    body: b(
      'Finish this sentence: "My price is $___. At my next gathering, I\'ll say it once, clearly, in the close."',
      SAY_IT,
      'Then run your first money hour and fill in your page:',
      list('What the gathering costs:', 'What each person costs me:', 'My break-even (people needed):', 'My price:', 'Pay-what-you-can spots, and how many:', 'My money hour (day and time each month):', 'My number (who came back):'),
      'Your four pages are your Community Book: your sit-down, your opening, your run sheet and your money page. Come to all four live sessions and you’ve Attended. Send in your Community Book, filled in from real gatherings, and Frequency reviews it for Certified: a certificate of completion and competency, not an accredited certification. Review is free for Community Books submitted by February 28, 2027, then comes with the Business plan. Missed a session? Watch the replay and do that week’s homework before you send it in.',
      "Starting out on your own? Keep a separate bank account from day one. " + NOT_ADVICE,
      'What comes next: keep running your four meetings. If your Space is on the Business plan, bring one number and one stuck thing to Business Hours, Wednesday mornings on Zoom.',
      inYourSpace('Turn on donations or memberships so people can pay you inside your Space.', 'Import your contacts, so the list of people who came back is yours.'),
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
    "Frequency. Not the sound kind. The how-often kind. A community lives on one question: not how many people came, but how many came back.",
    "This is the workbook for The Business of Community, Frequency's free four-week live workshop for anyone who gathers people. It assumes you're starting from scratch. Each week gives you one simple meeting you can run, on PULSE, the same rhythm every Frequency gathering uses: Presence, Unite, Lead, Settle, Exhale.",
    'The workshop meets live on Zoom, 90 minutes each Thursday, several times a year. Each week is an overview and a lesson to read before the session, and homework after it: run the meeting once with your own people and report back. The launch Run starts January 7, 2027.',
  ),
  category: 'Creator Lab',
  difficulty: 'gentle',
  tags: ['creator lab', 'core training', 'PULSE', 'hosting', 'community business', 'pricing', 'return frequency'],
  dailyMinutes: 10,
  sequential: true,
  cover: '/brand/frequency/photos/boc-circle-dusk.jpg',
  modules: [week1, week2, week3, week4],
  // A live workshop, not a self-paced course (owner 2026-11-17). The Journey page's meeting card says when it meets
  // and links the Week 1 session, where "Save your seat" RSVPs.
  meeting: {
    format: 'online',
    schedule: 'Live on Zoom, Thursdays January 7 to 28, 2027, 10 to 11:30 AM Pacific',
    eventSlug: 'business-of-community-pilot-session-1',
  },
  // certificate: decided with the Certified badge (see lib/journeys/certificate work), not by completion alone.
  // Both guides lead every session (sales page "Your guides"). Handles, resolved to profiles at seed time.
  guides: ['danieltyack', 'feargal'],
}

/** The Journey page's story widget (journey_plans.page_config, id 'story'): outcomes and the FAQ. */
export const BOC_PAGE_STORY = {
  id: 'story',
  enabled: true,
  settings: { outcomes: BOC_OUTCOMES, faq: BOC_FAQ.map((f) => ({ q: f.q, a: f.a })) },
}
