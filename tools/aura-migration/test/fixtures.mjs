// Invented profile pages shaped like the admin panel's. No real people.
// Shaped like the profiles in the admin panel, with invented people. The sidebar comes first and
// carries the signed-in admin's own address, which the parser must not mistake for the member.
export const SIDEBAR = ['AURA RUN', 'ADMIN', 'OVERVIEW', 'Dashboard', 'OPERATIONS', 'Members', 'Commissions', 'Admin Logs', 'D', 'admin@example.com', 'ADMIN'];
export const ADMIN_ACTIONS = ['Admin actions', 'Shoe tier (manual override)', 'Leather', 'Silver', 'Gold', 'Save', 'Account status', 'Activate', 'Suspend', 'Ban'];

export function profile(overrides = {}) {
  const o = {
    email: 'sponsor@example.com',
    id: 'cexample0000000000000001',
    tier: 'GOLD',
    alli: '100,000',
    usdt: '5',
    earned: ['35', 'USDT', '5 commission(s)'],
    quests: ['1', '0', '⭐', 'Stars earned'],
    registered: '02/10/2026, 13:45:10',
    referredBy: 'top@example.com',
    wallet: '0xAAAA1111BBBB2222CCCC3333DDDD4444…',
    referrals: ['Gen 1', 'a1@example.com', 'SILVER', 'commission paid ✓', 'Gen 2', 'b2@example.com', 'LEATHER', 'no commission'],
    commissions: [
      'a1@example.com', '+5 USDT', 'a2@example.com', '+5 USDT', 'a3@example.com', '+5 USDT',
      'a4@example.com', '+10 USDT', 'a5@example.com', '+10 USDT',
    ],
    withdrawals: ['25 USDT', 'COMPLETED', '5,000,000 ALLI', 'COMPLETED'],
    upgrades: ['25 USDT', 'CONFIRMED · 26/10/2026, 08:36:18'],
    transactions: [
      '01/11/2026, 13:46:58', 'COMMISSION', 'USDT', '+5', '5',
      '01/11/2026, 13:46:24', 'WITHDRAWAL', 'USDT', '−25', '0',
      '27/10/2026, 07:10:45', 'DEPOSIT', 'ALLI', '+100,000', '100,000',
    ],
    ...overrides,
  };
  return [
    ...SIDEBAR,
    'Members', 'K', o.email, o.id, o.tier, 'ACTIVE', 'Verified',
    'ALLI Balance', o.alli, 'USDT Balance', o.usdt,
    'Referral earned', ...o.earned,
    'Quests done', ...o.quests,
    'Profile', 'Registered', o.registered, 'NFT shoe', o.tier, 'Referred by', o.referredBy,
    'Custodial wallet', o.wallet,
    ...ADMIN_ACTIONS,
    'Direct referrals (9)', ...o.referrals,
    'Commissions earned', ...o.commissions,
    'Withdrawals', ...o.withdrawals,
    'Upgrades', ...o.upgrades,
    'Recent transactions', 'Date', 'Type', 'Cur', 'Amount', 'Balance', ...o.transactions,
  ];
}

