import type { KitNiche, SiteKit } from './types'

interface KitSummary { id: string; niche: KitNiche; theme: SiteKit['theme']; label: string; description: string }

/** The Designer profile kits for the editor's kit library. Kept apart from KIT_INDEX so the public theme pages, which list KIT_INDEX by niche, stay as they are.
 *  Labels and descriptions are the design system's own (designer-profile-variants.test.ts pins them to the kit). */
export const DESIGNER_PROFILE_KIT_INDEX: readonly KitSummary[] = [
  { id: 'designer-profile-general', niche: 'general', theme: 'Designer', label: 'Design studio', description: 'A design studio that plans and finishes whole homes: the work, the approach and an easy first conversation.' },
  { id: 'designer-profile-coaches', niche: 'coaches', theme: 'Designer', label: 'Interior designers', description: 'Interior designers who plan rooms, source furniture and style the finished home.' },
  { id: 'designer-profile-studios', niche: 'studios', theme: 'Designer', label: 'Architects', description: 'Residential architects: new homes, additions and the permits in between.' },
  { id: 'designer-profile-hosts', niche: 'hosts', theme: 'Designer', label: 'Design + build', description: 'Design + build firms that take a project from permits to pillows with one team.' },
  { id: 'designer-profile-venues', niche: 'venues', theme: 'Designer', label: 'Landscape and garden', description: 'Garden designers and landscape studios: outdoor rooms, planting and the build.' },
  { id: 'designer-profile-nonprofits', niche: 'nonprofits', theme: 'Designer', label: 'Kitchen and bath', description: 'Kitchen and bath specialists: layout, cabinetry, tile and a clean install.' },
  { id: 'designer-profile-networks', niche: 'networks', theme: 'Designer', label: 'Brand and graphic design', description: 'Brand and graphic designers: identities, print and packaging for small businesses.' },
  { id: 'designer-profile-creators', niche: 'creators', theme: 'Designer', label: 'Web and digital design', description: 'Web and product designers: sites, shops and the systems behind them.' },
  { id: 'designer-profile-schools', niche: 'schools', theme: 'Designer', label: 'Design courses', description: 'Designers who teach: courses, workshops and studio days for people planning their own projects.' },
  { id: 'designer-profile-clubs', niche: 'clubs', theme: 'Designer', label: 'Furniture and makers', description: 'Furniture makers and craft studios: custom work, made-to-order pieces and the workshop.' },
  { id: 'designer-profile-faith', niche: 'faith', theme: 'Designer', label: 'Event design and florals', description: 'Event designers and florists: weddings, dinners and celebrations, planned and installed.' },
  { id: 'designer-profile-wellness', niche: 'wellness', theme: 'Designer', label: 'Home staging and styling', description: 'Home stagers and stylists: listings, refreshes and a seasonal care plan.' },
  { id: 'designer-profile-markets', niche: 'markets', theme: 'Designer', label: 'Textiles and soft goods', description: 'Textile designers and soft-goods studios: fabric, linens and made-to-order upholstery.' },
]
