/**
 * Creator economy / revenue share (spec §17). Market items can have a creator;
 * when someone buys an item with Zaps, a share of those Zaps is credited to the
 * creator. Earnings accrue in Zaps. Fiat payout (Stripe Connect) is a future step.
 */

/** The creator's cut of a Zaps purchase: 70%. */
export const CREATOR_SHARE = 0.7;

/** One credited sale: a row in the creator earnings ledger. */
export interface CreatorEarning {
  id: string;
  worldId: string;
  creatorUserId: string;
  itemId: string | null;
  buyerUserId: string;
  amountZaps: number;
  createdAt: string;
}

/** A creator's earnings at a glance: lifetime total, sale count, recent sales. */
export interface CreatorSummary {
  totalZaps: number;
  sales: number;
  recent: CreatorEarning[];
}
