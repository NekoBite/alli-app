import {
  defaultRates,
  describeRates,
  formatRates,
  makeInviteCode,
  maskEmail,
  MAX_GENERATIONS,
  paidTo,
  REFERRAL_RULES,
  splitCommission,
  triggerText,
  validateRates,
  youGetText,
} from './rules';

const USDT = 10n ** 18n;

describe('splitCommission', () => {
  const run = REFERRAL_RULES.run.ratesBps;

  it('reproduces the worked example in docs/referral-programs.md', () => {
    // 100 USDT Silver upgrade. G1 Silver active · G2 Leather · G3 Silver active ·
    // G4 lapsed · G5 Gold active.
    const split = splitCommission(100n * USDT, run, [
      { id: 'g1', qualified: true },
      { id: 'g2', qualified: false },
      { id: 'g3', qualified: true },
      { id: 'g4', qualified: false },
      { id: 'g5', qualified: true },
    ]);
    expect(paidTo(split, 'g1')).toBe(20n * USDT);
    expect(paidTo(split, 'g2')).toBe(0n);
    expect(paidTo(split, 'g3')).toBe(20n * USDT);
    expect(paidTo(split, 'g5')).toBe(10n * USDT);
    expect(split.treasury).toBe(0n);
    expect(split.payouts.find((p) => p.generation === 2)?.rolledUpFrom).toBe('g2');
  });

  it('sends an unqualified Gen 1 share to the treasury, not to Gen 2', () => {
    const split = splitCommission(100n * USDT, run, [
      { id: 'g1', qualified: false },
      { id: 'g2', qualified: true },
    ]);
    expect(split.treasury).toBe(20n * USDT);
    expect(paidTo(split, 'g2')).toBe(10n * USDT);
  });

  it('keeps shares with no sponsor at that depth unassigned', () => {
    const split = splitCommission(100n * USDT, run, [{ id: 'g1', qualified: true }]);
    expect(paidTo(split, 'g1')).toBe(20n * USDT);
    expect(split.unassigned).toBe(30n * USDT);
  });

  it('sends a roll-up that finds nobody qualified above to the treasury', () => {
    const split = splitCommission(100n * USDT, run, [
      { id: 'g1', qualified: true },
      { id: 'g2', qualified: false },
    ]);
    expect(split.treasury).toBe(10n * USDT);
  });

  it('never pays out more than the rates add up to', () => {
    const amount = 123_456_789n;
    const split = splitCommission(amount, run, Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, qualified: i % 2 === 0 })));
    const total = split.payouts.reduce((s, p) => s + p.amount, 0n) + split.treasury + split.unassigned;
    expect(total).toBeLessThanOrEqual((amount * 5000n) / 10_000n);
  });

  it('rejects a negative base', () => {
    expect(() => splitCommission(-1n, run, [])).toThrow();
  });
});

describe('helpers', () => {
  it('prints rates the way the hub does', () => {
    expect(formatRates(REFERRAL_RULES.run.ratesBps)).toBe('20% / 10%');
    expect(formatRates(REFERRAL_RULES.garden.ratesBps)).toBe('20% / 5%');
    expect(formatRates(REFERRAL_RULES.market.ratesBps)).toBe('1% / 0.5%');
  });

  it('makes codes with the prefix and no look-alike characters', () => {
    let i = 0;
    const code = makeInviteCode('RUN', (n) => i++ % n);
    expect(code).toMatch(/^RUN-[2-9A-HJKMNP-Z]{6}$/);
  });

  it('masks e-mails', () => {
    expect(maskEmail('jessica@gmail.com')).toBe('je*****@gmail.com');
    expect(maskEmail('ab@x.io')).toBe('ab***@x.io');
  });
});

describe('rates are data', () => {
  it('describes any rate set in words, grouping generations that pay the same', () => {
    expect(describeRates([2000, 1000, 1000, 1000])).toBe('20% to Gen 1, 10% each to Gen 2–4');
    expect(describeRates([4000, 1000, 1000, 1000])).toBe('40% to Gen 1, 10% each to Gen 2–4');
    expect(describeRates([2000, 500, 500])).toBe('20% to Gen 1, 5% each to Gen 2–3');
    expect(describeRates([100, 50])).toBe('1% to Gen 1, 0.5% to Gen 2');
    expect(describeRates([20])).toBe('0.2% to Gen 1');
    expect(describeRates([1000, 500, 500, 1000])).toBe('10% to Gen 1, 5% each to Gen 2–3, 10% to Gen 4');
    expect(describeRates([])).toBe('');
  });

  it('builds the screen copy from the rates, so it cannot drift from what is paid', () => {
    // The same program, two different rate sets: only the numbers move.
    expect(triggerText('run', [2000, 1000, 1000, 1000])).toBe(
      'Paid when someone in your Run team upgrades their shoe to Silver. 20% to Gen 1, 10% each to Gen 2–4.',
    );
    expect(triggerText('run', [4000, 1000, 1000, 1000])).toContain('40% to Gen 1');
    expect(youGetText('run', [2000, 1000, 1000, 1000])).toBe('20% of their Silver upgrade');
    expect(youGetText('run', [4000, 1000, 1000, 1000])).toBe('40% of their Silver upgrade');
    expect(youGetText('garden', [2000, 500, 500])).toBe('20% of their seed purchases');
    expect(youGetText('market', [100, 50])).toBe('1% of every order they place');
    // The card states its own proposal; the rates do not rewrite it.
    expect(triggerText('card', [20])).toBe(REFERRAL_RULES.card.trigger);
  });

  it('every default is itself a valid rate set', () => {
    for (const rates of Object.values(defaultRates())) expect(validateRates(rates)).toBeNull();
  });

  it('refuses rates that cannot be paid out of one purchase', () => {
    expect(validateRates([2000, 1000, 1000, 1000])).toBeNull();
    expect(validateRates([10_000])).toBeNull(); // exactly 100% is allowed
    expect(validateRates([10_000, 1])).toMatch(/more than 100%/);
    expect(validateRates([6000, 5000])).toMatch(/more than 100%/);
    expect(validateRates([])).toMatch(/at least one/i);
    expect(validateRates([-1])).toMatch(/whole number/);
    expect(validateRates([20.5])).toMatch(/whole number/);
    expect(validateRates([10_001])).toMatch(/whole number/);
    expect(validateRates(Array(MAX_GENERATIONS + 1).fill(1))).toMatch(/at most/i);
  });

  it('splits the same purchase differently under a different rate set, with no code change', () => {
    const upline = [
      { id: 'g1', qualified: true },
      { id: 'g2', qualified: true },
    ];
    expect(paidTo(splitCommission(100n * USDT, [4000, 1000], upline), 'g1')).toBe(40n * USDT);
    expect(paidTo(splitCommission(100n * USDT, [2000, 1000], upline), 'g1')).toBe(20n * USDT);
    expect(paidTo(splitCommission(100n * USDT, [2000, 1000], upline), 'g2')).toBe(10n * USDT);
  });
});
