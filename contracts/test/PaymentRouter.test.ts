import { expect } from 'chai';
import { ethers } from 'hardhat';
import { alli, domain, now } from './helpers';

import { PAYMENT_INTENT_TYPES as TYPES, PAYMENT_KIND } from '../../src/services/chain/eip712';

const KIND_ORDER = PAYMENT_KIND.order;

async function setup() {
  const [admin, quoter, treasury, buyer, stranger] = await ethers.getSigners();
  const usdt = await ethers.deployContract('MockUSDT');
  const other = await ethers.deployContract('MockUSDT');
  const router = await ethers.deployContract('PaymentRouter', [admin.address, quoter.address, treasury.address, [await usdt.getAddress()]]);
  await usdt.mint(buyer.address, alli(1_000));
  await usdt.connect(buyer).approve(await router.getAddress(), ethers.MaxUint256);
  const d = await domain(router, 'ALLI PaymentRouter');
  const intent = async (overrides: Partial<{ id: string; payer: string; token: string; amount: bigint; kind: number; deadline: number }> = {}) => {
    const i = {
      id: ethers.hexlify(ethers.randomBytes(32)),
      payer: buyer.address,
      token: await usdt.getAddress(),
      amount: alli(90),
      kind: KIND_ORDER,
      deadline: (await now()) + 600,
      ...overrides,
    };
    return { i, sig: await quoter.signTypedData(d, TYPES, i) };
  };
  return { admin, quoter, treasury, buyer, stranger, usdt, other, router, intent, d };
}

describe('PaymentRouter', () => {
  it('pulls exactly the quoted amount to the treasury and emits Paid', async () => {
    const { treasury, buyer, usdt, router, intent } = await setup();
    const { i, sig } = await intent();
    await expect(router.connect(buyer).pay(i, sig))
      .to.emit(router, 'Paid')
      .withArgs(i.id, buyer.address, i.token, i.amount, KIND_ORDER);
    expect(await usdt.balanceOf(treasury.address)).to.equal(alli(90));
    expect(await usdt.balanceOf(buyer.address)).to.equal(alli(910));
    expect(await router.paid(i.id)).to.equal(true);
  });

  it('pays an intent once', async () => {
    const { buyer, router, intent } = await setup();
    const { i, sig } = await intent();
    await router.connect(buyer).pay(i, sig);
    await expect(router.connect(buyer).pay(i, sig)).to.be.revertedWithCustomError(router, 'AlreadyPaid');
  });

  it('rejects a tampered price, a forged quote, another payer, an expired quote and an unknown token', async () => {
    const { buyer, stranger, other, router, intent, d } = await setup();
    const { i, sig } = await intent();
    await expect(router.connect(buyer).pay({ ...i, amount: 1n }, sig)).to.be.revertedWithCustomError(router, 'BadSignature');

    const forged = await stranger.signTypedData(d, TYPES, i);
    await expect(router.connect(buyer).pay(i, forged)).to.be.revertedWithCustomError(router, 'BadSignature');

    await expect(router.connect(stranger).pay(i, sig)).to.be.revertedWithCustomError(router, 'NotPayer');

    const late = await intent({ deadline: (await now()) - 1 });
    await expect(router.connect(buyer).pay(late.i, late.sig)).to.be.revertedWithCustomError(router, 'QuoteExpired');

    const foreign = await intent({ token: await other.getAddress() });
    await expect(router.connect(buyer).pay(foreign.i, foreign.sig)).to.be.revertedWithCustomError(router, 'TokenNotAccepted');
  });

  it('can be paused, and only the admin changes treasury or tokens', async () => {
    const { admin, buyer, stranger, router, intent } = await setup();
    await router.connect(admin).pause();
    const { i, sig } = await intent();
    await expect(router.connect(buyer).pay(i, sig)).to.be.revertedWithCustomError(router, 'EnforcedPause');
    await expect(router.connect(stranger).setTreasury(stranger.address)).to.be.revertedWithCustomError(router, 'AccessControlUnauthorizedAccount');
    await expect(router.connect(admin).setTreasury(ethers.ZeroAddress)).to.be.revertedWithCustomError(router, 'ZeroAddress');
  });
});
