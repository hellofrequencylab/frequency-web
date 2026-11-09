// Services' sixteen trade kits (design system "Services", frequency/kits.services.json): one sample business per trade, in that trade's own
// words. DATA ONLY: services-variants.ts lays it out as pages. Kept apart so listing the kits (services-profile-index.ts) loads no copy.
// Sample prices, the sample review score and the sample quotes are NOT here: prices become `{{offerNPrice|...}}` slot tokens, trust lines with
// numbers become prompts, and reviews become prompts to ask a real client (docs/marketing/voice-and-language-guide.md).

type ServicesAccentName = 'tide' | 'signal' | 'bloom' | 'ember' | 'fern' | 'iris'
type Pair = readonly [string, string]
export interface ServicesTradeSpec {
  label: string
  accent: ServicesAccentName
  name: string
  descriptor: string
  tools: readonly ('book' | 'sell' | 'belong' | 'publish' | 'gather' | 'learn')[]
  cta: string
  hero: { eyebrow: string; title: string; em: string; body: string }
  offers: readonly { name: string; meta: string; price: string; length: string }[]
  trust: readonly string[]
  events: readonly Pair[]
  products: readonly Pair[]
  plans: readonly Pair[]
  posts: readonly Pair[]
  team: readonly Pair[]
  reviewsAbout: readonly string[]
}

export const SERVICES_TRADES = {
  general: {
    label: "General",
    accent: "tide",
    name: "Your Business",
    descriptor: "Service business",
    tools: [
      "book",
      "sell",
      "belong",
      "publish",
      "gather"
    ],
    cta: "Book a visit",
    hero: {
      eyebrow: "Booking now · Your City",
      title: "Good work,",
      em: "done right.",
      body: "Clear prices, on-time arrivals and work finished properly the first time. Book online in about a minute."
    },
    offers: [
      {
        name: "Consultation",
        meta: "A first visit to plan the work together",
        price: "Free",
        length: "30 min"
      },
      {
        name: "Signature service",
        meta: "Our most-booked service, start to finish",
        price: "From $120",
        length: "2 hr"
      },
      {
        name: "Ongoing care",
        meta: "Regular visits on a schedule you choose",
        price: "From $90 / mo",
        length: "Monthly"
      }
    ],
    trust: [
      "Licensed & insured",
      "4.9 from 120 reviews",
      "Same-week visits",
      "30-day guarantee"
    ],
    events: [
      [
        "Open house",
        "Meet the team, ask anything, see the work"
      ],
      [
        "Free clinic",
        "Bring a question, leave with a plan"
      ]
    ],
    products: [
      [
        "Care kit",
        "Everything for upkeep between visits"
      ],
      [
        "Gift card",
        "Any service, any amount"
      ],
      [
        "Starter bundle",
        "Two services, one price"
      ]
    ],
    plans: [
      [
        "Essential",
        "One visit a quarter and priority booking"
      ],
      [
        "Plus",
        "Monthly visits and a yearly deep service"
      ],
      [
        "Complete",
        "Everything in Plus and same-day help"
      ]
    ],
    posts: [
      [
        "Guide",
        "How to get the most from your first visit"
      ],
      [
        "Story",
        "A week on the job"
      ],
      [
        "Checklist",
        "Seasonal upkeep, month by month"
      ],
      [
        "Update",
        "New open times this season"
      ]
    ],
    team: [
      [
        "Alex Rivera",
        "Owner"
      ],
      [
        "Sam Lee",
        "Lead tech"
      ],
      [
        "Jordan Cruz",
        "Scheduling"
      ]
    ],
    reviewsAbout: [
      "Signature service",
      "Ongoing care",
      "Consultation"
    ]
  },
  home: {
    label: "Home services",
    accent: "signal",
    name: "Harbor Home Co.",
    descriptor: "Home repair & maintenance",
    tools: [
      "book",
      "belong",
      "publish"
    ],
    cta: "Book a repair",
    hero: {
      eyebrow: "Same-week repairs · Your City",
      title: "Fixed right,",
      em: "the first time.",
      body: "Repairs, installs and seasonal upkeep from a licensed local team. Upfront prices and a one-year workmanship warranty."
    },
    offers: [
      {
        name: "Handyman visit",
        meta: "Small repairs, mounting, fixtures and odd jobs",
        price: "From $95 / hr",
        length: "1 hr min"
      },
      {
        name: "Home tune-up",
        meta: "A full check of doors, drains, seals and filters",
        price: "From $180",
        length: "3 hr"
      },
      {
        name: "Care plan",
        meta: "Four tune-ups a year and priority booking",
        price: "From $40 / mo",
        length: "Yearly"
      }
    ],
    trust: [
      "Licensed & insured",
      "4.9 from 340 reviews",
      "Two-hour windows",
      "1-year warranty"
    ],
    events: [],
    products: [],
    plans: [
      [
        "Care plan",
        "Four tune-ups a year, priority booking"
      ],
      [
        "Care plan Plus",
        "Plus two handyman hours a quarter"
      ],
      [
        "Landlord",
        "Up to four properties, one bill"
      ]
    ],
    posts: [
      [
        "Guide",
        "Ten minutes a month that prevent most repairs"
      ],
      [
        "Checklist",
        "Fall shutdown for pipes and gutters"
      ],
      [
        "Story",
        "The leak nobody could find"
      ],
      [
        "Update",
        "Now serving Riverside"
      ]
    ],
    team: [
      [
        "Sam Ortega",
        "Owner · Lead tech"
      ],
      [
        "Mia Chen",
        "Technician"
      ],
      [
        "Dev Patel",
        "Technician"
      ],
      [
        "Ana Ruiz",
        "Dispatch"
      ]
    ],
    reviewsAbout: [
      "Handyman visit",
      "Home tune-up",
      "Care plan"
    ]
  },
  wellness: {
    label: "Wellness & care",
    accent: "bloom",
    name: "Still Studio",
    descriptor: "Massage & bodywork",
    tools: [
      "book",
      "belong",
      "sell",
      "publish",
      "gather"
    ],
    cta: "Book a session",
    hero: {
      eyebrow: "Open this week · Your City",
      title: "Slow down,",
      em: "feel better.",
      body: "Licensed massage and bodywork in a calm, private studio. Book online, arrive, and let the rest wait an hour."
    },
    offers: [
      {
        name: "Intro session",
        meta: "A first visit to find what works for you",
        price: "$65",
        length: "60 min"
      },
      {
        name: "Deep tissue",
        meta: "Focused work for tension and recovery",
        price: "From $120",
        length: "90 min"
      },
      {
        name: "Monthly membership",
        meta: "One session a month and member pricing",
        price: "From $99 / mo",
        length: "Monthly"
      }
    ],
    trust: [
      "Licensed therapists",
      "5.0 from 210 reviews",
      "Evenings & weekends",
      "Tailored sessions"
    ],
    events: [
      [
        "Breathwork circle",
        "A guided hour, all levels"
      ],
      [
        "Stretch & restore",
        "Saturday mornings in the studio"
      ]
    ],
    products: [
      [
        "Studio oil blend",
        "The one we use in session"
      ],
      [
        "Gift session",
        "Any 60-minute service"
      ],
      [
        "Heat wrap",
        "For between visits"
      ]
    ],
    plans: [
      [
        "Monthly",
        "One session a month, member pricing"
      ],
      [
        "Twice monthly",
        "Two sessions, bring a guest once"
      ],
      [
        "Weekly",
        "Four sessions, priority evenings"
      ]
    ],
    posts: [
      [
        "Guide",
        "What to do the day after deep tissue"
      ],
      [
        "Story",
        "Why the room is quiet"
      ],
      [
        "Practice",
        "A three-minute reset for your shoulders"
      ],
      [
        "Update",
        "New Saturday hours"
      ]
    ],
    team: [
      [
        "Maya Chen",
        "Founder · LMT"
      ],
      [
        "Theo Park",
        "LMT"
      ],
      [
        "Ines Lobo",
        "LMT · Prenatal"
      ]
    ],
    reviewsAbout: [
      "Monthly membership",
      "Deep tissue",
      "Intro session"
    ]
  },
  pro: {
    label: "Professional",
    accent: "iris",
    name: "Field & Pine",
    descriptor: "Bookkeeping & tax",
    tools: [
      "book",
      "belong",
      "publish",
      "gather"
    ],
    cta: "Book a call",
    hero: {
      eyebrow: "Taking new clients · Your City",
      title: "Clear books,",
      em: "calm decisions.",
      body: "Monthly bookkeeping, payroll and tax for small businesses. Fixed fees, a named accountant and answers within one business day."
    },
    offers: [
      {
        name: "Discovery call",
        meta: "A short call to see if we are a good fit",
        price: "Free",
        length: "20 min"
      },
      {
        name: "Monthly bookkeeping",
        meta: "Reconciled books and a monthly report",
        price: "From $350 / mo",
        length: "Monthly"
      },
      {
        name: "Tax season package",
        meta: "Business return, planning and filing",
        price: "From $900",
        length: "Yearly"
      }
    ],
    trust: [
      "Licensed CPAs",
      "4.9 from 85 reviews",
      "Replies in 1 day",
      "Fixed fees"
    ],
    events: [
      [
        "Quarterly tax briefing",
        "What changed and what to do about it"
      ],
      [
        "Owner office hours",
        "Bring one question, online"
      ]
    ],
    products: [],
    plans: [
      [
        "Books",
        "Monthly bookkeeping and report"
      ],
      [
        "Books + Payroll",
        "Plus payroll for up to ten people"
      ],
      [
        "Full desk",
        "Books, payroll, tax and planning"
      ]
    ],
    posts: [
      [
        "Guide",
        "Reading your monthly report in five minutes"
      ],
      [
        "Explainer",
        "Estimated taxes without the panic"
      ],
      [
        "Story",
        "What a clean year-end looks like"
      ],
      [
        "Update",
        "Deadlines for this quarter"
      ]
    ],
    team: [
      [
        "Jordan Pike",
        "Founder · CPA"
      ],
      [
        "Riley Osei",
        "CPA"
      ],
      [
        "Casey Nguyen",
        "Payroll"
      ]
    ],
    reviewsAbout: [
      "Monthly bookkeeping",
      "Tax season package",
      "Discovery call"
    ]
  },
  trades: {
    label: "Trades & repair",
    accent: "ember",
    name: "Northline Electric",
    descriptor: "Licensed electricians",
    tools: [
      "book",
      "publish"
    ],
    cta: "Book an electrician",
    hero: {
      eyebrow: "24-hour emergency line · Your City",
      title: "Safe power,",
      em: "done to code.",
      body: "Panels, EV chargers, lighting and repairs by licensed electricians. Flat-rate quotes before any work starts."
    },
    offers: [
      {
        name: "Service call",
        meta: "Diagnose and fix outlets, switches, breakers",
        price: "From $129",
        length: "1 hr"
      },
      {
        name: "EV charger install",
        meta: "Level 2 charger, permit and inspection",
        price: "From $1,100",
        length: "Half day"
      },
      {
        name: "Panel upgrade",
        meta: "200-amp panel, labeled and inspected",
        price: "From $2,400",
        length: "1 day"
      }
    ],
    trust: [
      "Licensed & bonded",
      "4.8 from 410 reviews",
      "24-hour emergency",
      "2-year warranty"
    ],
    events: [],
    products: [],
    plans: [],
    posts: [
      [
        "Safety",
        "Five signs your panel needs a look"
      ],
      [
        "Guide",
        "Choosing an EV charger for your home"
      ],
      [
        "Explainer",
        "Why permits protect you"
      ],
      [
        "Update",
        "Rebates available this year"
      ]
    ],
    team: [
      [
        "Luis Herrera",
        "Master electrician"
      ],
      [
        "Kai Brooks",
        "Journeyman"
      ],
      [
        "Noor Haddad",
        "Apprentice"
      ],
      [
        "Pat Doyle",
        "Office"
      ]
    ],
    reviewsAbout: [
      "EV charger install",
      "Service call",
      "Panel upgrade"
    ]
  },
  cleaning: {
    label: "Cleaning",
    accent: "fern",
    name: "Bright & Co.",
    descriptor: "Home & office cleaning",
    tools: [
      "book",
      "belong",
      "sell",
      "publish"
    ],
    cta: "Book a clean",
    hero: {
      eyebrow: "Weekly, biweekly or once · Your City",
      title: "Come home",
      em: "to clean.",
      body: "Trusted cleaners, the same team each visit and plant-safe products. Book a time and we handle the rest."
    },
    offers: [
      {
        name: "Standard clean",
        meta: "Kitchen, baths, floors, dusting and beds",
        price: "From $140",
        length: "2.5 hr"
      },
      {
        name: "Deep clean",
        meta: "Inside appliances, baseboards, windows and more",
        price: "From $260",
        length: "5 hr"
      },
      {
        name: "Move in / out",
        meta: "Empty-home clean to deposit standard",
        price: "From $320",
        length: "6 hr"
      }
    ],
    trust: [
      "Insured & bonded",
      "4.9 from 620 reviews",
      "Same team each visit",
      "Plant-safe products"
    ],
    events: [],
    products: [
      [
        "Refill kit",
        "Our plant-safe cleaners, concentrated"
      ],
      [
        "Gift clean",
        "A standard clean for someone you love"
      ],
      [
        "Linen service",
        "Fresh sheets and towels each visit"
      ]
    ],
    plans: [
      [
        "Biweekly",
        "A standard clean every two weeks"
      ],
      [
        "Weekly",
        "Every week, same team"
      ],
      [
        "Office",
        "Evenings, five days a week"
      ]
    ],
    posts: [
      [
        "Guide",
        "What to do before the cleaners come (not much)"
      ],
      [
        "Story",
        "Meet the team"
      ],
      [
        "Checklist",
        "Our standard clean, room by room"
      ],
      [
        "Update",
        "New plant-safe line"
      ]
    ],
    team: [
      [
        "Amara Diallo",
        "Owner"
      ],
      [
        "Rosa Alvarez",
        "Team lead"
      ],
      [
        "Minh Tran",
        "Team lead"
      ],
      [
        "Jade Okoro",
        "Scheduling"
      ]
    ],
    reviewsAbout: [
      "Standard clean",
      "Move in / out",
      "Deep clean"
    ]
  },
  beauty: {
    label: "Beauty & salon",
    accent: "bloom",
    name: "Hush Hair",
    descriptor: "Hair studio",
    tools: [
      "book",
      "sell",
      "belong",
      "publish",
      "gather"
    ],
    cta: "Book an appointment",
    hero: {
      eyebrow: "Now taking new clients · Your City",
      title: "Hair you",
      em: "stop thinking about.",
      body: "Cuts, color and care from a small team that listens first. Book online and pick your stylist."
    },
    offers: [
      {
        name: "Cut & style",
        meta: "Consultation, wash, cut and finish",
        price: "From $85",
        length: "60 min"
      },
      {
        name: "Color",
        meta: "Full color, balayage or gloss",
        price: "From $160",
        length: "2.5 hr"
      },
      {
        name: "Treatment",
        meta: "Bond repair or deep conditioning",
        price: "From $55",
        length: "30 min"
      }
    ],
    trust: [
      "Licensed stylists",
      "4.9 from 380 reviews",
      "Evenings & Sundays",
      "Low-tox color"
    ],
    events: [
      [
        "Styling night",
        "Learn to blow-dry your own cut"
      ],
      [
        "Color open house",
        "See swatches, ask questions, book"
      ]
    ],
    products: [
      [
        "Studio shampoo",
        "Sulfate-free, the one we use"
      ],
      [
        "Repair mask",
        "Weekly bond care"
      ],
      [
        "Gift card",
        "Any service or product"
      ]
    ],
    plans: [
      [
        "Gloss club",
        "A gloss every six weeks"
      ],
      [
        "Cut club",
        "A cut every eight weeks, 10% off products"
      ],
      [
        "Color club",
        "Root touch-up every six weeks"
      ]
    ],
    posts: [
      [
        "Guide",
        "How to make color last"
      ],
      [
        "Story",
        "Why we went low-tox"
      ],
      [
        "How-to",
        "The five-minute blow-dry"
      ],
      [
        "Update",
        "Sunday hours are back"
      ]
    ],
    team: [
      [
        "Noa Levi",
        "Owner · Stylist"
      ],
      [
        "Zoë Marsh",
        "Color specialist"
      ],
      [
        "Eli Santos",
        "Stylist"
      ],
      [
        "Remy Blake",
        "Front desk"
      ]
    ],
    reviewsAbout: [
      "Cut & style",
      "Color",
      "Cut & style"
    ]
  },
  fitness: {
    label: "Fitness & studio",
    accent: "ember",
    name: "Form Studio",
    descriptor: "Strength & mobility",
    tools: [
      "gather",
      "belong",
      "book",
      "sell",
      "publish"
    ],
    cta: "Book a free class",
    hero: {
      eyebrow: "First class free · Your City",
      title: "Stronger",
      em: "every week.",
      body: "Small-group strength and mobility classes, capped at eight. Coaches who know your name and your knees."
    },
    offers: [
      {
        name: "First class",
        meta: "Any class, meet the coaches",
        price: "Free",
        length: "50 min"
      },
      {
        name: "Personal training",
        meta: "One-to-one, programmed for you",
        price: "From $90",
        length: "60 min"
      },
      {
        name: "Movement assessment",
        meta: "Find what is tight and what is weak",
        price: "$60",
        length: "45 min"
      }
    ],
    trust: [
      "Certified coaches",
      "5.0 from 260 reviews",
      "Eight per class",
      "Pause any time"
    ],
    events: [
      [
        "Saturday strength",
        "Open class, all levels"
      ],
      [
        "Mobility workshop",
        "Hips and shoulders, 90 minutes"
      ],
      [
        "Community run",
        "Easy 5k and coffee"
      ]
    ],
    products: [
      [
        "Form tee",
        "Soft, heavy cotton"
      ],
      [
        "Band set",
        "Three resistances for home days"
      ],
      [
        "Shaker",
        "Steel, 700 ml"
      ]
    ],
    plans: [
      [
        "Two a week",
        "Eight classes a month"
      ],
      [
        "Unlimited",
        "Every class, every week"
      ],
      [
        "Unlimited + PT",
        "Plus two personal sessions"
      ]
    ],
    posts: [
      [
        "Program",
        "The eight-week beginner strength plan"
      ],
      [
        "Guide",
        "Eat enough to train"
      ],
      [
        "Story",
        "Carla at 52"
      ],
      [
        "Update",
        "New 6am class"
      ]
    ],
    team: [
      [
        "Dre Walker",
        "Head coach"
      ],
      [
        "Sol Kim",
        "Coach · Mobility"
      ],
      [
        "Beth Ayers",
        "Coach"
      ],
      [
        "Max Oduya",
        "Front desk"
      ]
    ],
    reviewsAbout: [
      "Membership",
      "Movement assessment",
      "Membership"
    ]
  },
  pets: {
    label: "Pet care",
    accent: "fern",
    name: "Good Dog Co.",
    descriptor: "Dog walking & grooming",
    tools: [
      "book",
      "belong",
      "sell",
      "publish"
    ],
    cta: "Book a walk",
    hero: {
      eyebrow: "Walks, grooming, daycare · Your City",
      title: "Happy dog,",
      em: "easy day.",
      body: "Daily walks, gentle grooming and daycare from people who love dogs more than phones. Book online, get photos after every visit."
    },
    offers: [
      {
        name: "Daily walk",
        meta: "30 minutes, photos and a note",
        price: "From $28",
        length: "30 min"
      },
      {
        name: "Full groom",
        meta: "Bath, cut, nails and ears",
        price: "From $85",
        length: "2 hr"
      },
      {
        name: "Daycare day",
        meta: "Play, rest and a walk",
        price: "$48",
        length: "Full day"
      }
    ],
    trust: [
      "Insured & certified",
      "5.0 from 540 reviews",
      "Photo after every visit",
      "Same walker"
    ],
    events: [],
    products: [
      [
        "Treat bag",
        "Single-ingredient, made here"
      ],
      [
        "Good Dog leash",
        "Climbing rope, brass clip"
      ],
      [
        "Grooming gift card",
        "Any groom"
      ]
    ],
    plans: [
      [
        "Three walks a week",
        "Same walker, same time"
      ],
      [
        "Daily walks",
        "Monday to Friday"
      ],
      [
        "Daycare pack",
        "Ten days, use any time"
      ]
    ],
    posts: [
      [
        "Guide",
        "Helping an anxious dog settle"
      ],
      [
        "Story",
        "A day with Biscuit"
      ],
      [
        "How-to",
        "Brushing between grooms"
      ],
      [
        "Update",
        "Daycare now open Saturdays"
      ]
    ],
    team: [
      [
        "Hollis Grant",
        "Owner"
      ],
      [
        "Pip Marlow",
        "Head groomer"
      ],
      [
        "Sunny Vale",
        "Walker"
      ],
      [
        "Lou Ferris",
        "Walker"
      ]
    ],
    reviewsAbout: [
      "Daily walk",
      "Full groom",
      "Daycare day"
    ]
  },
  tutoring: {
    label: "Tutoring & lessons",
    accent: "signal",
    name: "Bright Mind Tutors",
    descriptor: "Tutoring & test prep",
    tools: [
      "book",
      "learn",
      "belong",
      "publish",
      "gather"
    ],
    cta: "Book a free session",
    hero: {
      eyebrow: "Online and in person · Your City",
      title: "Learning that",
      em: "clicks.",
      body: "One-to-one tutoring and small-group courses in math, science, writing and test prep. Book a free first session and meet your tutor."
    },
    offers: [
      {
        name: "First session",
        meta: "Meet a tutor and set goals",
        price: "Free",
        length: "45 min"
      },
      {
        name: "One-to-one tutoring",
        meta: "Weekly sessions, any subject",
        price: "From $65",
        length: "60 min"
      },
      {
        name: "SAT prep course",
        meta: "Eight weeks, groups of six",
        price: "$640",
        length: "8 weeks"
      }
    ],
    trust: [
      "Screened tutors",
      "4.9 from 190 reviews",
      "One tutor all year",
      "Progress reports"
    ],
    events: [
      [
        "Parent info night",
        "How the year works, online"
      ],
      [
        "Free study hall",
        "Drop in, bring homework"
      ]
    ],
    products: [],
    plans: [
      [
        "Weekly",
        "One session a week"
      ],
      [
        "Twice weekly",
        "Two sessions, two subjects"
      ],
      [
        "Exam season",
        "Three sessions a week for six weeks"
      ]
    ],
    posts: [
      [
        "Guide",
        "How to study for a test you dread"
      ],
      [
        "Story",
        "From C to A-minus"
      ],
      [
        "Explainer",
        "What the new SAT changed"
      ],
      [
        "Update",
        "Summer courses open"
      ]
    ],
    team: [
      [
        "Priya Natarajan",
        "Founder"
      ],
      [
        "Amos Reid",
        "Math"
      ],
      [
        "Lina Brandt",
        "Writing"
      ],
      [
        "Tomás Vega",
        "Science"
      ]
    ],
    reviewsAbout: [
      "One-to-one tutoring",
      "SAT prep course",
      "One-to-one tutoring"
    ]
  },
  creative: {
    label: "Photography & creative",
    accent: "iris",
    name: "North Light Studio",
    descriptor: "Photography",
    tools: [
      "book",
      "sell",
      "publish",
      "gather"
    ],
    cta: "Book a session",
    hero: {
      eyebrow: "Booking this season · Your City",
      title: "Pictures you",
      em: "keep.",
      body: "Portraits, families and small brands, shot in natural light. Book a session and see a gallery within a week."
    },
    offers: [
      {
        name: "Portrait session",
        meta: "Studio or outdoors, 20 edited images",
        price: "From $350",
        length: "90 min"
      },
      {
        name: "Family session",
        meta: "Golden hour, 30 edited images",
        price: "From $450",
        length: "2 hr"
      },
      {
        name: "Brand shoot",
        meta: "Headshots, product and space, half day",
        price: "From $900",
        length: "Half day"
      }
    ],
    trust: [
      "12 years shooting",
      "5.0 from 140 reviews",
      "Gallery in 7 days",
      "You own the files"
    ],
    events: [
      [
        "Mini sessions",
        "Twenty minutes, five images, one afternoon"
      ],
      [
        "Studio open day",
        "See the space, meet June"
      ]
    ],
    products: [
      [
        "Fine art print",
        "16×20 on cotton rag"
      ],
      [
        "Linen album",
        "30 pages, lay-flat"
      ],
      [
        "Gift session",
        "A portrait session for someone"
      ]
    ],
    plans: [],
    posts: [
      [
        "Guide",
        "What to wear for family photos"
      ],
      [
        "Story",
        "Twelve years of window light"
      ],
      [
        "Behind",
        "A brand shoot, start to finish"
      ],
      [
        "Update",
        "Fall mini sessions"
      ]
    ],
    team: [
      [
        "June Albright",
        "Photographer"
      ],
      [
        "Oli Park",
        "Assistant · Retouch"
      ]
    ],
    reviewsAbout: [
      "Family session",
      "Brand shoot",
      "Portrait session"
    ]
  },
  legal: {
    label: "Legal / finance",
    accent: "iris",
    name: "Hart & Row",
    descriptor: "Family & estate law",
    tools: [
      "book",
      "publish",
      "gather"
    ],
    cta: "Book a consultation",
    hero: {
      eyebrow: "Taking new matters · Your City",
      title: "Plain advice,",
      em: "fixed fees.",
      body: "Wills, trusts, estates and family matters from a two-partner firm. Fixed fees quoted up front and a lawyer who returns calls."
    },
    offers: [
      {
        name: "Initial consultation",
        meta: "Thirty minutes to understand your matter",
        price: "$150",
        length: "30 min"
      },
      {
        name: "Will & powers of attorney",
        meta: "Drafted, explained and signed",
        price: "From $650",
        length: "Two meetings"
      },
      {
        name: "Living trust package",
        meta: "Trust, pour-over will and deeds",
        price: "From $2,400",
        length: "Three meetings"
      }
    ],
    trust: [
      "Licensed attorneys",
      "4.9 from 95 reviews",
      "Fixed fees",
      "Calls returned same day"
    ],
    events: [
      [
        "Estate planning 101",
        "A free evening talk at the library"
      ],
      [
        "Ask a lawyer",
        "Twenty-minute slots, first Saturday"
      ]
    ],
    products: [],
    plans: [],
    posts: [
      [
        "Explainer",
        "Will or trust: how to decide"
      ],
      [
        "Checklist",
        "What to bring to your first meeting"
      ],
      [
        "Story",
        "A plan that held"
      ],
      [
        "Update",
        "New fixed-fee packages"
      ]
    ],
    team: [
      [
        "Evelyn Hart",
        "Partner"
      ],
      [
        "Marcus Row",
        "Partner"
      ],
      [
        "Dee Castillo",
        "Paralegal"
      ]
    ],
    reviewsAbout: [
      "Living trust package",
      "Initial consultation",
      "Will & powers of attorney"
    ]
  },
  medical: {
    label: "Medical & dental",
    accent: "signal",
    name: "Elm Street Dental",
    descriptor: "Family dentistry",
    tools: [
      "book",
      "belong",
      "publish"
    ],
    cta: "Book an appointment",
    hero: {
      eyebrow: "New patients welcome · Your City",
      title: "Gentle care,",
      em: "clear costs.",
      body: "Check-ups, cleanings and treatment for the whole family. Prices shown before you book, and a team that explains everything."
    },
    offers: [
      {
        name: "Check-up & clean",
        meta: "Exam, x-rays as needed and a hygiene clean",
        price: "$140",
        length: "45 min"
      },
      {
        name: "Whitening",
        meta: "In-chair, with take-home trays",
        price: "$380",
        length: "75 min"
      },
      {
        name: "Same-day emergency",
        meta: "Pain, breaks and lost fillings",
        price: "From $120",
        length: "30 min"
      }
    ],
    trust: [
      "Licensed dentists",
      "4.9 from 720 reviews",
      "We run on time",
      "Prices up front"
    ],
    events: [],
    products: [],
    plans: [
      [
        "Care plan",
        "Two check-ups and cleans a year"
      ],
      [
        "Care plan Plus",
        "Plus x-rays and 15% off treatment"
      ],
      [
        "Family",
        "Up to four people"
      ]
    ],
    posts: [
      [
        "Guide",
        "Brushing right in two minutes"
      ],
      [
        "Explainer",
        "What a crown costs and why"
      ],
      [
        "Story",
        "Treating nervous patients"
      ],
      [
        "Update",
        "Saturday clinic hours"
      ]
    ],
    team: [
      [
        "Dr. Lena Okafor",
        "Dentist"
      ],
      [
        "Dr. Ben Castro",
        "Dentist"
      ],
      [
        "Ruth Abara",
        "Hygienist"
      ],
      [
        "Omar Said",
        "Front desk"
      ]
    ],
    reviewsAbout: [
      "Check-up & clean",
      "Same-day emergency",
      "Check-up & clean"
    ]
  },
  events: {
    label: "Events & catering",
    accent: "bloom",
    name: "Table & Field",
    descriptor: "Catering & events",
    tools: [
      "book",
      "gather",
      "sell",
      "publish"
    ],
    cta: "Book a tasting",
    hero: {
      eyebrow: "Booking this season · Your City",
      title: "Food people",
      em: "talk about.",
      body: "Seasonal menus for weddings, dinners and company events, cooked on site. Book a tasting and let us plan around you."
    },
    offers: [
      {
        name: "Tasting",
        meta: "Five courses, meet the chef, plan the menu",
        price: "$95 for two",
        length: "90 min"
      },
      {
        name: "Private dinner",
        meta: "Chef at your table, up to twelve",
        price: "From $120 / guest",
        length: "Evening"
      },
      {
        name: "Full event",
        meta: "Weddings and company events, staffed",
        price: "From $85 / guest",
        length: "Custom"
      }
    ],
    trust: [
      "Chef-led",
      "5.0 from 160 reviews",
      "Seasonal & local",
      "Licensed & insured"
    ],
    events: [
      [
        "Supper club",
        "A long table, one seasonal menu"
      ],
      [
        "Pasta workshop",
        "Make it, eat it, take the recipe home"
      ]
    ],
    products: [
      [
        "Pantry box",
        "Our oils, vinegars and salts"
      ],
      [
        "Supper club ticket",
        "One seat at the long table"
      ],
      [
        "Gift tasting",
        "A tasting for two"
      ]
    ],
    plans: [],
    posts: [
      [
        "Menu",
        "This month at the long table"
      ],
      [
        "Story",
        "The farm we buy from"
      ],
      [
        "Guide",
        "Planning a wedding menu"
      ],
      [
        "Update",
        "Holiday dates open"
      ]
    ],
    team: [
      [
        "Sofia Marini",
        "Chef · Owner"
      ],
      [
        "Leo Brandt",
        "Sous chef"
      ],
      [
        "Mina Kovač",
        "Events lead"
      ]
    ],
    reviewsAbout: [
      "Full event",
      "Tasting",
      "Private dinner"
    ]
  },
  auto: {
    label: "Automotive",
    accent: "ember",
    name: "Driveline Auto",
    descriptor: "Auto repair & service",
    tools: [
      "book",
      "belong",
      "publish"
    ],
    cta: "Book a service",
    hero: {
      eyebrow: "Same-day service · Your City",
      title: "Honest repairs,",
      em: "no surprises.",
      body: "Diagnostics, maintenance and repairs with photos of every finding and approval before any work. Book online, drop off, done."
    },
    offers: [
      {
        name: "Oil & inspection",
        meta: "Full synthetic, 40-point check with photos",
        price: "From $79",
        length: "45 min"
      },
      {
        name: "Diagnostics",
        meta: "Find the fault, credited to the repair",
        price: "$120",
        length: "1 hr"
      },
      {
        name: "Brakes",
        meta: "Pads, rotors and a road test",
        price: "From $320",
        length: "2 hr"
      }
    ],
    trust: [
      "ASE certified",
      "4.8 from 890 reviews",
      "Photos of every finding",
      "2-year warranty"
    ],
    events: [],
    products: [],
    plans: [
      [
        "Maintenance plan",
        "Three oil services a year and inspections"
      ],
      [
        "Plan Plus",
        "Plus tire rotation and brake checks"
      ],
      [
        "Fleet",
        "Up to five vehicles"
      ]
    ],
    posts: [
      [
        "Guide",
        "Noises and what they usually mean"
      ],
      [
        "Explainer",
        "Why we photograph everything"
      ],
      [
        "Checklist",
        "Before a road trip"
      ],
      [
        "Update",
        "EV service now available"
      ]
    ],
    team: [
      [
        "Carlos Mendes",
        "Owner · Master tech"
      ],
      [
        "Tia Holt",
        "Technician"
      ],
      [
        "Ray Osei",
        "Technician"
      ],
      [
        "Nina Park",
        "Service advisor"
      ]
    ],
    reviewsAbout: [
      "Brakes",
      "Diagnostics",
      "Oil & inspection"
    ]
  },
  landscaping: {
    label: "Landscaping",
    accent: "fern",
    name: "Evergreen Grounds",
    descriptor: "Landscaping & lawn care",
    tools: [
      "book",
      "belong",
      "publish",
      "gather"
    ],
    cta: "Book a walk-through",
    hero: {
      eyebrow: "Spring bookings open · Your City",
      title: "Outside,",
      em: "taken care of.",
      body: "Lawn care, planting and seasonal clean-ups from a crew that shows up on schedule. Upfront pricing and a free walk-through."
    },
    offers: [
      {
        name: "Weekly lawn care",
        meta: "Mow, edge, trim and blow",
        price: "From $45 / visit",
        length: "Weekly"
      },
      {
        name: "Seasonal clean-up",
        meta: "Beds, leaves, pruning and haul-away",
        price: "From $280",
        length: "Half day"
      },
      {
        name: "Planting & design",
        meta: "A plan, the plants and the install",
        price: "From $1,500",
        length: "Custom"
      }
    ],
    trust: [
      "Licensed & insured",
      "4.9 from 310 reviews",
      "Same day each week",
      "Native-first planting"
    ],
    events: [
      [
        "Native plant sale",
        "Spring weekend at the yard"
      ],
      [
        "Pruning workshop",
        "Bring your shears"
      ]
    ],
    products: [],
    plans: [
      [
        "Weekly care",
        "Mow, edge, trim, blow"
      ],
      [
        "Care + beds",
        "Plus weeding and mulch twice a year"
      ],
      [
        "Full grounds",
        "Everything, plus spring and fall clean-ups"
      ]
    ],
    posts: [
      [
        "Guide",
        "Watering less, growing more"
      ],
      [
        "Story",
        "Three years on Maple Street"
      ],
      [
        "Checklist",
        "Fall clean-up, step by step"
      ],
      [
        "Update",
        "Spring bookings open"
      ]
    ],
    team: [
      [
        "Owen Blake",
        "Owner"
      ],
      [
        "Rosa Ibarra",
        "Crew lead"
      ],
      [
        "Finn Doyle",
        "Crew lead"
      ],
      [
        "Yara Haddad",
        "Design"
      ]
    ],
    reviewsAbout: [
      "Weekly lawn care",
      "Planting & design",
      "Seasonal clean-up"
    ]
  }
} as const satisfies Record<string, ServicesTradeSpec>

export type ServicesTradeId = keyof typeof SERVICES_TRADES
export const SERVICES_TRADE_IDS = Object.keys(SERVICES_TRADES) as ServicesTradeId[]

const sentence = (x: string) => `${x[0].toUpperCase()}${x.slice(1)}`
/** The one-line description a kit and its library row share. */
export function servicesKitDescription(trade: ServicesTradeId): string {
  const spec: ServicesTradeSpec = SERVICES_TRADES[trade]
  return `${sentence(spec.descriptor.toLowerCase())}: your services with a price and a length, a way to book and a few lines to say why people can trust you.`
}
