import { FocusTemplate } from '@/components/templates/focus-template'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox } from '@/components/ui/checkbox'
import { labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import type { CommerceAdminView } from '@/lib/hunts/commerce-admin'
import { approveOfferAction, bindPassAction, withdrawOfferAction } from '@/app/(main)/hunts/edit/[id]/commerce/actions'

const dollars = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

/** The organizer's commerce screen (FH-036S, FH-038S). Server-rendered; every change is a form to a server action. */
export function HuntCommerceAdmin({ view }: { view: CommerceAdminView }) {
  const open = view.tiers.filter((t) => !t.bound)
  return (
    <FocusTemplate eyebrow="Frequency Hunts" title="Passes and store items" description="Link this Hunt to a ticket and to your Space’s store." width="xl" adminBar={false}>
      {!view.sellerSpaceId ? (
        <EmptyState variant="no-results" title="This Hunt needs a Space" description="Passes and store items are sold by a Space. Move this Hunt to a Space you run to use them." />
      ) : !view.published ? (
        <EmptyState variant="first-use" title="Publish first" description="A pass or store item can only carry benefits a published version offers." />
      ) : (
        <div className="space-y-10">
          <section aria-labelledby="pass-heading">
            <h2 id="pass-heading" className="text-body font-medium">Experience Pass</h2>
            <p className="mt-1 text-body-sm text-muted">Add Hunt benefits to one of your fixed-price tickets. The event still sells the seat.</p>
            {view.benefits.length === 0 ? (
              <p className="mt-3 text-body-sm text-muted">This version offers no benefits yet, so there is nothing to bind.</p>
            ) : open.length === 0 ? (
              <p className="mt-3 text-body-sm text-muted">No open fixed-price tickets on your events.</p>
            ) : (
              <form action={bindPassAction} className="mt-4 space-y-4">
                <input type="hidden" name="huntId" value={view.huntId} />
                <div>
                  <label htmlFor="pass-tier" className={labelClasses}>Ticket</label>
                  <Select id="pass-tier" name="ticketTypeId" required>
                    {open.map((t) => (
                      <option key={t.id} value={t.id}>{t.eventTitle}: {t.name} ({dollars(t.priceCents)})</option>
                    ))}
                  </Select>
                </div>
                <fieldset>
                  <legend className={labelClasses}>Benefits</legend>
                  <div className="mt-2 space-y-2">
                    {view.benefits.map((b) => (
                      <Checkbox key={b.code} name="benefit" value={b.code} label={b.label} />
                    ))}
                  </div>
                </fieldset>
                <Button type="submit">Bind pass</Button>
              </form>
            )}
            {view.bindings.length > 0 && (
              <ul className="mt-4 divide-y divide-border text-body-sm">
                {view.bindings.map((b) => (
                  <li key={b.id} className="flex justify-between py-2">
                    <span>{view.tiers.find((t) => t.id === b.ticketTypeId)?.name ?? 'Ticket'}: {b.benefitCodes.join(', ')}</span>
                    <span className="text-muted">{b.status === 'active' ? 'Active' : 'Retired'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="store-heading">
            <h2 id="store-heading" className="text-body font-medium">Store items</h2>
            <p className="mt-1 text-body-sm text-muted">Approve an item from your store. A link alone creates no benefit; a benefit needs one of the Hunt’s published ones.</p>
            {view.products.length === 0 ? (
              <p className="mt-3 text-body-sm text-muted">Your Space has no active store items.</p>
            ) : (
              <form action={approveOfferAction} className="mt-4 space-y-4">
                <input type="hidden" name="huntId" value={view.huntId} />
                <div>
                  <label htmlFor="offer-product" className={labelClasses}>Item</label>
                  <Select id="offer-product" name="productId" required>
                    {view.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>
                <div>
                  <label htmlFor="offer-benefit" className={labelClasses}>Benefit</label>
                  <Select id="offer-benefit" name="benefitCode">
                    <option value="">Link only</option>
                    {view.benefits.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
                  </Select>
                </div>
                <div>
                  <label htmlFor="offer-state" className={labelClasses}>Opens when the order is</label>
                  <Select id="offer-state" name="requiresState">
                    <option value="paid">Paid</option>
                    <option value="fulfilled">Fulfilled</option>
                  </Select>
                </div>
                <Button type="submit">Approve item</Button>
              </form>
            )}
            {view.offers.length > 0 && (
              <ul className="mt-4 divide-y divide-border text-body-sm">
                {view.offers.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                    <span>{o.productName}{o.benefitCode ? `: ${o.benefitCode}` : ' (link only)'}</span>
                    {o.status === 'approved' ? (
                      <form action={withdrawOfferAction}>
                        <input type="hidden" name="huntId" value={view.huntId} />
                        <input type="hidden" name="offerId" value={o.id} />
                        <Button type="submit" variant="ghost" size="sm">Withdraw</Button>
                      </form>
                    ) : (
                      <span className="text-muted">Withdrawn</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </FocusTemplate>
  )
}
