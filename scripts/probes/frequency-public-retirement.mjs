import assert from 'node:assert/strict'
import { existsSync,readFileSync } from 'node:fs'
const read=file=>readFileSync(file,'utf8')
const key=process.argv[2]??'all'
function cover(){
 const component=read('components/frequency/members/event/event-header.tsx'), page=read('app/(main)/events/[slug]/event-member-page.tsx'), css=read('app/themes/frequency/members-b.css')
 assert(component.includes('export function FqEventCover('));assert(component.includes('eventCoverFocusStyle(focus)'));assert(!component.includes('aspectRatio:'))
 assert(css.includes('.fqm-evh-cover-art{object-fit:cover}'));assert(!css.includes('.fqm-evh-cover.is-shaped'))
 assert(page.includes('<FqEventCover'));assert(!page.includes('aspect={coverAspect}'));assert(page.includes('focus={coverFocus}'))
 assert(page.includes('readEventCoverFocus(extra?.theme)'))
 const control=read('components/admin/modules/event-header-controls.tsx'), action=read('app/(main)/events/admin-actions.ts')
 assert(control.includes('measureCoverAspect('));assert(control.includes('setAspect(measured)'));assert(action.includes('writeEventCoverAspect('));assert(action.includes('normalizeCoverAspect(aspect)'));assert(!action.includes("from 'sharp'"))
}
function hero(){cover();assert(read('app/(main)/spaces/[slug]/(profile)/layout.tsx').includes('<FqSpaceChrome'));assert(read('app/(main)/events/[slug]/event-member-page.tsx').includes('<EventDetailTemplate'))}
function ticker(){
 assert(!existsSync('components/layout/dispatch-ticker.tsx'),'owner retired the old global ticker requirement')
 const nearby=read('components/nearby/dispatch-marquee.tsx'),css=read('app/themes/frequency/members-community.css')
 assert(read('app/(main)/nearby/page.tsx').includes('<DispatchMarquee'))
 assert(nearby.includes('aria-hidden={hidden || undefined}'));assert(nearby.includes('tabIndex={hidden ? -1 : undefined}'))
 assert(!nearby.includes('setInterval('));assert(css.includes('.ay-ticker:focus-within .animate-marquee{animation-play-state:paused}'));assert(css.includes('@media (prefers-reduced-motion:reduce)'))
}
if(key==='cover')cover();else if(key==='hero')hero();else if(key==='ticker')ticker();else {
 for(const file of ['app/(marketing)/pricing/plan-cards.tsx','components/layout/site-header.tsx','components/layout/brand-mark.tsx','components/layout/chrome-reserves.tsx','components/layout/dispatch-ticker.tsx','components/marketing/funnel/niche-funnel.tsx','components/media/poster-band.tsx'])assert(!existsSync(file),file)
 hero();ticker()
 assert(read('app/(marketing)/pricing/page.tsx').includes('<FrequencyPricing'))
 assert(read('components/frequency/site/pages/pricing/frequency-pricing.tsx').includes('price: o.monthly'))
 assert(read('components/frequency/site/pages/funnel/niche/niche-door.tsx').includes('const start = funnelStartHref(config)'))
 assert(read('components/frequency/members/shell/header.tsx').includes('className="ap-logo fq-logo-flow"'))
}
console.log(`Active Frequency public consumer contract: ${key}`)
