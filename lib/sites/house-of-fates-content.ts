// HOUSE OF FATES: THE CATALOGUE. PURE data from the design handoff (data/site.json), so the site pages, the booking
// seed and the tests share one source. The words are Toni Pitruzzello's own, from houseoffates.co. Sample event dates
// and sample letters from the design are NOT here: the site reads the Space's real events, and the letter archive
// waits for her real issues. Photos are served from /sites/house-of-fates/.

export const HOF_IMG = '/sites/house-of-fates'

interface HofOption { id: string; name: string; meta: string; price: number; text?: string }
interface HofSession { id: string; numeral: string; title: string; label: string; sigil: string; image: string; body: string; pull: string; note: string; options: HofOption[] }
export const HOF_SESSIONS: HofSession[] = [
  {
    id: 'reiki',
    numeral: 'I',
    title: 'Reiki',
    label: '1:1 Reiki Sessions',
    sigil: 'moon-full',
    image: 'reiki.jpg',
    body: 'Reiki channels universal life energy to release blockages, ease stress, and promote deep relaxation. It’s a nurturing experience designed to realign your energy flow, helping you feel more centered, calm, and connected to your true self. Whether you’re seeking relief from physical discomfort, emotional healing, or simply a moment of peace, Reiki provides a powerful space for renewal and self-discovery.',
    pull: 'Reiki is a gentle, energy-healing practice that restore balance and harmony within your body, mind, and spirit.',
    note: '',
    options: [
      {
        id: 'reiki30',
        name: '30 minute session',
        meta: '30 minutes',
        price: 60,
      },
      {
        id: 'reiki60',
        name: '60 minute session',
        meta: '60 minutes',
        price: 100,
      },
    ],
  },
  {
    id: 'hypnosis',
    numeral: 'II',
    title: 'Hypnosis',
    label: '1:1 Hypnosis Sessions',
    sigil: 'mercury',
    image: 'reflection.jpg',
    body: 'Hypnosis is a therapeutic technique that uses deep relaxation and focused attention to access the subconscious mind helping you shift negative patterns, reduce stress, and overcome limiting beliefs. This calm, receptive state, empowers you to rewrite old programming, conditioning, thoughts and behaviors. Unlock your mind’s potential for healing and profound, lasting transformation.',
    pull: 'Whether you’re looking to manage anxiety, release bad habits, attract clients, or gain clarity, Hypnosis offers a safe, effective path to deep personal change.',
    note: 'Hypnosis is only available as a package',
    options: [
      {
        id: 'hyp3',
        name: '3 Sessions',
        meta: '60 minutes each',
        price: 550,
        text: 'Tailored specifically to your unique needs. This package helps address deeply-rooted patterns and guide you towards your goals.',
      },
      {
        id: 'hyp5',
        name: '5 Sessions',
        meta: '60 minutes each',
        price: 900,
        text: 'A deeper journey designed to bring lasting transformation. Each session is curated to support you in healing emotional blocks and reprogramming limiting beliefs.',
      },
    ],
  },
  {
    id: 'hypnoreiki',
    numeral: 'III',
    title: 'HypnoReiki',
    label: '1:1 HypnoReiki Sessions',
    sigil: 'saturn',
    image: 'path-logo.jpg',
    body: 'This powerful blend of Hypnosis and Reiki offers a holistic approach that aligns both mind and body. In this combined session, the subconscious mind is accessed through the Hypnotherapeutic process, to shift limiting beliefs and release emotional patterns, while Reiki is channeled and works simultaneously to ground and balance your energy. This dual approach not only addresses the root causes of imbalance but also provides immediate relief and a sense of calm.',
    pull: 'Whether you seek to heal, grow, or gain clarity, HypnoReiki accelerates your journey, helping you transform from the inside out.',
    note: 'HypnoReiki is only available as a package',
    options: [
      {
        id: 'hr3',
        name: '3 Sessions',
        meta: '75 minutes each',
        price: 675,
        text: 'Our most powerful offering, HypnoReiki combines the science-backed effectiveness of hypnosis with the transformative energy of Reiki. This unique blend amplifies healing, creating deep shifts and lasting realignment that guide you seamlessly toward your goals.',
      },
      {
        id: 'hr5',
        name: '5 Sessions',
        meta: '75 minutes each',
        price: 1100,
        text: 'An immersive experience tailored to uncover and heal deep emotional blocks. Each session is curated to elevate your alignment, creating deep shifts and lasting change.',
      },
    ],
  },
]

interface HofRecording { id: string; title: string; price: number; glyph: string; blurb: string; points: string[] }
export const HOF_RECORDINGS: HofRecording[] = [
  {
    id: 'intuition',
    title: 'Intuition Connection',
    price: 25,
    glyph: 'eye',
    blurb: 'Unlock the power of your inner knowing with this guided hypnosis session. Strengthen your intuitive abilities, trust your gut feelings, and receive clearer guidance from your higher self.',
    points: [
      'Deepen your connection to your intuition',
      'Release doubt and second-guessing',
      'Strengthen your divine guidance',
      'Gain confidence in your inner wisdom',
    ],
  },
  {
    id: 'judgement',
    title: 'Releasing Self Judgement',
    price: 40,
    glyph: 'feather',
    blurb: 'Silence your inner critic and step into self-acceptance. This powerful hypnosis session helps you release self-judgment, embrace self-love, and free yourself from limiting beliefs.',
    points: [
      'Quiet negative self-talk',
      'Cultivate self-compassion and inner peace',
      'Let go of past mistakes and self-doubt',
      'Feel more confident and empowered',
    ],
  },
  {
    id: 'abundance',
    title: 'Create Abundance',
    price: 40,
    glyph: 'star',
    blurb: 'Shift your mindset and open the doors to prosperity. This session rewires your subconscious to align with abundance, allowing you to attract wealth and opportunities effortlessly.',
    points: [
      'Clear subconscious blocks around money',
      'Reprogram limiting beliefs about abundance',
      'Align with the energy of prosperity',
      'Feel worthy of financial and personal success',
    ],
  },
  {
    id: 'sleep',
    title: 'Better Sleep',
    price: 25,
    glyph: 'moon-quarter',
    blurb: 'Drift into deep, restorative sleep with this calming hypnosis session. Let go of stress, quiet your mind, and wake up feeling refreshed and recharged.',
    points: [
      'Fall asleep faster and stay asleep longer',
      'Reduce nighttime anxiety and overthinking',
      'Experience deep, restful sleep naturally',
      'Wake up feeling rejuvenated and clear-headed',
    ],
  },
  {
    id: 'clients',
    title: 'Attract Aligned Clients',
    price: 25,
    glyph: 'mercury',
    blurb: 'Magnetize clients who truly resonate with your energy and offerings. This session shifts your frequency to attract business opportunities that feel aligned, abundant, and fulfilling.',
    points: [
      'Call in clients who value your work',
      'Align your energy with business success',
      'Release fear and scarcity around clients',
      'Feel confident in your offerings and pricing',
    ],
  },
  {
    id: 'upgrade',
    title: 'Self Upgrade',
    price: 25,
    glyph: 'fire',
    blurb: 'Step into the highest version of yourself with this powerful transformation session. Release outdated patterns and fully embody your next-level self.',
    points: [
      'Reprogram limiting beliefs holding you back',
      'Align with your highest potential',
      'Cultivate self-confidence and personal power',
      'Accelerate your growth and transformation',
    ],
  },
  {
    id: 'exercise',
    title: 'Releasing Resistance to Exercise',
    price: 25,
    glyph: 'moon-waxing',
    blurb: 'Transform your relationship with movement through this guided hypnosis session. Rewire subconscious blocks, soften inner resistance, and align with exercise as a nourishing, intuitive part of your life.',
    points: [
      'Feel more at ease in your body',
      'Release subconscious blocks around movement',
      'Shift from guilt or pressure into freedom and choice',
      'Reclaim exercise as an expression of vitality and self-trust',
    ],
  },
]

export const HOF_CUSTOM = {
  id: 'custom',
  title: 'Custom hypnosis recording',
  price: 55,
  meta: '20 minutes',
  body: 'HYPNOSIS opens the door to your subconscious mind to re-write neural pathways which empower you to break free from limiting beliefs and into new possibilities. Tell us more about what you’d like to see in yourself and your life. Toni will record a 20-minute Hypnosis audio - yours to keep forever!',
}

interface HofProgram { id: string; title: string; tag: [string, string]; image: string; price: number; addon: number; open: boolean; body: string[]; includes: { glyph: string; title: string; body: string }[] }
export const HOF_PROGRAMS: HofProgram[] = [
  {
    id: 'clients',
    title: 'Attracting Aligned Clients',
    tag: ['Magnetize success.', 'Align with abundance.'],
    image: 'spiral.jpg',
    price: 350,
    addon: 450,
    open: true,
    body: [
      'Master the art of attracting aligned clients and building true abundance. Over four weeks, you’ll step into a world of confidence and clarity, guided by Toni Pitruzzello, a Reiki Master Teacher and Clinical Hypnotist committed to your success.',
      'Each session is carefully crafted to help you embody your worth, overcome imposter syndrome, and magnetize the clients and opportunities that truly align with your goals. Using the transformative power of Hypnosis, you’ll reprogram your subconscious mind to unlock clarity, confidence, and unstoppable magnetism.',
    ],
    includes: [
      {
        glyph: 'video',
        title: 'Live Zoom sessions',
        body: 'Thursdays, 5:30–7pm, four weeks in a row.',
      },
      {
        glyph: 'book-open',
        title: 'Course workbook',
        body: 'Packed with journal prompts and integration practices to help you apply what you’ve learned and take actionable steps forward.',
      },
      {
        glyph: 'library',
        title: 'Exclusive resources',
        body: 'Handpicked books, podcasts, and tools to define your ideal client, build wealth, overcome imposter syndrome, and enhance your magnetism.',
      },
      {
        glyph: 'headphones',
        title: 'Bonus recording',
        body: 'Reprogram your mindset anytime, anywhere with this portable practice.',
      },
    ],
  },
  {
    id: 'clear',
    title: 'Better Sleep',
    tag: ['Unlock the', 'rest you deserve'],
    image: 'headphones.jpg',
    price: 350,
    addon: 0,
    open: true,
    body: [
      'Unlock the secrets to deep, restorative sleep. Each week, you’ll dive into a world of tranquility and healing, guided by Toni Pitruzzello, a Reiki Master Teacher and Clinical Hypnotist dedicated to your well-being.',
      'Each session is thoughtfully designed to help you unwind and prepare for a night of deep sleep. Harnessing the powerful science of Hypnosis, you’ll reprogram your subconscious mind to unlock more relaxation, fall asleep faster, and get better quality sleep throughout the night.',
    ],
    includes: [
      {
        glyph: 'video',
        title: 'Live Zoom sessions',
        body: 'Thursdays, 5:30–7pm, four weeks in a row.',
      },
      {
        glyph: 'book-open',
        title: 'Sleep hygiene workbook',
        body: 'Full of tangible tools to help prepare your mind, body and spirit for quality rest.',
      },
      {
        glyph: 'library',
        title: 'Recommended resources',
        body: 'Books, podcasts, playlist, meditations - for all things hypnosis, sleep science & more.',
      },
      {
        glyph: 'headphones',
        title: 'Bonus recording',
        body: 'One bonus 20-minute sleep hypnosis recording, yours to keep forever! The more you listen, the better it works.',
      },
    ],
  },
  {
    id: 'shadow',
    title: 'Shadow Work',
    tag: [
      'Break free from perceived limitations.',
      'Settle in to self-love and acceptance.',
    ],
    image: 'reflection.jpg',
    price: 350,
    addon: 0,
    open: false,
    body: [
      'This 4-week program guides clients through the exploration of their unconscious mind, helping you uncover and integrate hidden aspects of yourself. This is your key to unlock subconscious patterns and regulate your emotions.',
      'Each session is thoughtfully designed to safely guide you into your inner world, wounds and shadow spaces. Allowing you to unmask your hidden blocks, regulate your emotions and fundamentally heal your nervous system. Allow me to safely guide you into your shadow.',
    ],
    includes: [
      {
        glyph: 'video',
        title: 'Live Zoom sessions',
        body: 'Thursdays, 5:30–7pm. Dates to be announced.',
      },
      {
        glyph: 'book-open',
        title: 'Shadow work workbook',
        body: 'Filled with practical tools to help you navigate your inner world, fostering mind, body, and spiritual alignment.',
      },
      {
        glyph: 'library',
        title: 'Recommended resources',
        body: 'Books, podcasts, playlist, meditations - for all things hypnosis & more.',
      },
      {
        glyph: 'headphones',
        title: 'Bonus recording',
        body: 'One bonus 20-minute hypnosis recording, yours to keep forever! The more you listen, the better it works.',
      },
    ],
  },
]

export const HOF_FAQS: { q: string; a: string }[] = [
  {
    q: 'Are sessions in person or virtual?',
    a: 'Both. Choose between in-person or virtual sessions, seamlessly integrated into your lifestyle.',
  },
  {
    q: 'Can I book a single hypnosis session?',
    a: 'Hypnosis and HypnoReiki are only available as packages of three or five sessions. Reiki can be booked as a single 30 or 60 minute session.',
  },
  {
    q: 'What is HypnoReiki?',
    a: 'Toni’s method, blending the wisdom of Reiki with the science of Hypnosis. The subconscious is accessed through hypnosis while Reiki grounds and balances your energy.',
  },
  {
    q: 'Do you offer payment plans?',
    a: 'For group programs, yes. Email us about payment plans.',
  },
]

/** The booking service types the design sets (minutes, price in dollars). The first session of each package is what a visitor books. */
export const HOF_SERVICE_TYPES = [
  {
    id: 'consult',
    name: 'Free consultation',
    minutes: 20,
    price: 0,
    sigil: 'moon-new',
    blurb: 'A short first conversation about what you would like to change. In person or virtual.',
    policy: 'Free. Reschedule any time.',
  },
  {
    id: 'reiki30',
    name: 'Reiki · 30 minutes',
    minutes: 30,
    price: 60,
    sigil: 'moon-full',
    blurb: 'A gentle energy-healing session to ease stress and restore balance.',
    policy: 'Free changes up to 24 hours before.',
  },
  {
    id: 'reiki60',
    name: 'Reiki · 60 minutes',
    minutes: 60,
    price: 100,
    sigil: 'moon-full',
    blurb: 'A full hour of Reiki for deeper relaxation and renewal.',
    policy: 'Free changes up to 24 hours before.',
  },
  {
    id: 'hyp3',
    name: 'Hypnosis · 3 sessions',
    minutes: 60,
    price: 550,
    sigil: 'mercury',
    blurb: 'Book your first session now. The other two are scheduled together after it.',
    policy: 'Package paid in full. Free changes up to 24 hours before each session.',
  },
  {
    id: 'hyp5',
    name: 'Hypnosis · 5 sessions',
    minutes: 60,
    price: 900,
    sigil: 'mercury',
    blurb: 'Book your first session now. The rest are scheduled together after it.',
    policy: 'Package paid in full. Free changes up to 24 hours before each session.',
  },
  {
    id: 'hr3',
    name: 'HypnoReiki · 3 sessions',
    minutes: 75,
    price: 675,
    sigil: 'saturn',
    blurb: 'Hypnosis and Reiki in one 75-minute session, three times.',
    policy: 'Package paid in full. Free changes up to 24 hours before each session.',
  },
  {
    id: 'hr5',
    name: 'HypnoReiki · 5 sessions',
    minutes: 75,
    price: 1100,
    sigil: 'saturn',
    blurb: 'Hypnosis and Reiki in one 75-minute session, five times.',
    policy: 'Package paid in full. Free changes up to 24 hours before each session.',
  },
] as const
