import { roundStars } from '@/features/run/rewards';

/**
 * The mock's star balance, shared by the run, garden and quest mocks so a
 * sparkle collected on a tree or a quest reward shows up in the same number
 * the run tab reads. In production all three write to the one `star_ledger`.
 */
let balance = 3;

export const mockStars = {
  balance: () => balance,
  credit(stars: number): number {
    balance = roundStars(balance + stars);
    return balance;
  },
  debit(stars: number): number {
    if (stars > balance) throw new Error('You do not have that many stars.');
    balance = roundStars(balance - stars);
    return balance;
  },
};
