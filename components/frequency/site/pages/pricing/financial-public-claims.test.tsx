import { FrequencyCompareIndex } from '../funnel/frequency-compare'
import { PLAN_STORY } from '@/lib/pricing/plan-story'
import { PLACEHOLDER_METER_LIMITS } from '@/lib/pricing/meter-limits'
import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { catalogConfigByKey, defaultCatalogConfig } from '@/lib/pricing/catalog-config'
import { PRICING_DEFAULTS } from '@/lib/pricing/settings'
import { memberOfferings, spaceFeatureGrid, spaceOfferings, type PricingGridInput } from '@/lib/pricing/pricing-grid'
import { pricingFaq } from '@/app/(marketing)/pricing/pricing-faq'
import { pricingAddOns } from '@/lib/pricing/pricing-addons'
import { calculatorModel } from '@/components/frequency/site/pages/pricing/calculator-model'
import { FrequencyPricing } from '@/components/frequency/site/pages/pricing/frequency-pricing'
import { PricingPromises } from '@/app/(marketing)/pricing/pricing-sections'
const input: PricingGridInput = { values: PRICING_DEFAULTS, catalog: catalogConfigByKey(defaultCatalogConfig()) }
function pricing() {
 const members=memberOfferings(input), spaces=spaceOfferings(input)
 return renderToStaticMarkup(<FrequencyPricing members={members} spaces={spaces} grid={spaceFeatureGrid(input)} faq={pricingFaq(input)} yearlyNote="Yearly is two months free." calculator={calculatorModel(members,spaces,input.catalog,'Yearly is two months free.')} addOns={pricingAddOns(input)} />)
}
describe('public financial scope in rendered pricing',()=>{
 it('distinguishes free membership from host prices and published hosting allowances',()=>{
  const html=pricing()
  expect(html).toContain('within its published allowances')
  expect(html).toContain('Event organizers can charge for tickets')
  expect(html).not.toContain('Join everything, free.')
 })
 it('asks buyers to review the actual price and fees instead of promising a bank destination',()=>{
  const html=pricing()
  expect(html).toContain('Review the price and applicable fees before paying')
  expect(html).not.toContain('paid straight to the host')
 })
 it('shows subscriptions and eligible introduction fees as separate in the visible money promise',()=>{
  const html=renderToStaticMarkup(<PricingPromises />)
  expect(html).toContain('Paid Space plans and introduction fees are separate')
  expect(html).toContain('eligible purchases')
  expect(html).toContain('after card processing')
 })
 it('keeps actual plan and personal-tier prices from the same canonical input',()=>{
  const html=pricing()
  for(const offering of [...memberOfferings(input),...spaceOfferings(input)]) {
   expect(html).toContain(offering.label)
   expect(html).toContain(offering.cta.href.replace(/&/g,'&amp;'))
  }
 })
 it('describes Free and Collective with actual hosting and partner actions, including the illustrated mirrors',()=>{
  const html=pricing()
  expect(html).toContain('Host a Circle or free Event.')
  expect(html).toContain('Link partner Spaces and share a calendar.')
  expect(html).not.toContain('Host free. The whole thing.')
  expect(html).not.toContain('Grow together without giving anything up.')
 })
 it('keeps Business allowances explicit in cards and tooltips instead of promising no limits',()=>{
  const html=pricing()
  expect(html).toContain('with the allowances shown for your plan.')
  expect(html).not.toContain('with the limits lifted.')
 })

})

describe('retained financial story agrees across public outputs', () => {
  it('distinguishes a free hosting allowance from a paid subscription in the shared description', () => {
    expect(PLAN_STORY.lines).toMatch(/host a Circle or free Event/i)
    expect(PLAN_STORY.lines).toMatch(/paid plans.*tools.*capacity/i)
    expect(PLAN_STORY.paid).toMatch(/subscription.*separate.*processing.*introduction/i)
    expect(PLAN_STORY.lines).not.toMatch(/pay when you start charging/i)
  })
  it('grounds the free hosting invitation in actual positive free account capacities', () => {
    expect(PLACEHOLDER_METER_LIMITS.circle_host?.free).toBeGreaterThan(0)
    expect(PLACEHOLDER_METER_LIMITS.event_create?.free).toBeGreaterThan(0)
  })
  it('renders separate subscription, processing and introduction costs on the comparison landing page', () => {
    const html = renderToStaticMarkup(<FrequencyCompareIndex />)
    expect(html).toMatch(/paid plans.*subscription/i)
    expect(html).toMatch(/own audience.*no network introduction fee.*processing/i)
    expect(html).not.toMatch(/your own people are always free/i)
  })

})
