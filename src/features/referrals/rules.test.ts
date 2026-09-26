import { formatRates, makeInviteCode, maskEmail, paidTo, REFERRAL_RULES, splitCommission } from './rules';

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
    expect(paidTo(split, 'g1')).toBe(40n * USDT);
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
    expect(split.treasury).toBe(40n * USDT);
    expect(paidTo(split, 'g2')).toBe(10n * USDT);
  });

  it('keeps shares with no sponsor at that depth unassigned', () => {
    const split = splitCommission(100n * USDT, run, [{ id: 'g1', qualified: true }]);
    expect(paidTo(split, 'g1')).toBe(40n * USDT);
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
    expect(total).toBeLessThanOrEqual((amount * 7000n) / 10_000n);
  });

  it('rejects a negative base', () => {
    expect(() => splitCommission(-1n, run, [])).toThrow();
  });
});

describe('helpers', () => {
  it('prints rates the way the hub does', () => {
    expect(formatRates(REFERRAL_RULES.run.ratesBps)).toBe('40% / 10%');
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
