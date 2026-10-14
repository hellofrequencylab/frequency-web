# Website Strategy: two wings, one network

Scope: the public marketing site. It's built on **Stage** (dark, iridescent), with messaging from `guidelines/messaging.md`. Features come from the frequency-web product inventory: member domains, the Space console, and pricing. Next step after this: the UX of each page.

## Core belief
**Build circles, not walls.** Every page must pass it: no gated content, no "members only" walls, no lock-in language, and clear ownership and export for Spaces. The homepage carries a dedicated belief section.

## Strategy in five rules
1. **Two wings, never mixed.** Every page serves one market: **Community** (people) or **Community Spaces** (hosting businesses). The homepage is the only shared door, and it splits within the first screen.
2. **Sell the outcome, then show the feature.** People buy "a Thursday," not "Circles." Spaces buy "a community that keeps growing," not "a CRM." Features appear as proof under an outcome headline.
3. **Every page ends in a community.** People pages end on a real Circle or community near you, not a sign-up form. Space pages end on "Open your Space" with an example of a live community.
4. **Proof over pitch.** Each page has one proof module: live counts ("212 people checked in last week"), a real Host story, or a real Space's standing.
5. **Search for the pain.** The site is also an SEO and answer-engine surface. Long-tail pages answer what each wing types late at night.

## Sitemap
Files live in `templates/website/` (hub: `Website.dc.html`).
Two wings (People, Spaces). Only Home toggles between them; every other page belongs to one wing or shows both.
```
Home.html        Vision fold → choose your path (People / Spaces) → story → weave
People.html      Wing home for people: path, first night, near you, features (short list), FAQ
Spaces.html      Wing home for Spaces: path, five Space types, features (short list), FAQ
Features.html    Every feature, both sides: People (Find · Show up · Come back · Pass it on), Spaces (Be found · Open the door · Bring them back · Get paid). Each opens to a 3-step "how it works" and what changes.
Pricing.html     Free · Business · Non-profit, feature-by-plan matrix, the deal (Spaces)
Stories.html     Host stories and Space stories (both)
Join.html        Get started: pick a path, then a short form (town + interests, or Space name + type) with a success state and next steps
Help.html        Searchable questions by topic, plain-language policies (privacy, terms, accessibility), contact form
Vision.html      Third spaces, 2027 (footer + search only)
```
Features are organized by the job the visitor is doing, not by internal modules. Each one leads with a plain name and one benefit line; "how it works" is one click deep. Deep links: Features.html#f-<id> opens that feature.
Plans: Free covers Your page, Standing, Circles, Events, Door QR, Contacts, Hosts, Tickets and Tips. Business adds First-timer nudges, Programs, Email + win-back and Memberships. Non-profit is Business with no network share. People pay nothing.

> The page strategies below predate the package structure. Their content now lives in the pages above.

## Page strategies

### `/` Home: the split door
- **Job:** route each visitor to their wing within 5 seconds, and make both feel the brand.
- **Hero:** "Gather like it matters." Two equal doors: **Find your Circle** and **Open your Space**.
- **Sections:** the split → "We lost our communities" (the story, 3 short paragraphs) → live proof strip (this week's check-ins and Circles meeting) → a short teaser of each wing → the "Sacred, not serious" closer.
- **Feature use:** none in detail. One live counter.
- **Success metric:** wing click-through.

### `/community`: Find your Circle
- **Job:** turn a lonely scroller into an RSVP.
- **Hero:** "A hundred contacts. No one to call on a Tuesday." CTA **Find your Circle**, plus a location-aware strip of 3 real Circles nearby.
- **Sections:** three steps (Find a Circle → Show up → Bring someone) → what a first night is like (anxiety-reducer: faces, what to bring, how long, the Host at the door) → kinds of Circles (moving, making, eating, sitting still, going out) → "Only showing up earns anything" (game teaser) → a Host invite → near-you listings.
- **Features as proof:** Circles, Events with RSVP, QR check-in, Mindless (as "the 5-minute version on a hard day"), friend invites.
- **Objections answered:** "I don't know anyone" · "I'm not spiritual" · "I'm not fit" · "Is it free?"

### `/community/how`: How it works
- **Job:** remove uncertainty for careful joiners.
- **Sections:** Circle (small, weekly, same faces) · Nights (bigger, open doors) · The door (check-in, name tags, the first five minutes) · Safety (verified Hosts, reporting, block) · FAQ.

### `/community/play`: The game
- **Job:** make showing up feel fun, without guilt.
- **Hero:** "The only way to win is to show up."
- **Sections:** Zaps for real-world acts (check in, finish with your Circle, bring a friend) · seasons, so nobody chases forever · cooperative play (the Circle meter, a local shared board) · no streak shame · what you earn (Gems, Vault, trophies, iridescent moments).
- **Feature use:** the Quest, Zaps and Gems, seasons, ranks, Circle meter.

### `/community/host`: Host a Circle
- **Job:** recruit Latent Leaders, the growth engine.
- **Hero:** "You're already the one who organizes. Here's backup."
- **Sections:** a ready-made format (Starter Circles, programs) · the host kit (invite links, check-in, reminders) · finding a Space to meet in · Host stories · "Host a Circle" CTA.

### `/near/[city]`: What's happening near you
- **Job:** SEO and answer-engine landing, plus live conversion.
- **Template:** H1 in search language ("Things to do this week in San Diego with other people") → live Events and Circles → top Spaces by standing → an FAQ in literal questions.

### `/spaces`: Grow your community. Keep your people.
- **Job:** turn an owner with an empty Tuesday into an open Space.
- **Hero:** "You’ve built a community. Let the people looking for one find it." CTA **Open your Space**, free.
- **Sections:** what the network does (the city calendar, people looking for their people, ranking by gathering) → the kit (6 tools, one line each) → "Rank by gathering, not by paying" → the deal (0% on your regulars) → a live Space example with real standing → persona door chooser.
- **Features as proof:** Space page editor, Circles inside a Space, Events and tickets, door QR → contacts, CRM nudges, memberships into Circles, programs, standing.
- **Objections answered:** "Another tool?" (it replaces six) · "What does it cost?" (nothing until you charge) · "Will you sell my members?" (never).

### `/spaces/tools`: The kit
- **Job:** feature depth for evaluators.
- **Structure:** one outcome per tool. *Remember who came* (door QR + contacts) · *Bring them back* (CRM nudges, email) · *Get paid* (memberships, tickets, refunds, tips at 0%) · *Run it together* (programs, Circles) · *Look good* (page editor) · *Know it's working* (standing, check-in counts).

### `/spaces/standing`: How placement is earned
- **Job:** build trust and differentiate. Nobody else ranks this way.
- **Content:** what counts (how often you gather, people in the room), what never counts (money), a worked example, and how a new Space gets its first boost.

### `/spaces/pricing`: The deal
- **Content:** tiers from the product catalog, shown as one price per plan with no strike-throughs. The headline rule: "Your regulars: 0%. People we bring you: a small share. Non-profits: nothing." It ends on the outcome (booked, returned), never on revenue.

### `/spaces/for/[type]`: Persona doors
- **Studios** ("Fill the 7pm class"), **Coaches & practitioners** ("A client list you keep"), **Event hosts** ("A guest list that comes back"), **Cafés & venues** ("Your slow night, full"), **Non-profits** ("Every tool, nothing taken").
- Each door shows the same structure, its own hero, the 3 most relevant tools and one story.

### `/stories`
- Real Hosts and Spaces, with photos from their rooms. Each story ends with "Visit their Space" or "Join their Circle."

### `/vision`: Third spaces (sub-page)
- **Audience:** partners, investors, civic and press. It isn't linked from either wing's primary nav.
- **Job:** share the 2027 vision: when a town's network gets dense enough, it earns a dedicated third space.
- **Content:** the density story (the network finds the people, the people find each other, the community earns a home) · facility concepts, labeled "Vision · late 2027" · partner interest form.
- Theme: Stage still, slower motion, more editorial.

## Navigation (header v4)
Research basis: NN/g found users are 89% more likely to remember a top-left logo, and getting home is about 6x harder with a centered one. Keep 5–8 top-level items, label by user need rather than org structure, use a 150–250ms hover delay with a forgiving close, keep high-intent actions visible, and put login top right, replaced by the avatar once signed in.
- **Left:** logo (home link), then **For people · For spaces · Features** (menus) and **Pricing · Stories** (direct links). The current section carries a dim iridescent underline.
- **Features menu:** every feature as a chip, grouped by job, for people and for Spaces.
- **Right, signed out:** search, Log in, the page's primary action (Find your Circle / Open your Space).
- **Right, signed in:** search, notifications, avatar. The avatar menu holds stats and the role tools (Member · Host · Space owner · Admin).
- **Search:** opens with the icon or the "/" key and jumps to pages and features.
- **Scroll:** shrinks after 24px, hides on scroll down, returns on scroll up, iridescent progress line.
- **Under 1024px:** a full-screen Menu sheet with search and login at the top, then accordions.
- **Footer:** both wings, Features, Pricing, Stories, Vision.

## FX layer (mood + texture)
Pages load `web/fx.css` after `site.css`, and `web/fx.js` last (after `side.js` and `megamenu.js`, which it reads).
- **Mood:** `fx.js` sets `body[data-mood]`, `body[data-energy-page]` and `--m1/--m2/--m3` from its page table, with a fixed wash. Hero sphere, section halos, jewel orbs, gradient seams.
- **Texture:** one generated bitmap grain tile (`--fx-noise`) on photos and cards, iridescent hover sheen, live signal lines driven by `data-energy`, breathing live dots, pointer-follow card light, logo sheen.
- **Orbs:** one hero sphere per page. Jewels add depth only, at section edges. Help-style pages keep orbs in the hero.
- **Performance:** one rAF-batched scroll loop, orb fields pause offscreen, signal lines about 30fps only while visible, grain hidden under 860px, Leaflet loaded on demand. Never put `mix-blend-mode` on fixed full-page SVG noise.
- All loops stop under `prefers-reduced-motion`.
