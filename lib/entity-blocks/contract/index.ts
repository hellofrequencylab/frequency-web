import { headingBlock } from './heading'
import { dividerBlock } from './divider'
import { calloutBlock } from './callout'
import { textBlock } from './text'
import { linksBlock } from './links'
import { imageBlock } from './image'
import { featuresBlock } from './features'
import { galleryBlock } from './gallery'
import { quoteBlock } from './quote'
import { embedBlock } from './embed'
import { recordingBlock } from './recording'
import { buttonBlock } from './button'
import { contactFormBlock } from './contactForm'
import { photoHeroBlock } from './photoHero'
import { editorialBlock } from './editorial'
import { cardGridBlock } from './cardGrid'
import { zigzagBlock } from './zigzag'
import { accentBeatBlock } from './accentBeat'
import { displayHeadingBlock } from './displayHeading'
import { proseBlock } from './prose'
import { productCardBlock } from './productCard'
import { eventCardBlock } from './eventCard'
import { circleCardBlock } from './circleCard'
import { aboutBlock } from './about'
import { storyBlock } from './story'
import { statsBlock } from './stats'
import { offeringsBlock } from './offerings'
import { bookingBlock } from './booking'
import { membershipsBlock } from './memberships'
import { eventsBlock } from './events'
import { practicesBlock } from './practices'
import { journeysBlock } from './journeys'
import { linkCardsBlock } from './linkCards'
import { circlesBlock } from './circles'
import { teamBlock } from './team'
import { reviewsBlock } from './reviews'
import { faqBlock } from './faq'
import { contactBlock } from './contact'
import { businessBlock } from './business'
import { topfriendsBlock } from './topfriends'
import { guestbookBlock } from './guestbook'
import { memberEventsBlock } from './memberEvents'
import { tipBlock } from './tip'

// THE ADOPTED BLOCKS (E1). A block joins the contract by being listed here, one at a time, and from that
// moment `check:blocks` holds it to the whole of it (scripts/check-blocks.mjs). The registry (../registry.ts)
// stays the catalog the editors read; this list is the set whose definitions are complete. The count
// ratchets up toward ENTITY_BLOCKS as blocks are adopted (EDITOR-ARCHITECTURE §7.3, `blocks-adopted`).
export const ADOPTED_BLOCKS = [
  headingBlock,
  dividerBlock,
  calloutBlock,
  textBlock,
  linksBlock,
  imageBlock,
  featuresBlock,
  galleryBlock,
  quoteBlock,
  embedBlock,
  recordingBlock,
  buttonBlock,
  contactFormBlock,
  photoHeroBlock,
  editorialBlock,
  cardGridBlock,
  zigzagBlock,
  accentBeatBlock,
  displayHeadingBlock,
  proseBlock,
  productCardBlock,
  eventCardBlock,
  circleCardBlock,
  aboutBlock,
  storyBlock,
  statsBlock,
  offeringsBlock,
  bookingBlock,
  membershipsBlock,
  eventsBlock,
  practicesBlock,
  journeysBlock,
  linkCardsBlock,
  circlesBlock,
  teamBlock,
  reviewsBlock,
  faqBlock,
  contactBlock,
  businessBlock,
  topfriendsBlock,
  guestbookBlock,
  memberEventsBlock,
  tipBlock,
] as const
