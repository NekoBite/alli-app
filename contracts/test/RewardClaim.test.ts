import { time } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';
import { alli, domain, now } from './helpers';

import { REWARD_CLAIM_TYPES as TYPES } from '../../src/services/chain/eip712';

async function setup(cap = alli(10_000)) {
  const [admin, signer, user, relayer, stranger] = await ethers.getSigners();
  const token = await ethers.deployContract('AlliToken', [admin.address, alli(1_000_000)]);
  const claim = await ethers.deployContract('RewardClaim', [await token.getAddress(), admin.address, signer.address, cap]);
  await token.transfer(await claim.getAddress(), alli(100_000));
  const d = await domain(claim, 'ALLI RewardClaim');
  const voucher = async (who: Signer, to: string, amount: bigint, nonce: bigint, deadline?: number) => {
    const dl = deadline ?? (await now()) + 600;
    return { amount, nonce, deadline: dl, sig: await who.signTypedData(d, TYPES, { user: to, amount, nonce, deadline: dl }) };
  };
  return { admin, signer, user, relayer, stranger, token, claim, voucher };
}

describe('RewardClaim', () => {
  it('pays a signed voucher to the user and bumps the nonce', async () => {
    const { signer, user, token, claim, voucher } = await setup();
    const v = await voucher(signer, user.address, alli(1_000), 0n);
    await expect(claim.connect(user).claim(v.amount, v.nonce, v.deadline, v.sig))
      .to.emit(claim, 'Claimed')
      .withArgs(user.address, v.amount, 0n);
    expect(await token.balanceOf(user.address)).to.equal(alli(1_000));
    expect(await claim.nonceOf(user.address)).to.equal(1n);
  });

  it('lets a relayer submit, and still pays the user', async () => {
    const { signer, user, relayer, token, claim, voucher } = await setup();
    const v = await voucher(signer, user.address, alli(5), 0n);
    await claim.connect(relayer).claimFor(user.address, v.amount, v.nonce, v.deadline, v.sig);
    expect(await token.balanceOf(user.address)).to.equal(alli(5));
    expect(await token.balanceOf(relayer.address)).to.equal(0n);
  });

  it('cannot be redirected: a voucher for one user fails for another', async () => {
    const { signer, user, stranger, claim, voucher } = await setup();
    const v = await voucher(signer, user.address, alli(5), 0n);
    await expect(claim.connect(stranger).claim(v.amount, v.nonce, v.deadline, v.sig)).to.be.revertedWithCustomError(claim, 'BadSignature');
  });

  it('refuses replays, wrong signers, tampered amounts and expired vouchers', async () => {
    const { signer, user, stranger, claim, voucher } = await setup();
    const v = await voucher(signer, user.address, alli(5), 0n);
    await claim.connect(user).claim(v.amount, v.nonce, v.deadline, v.sig);
    await expect(claim.connect(user).claim(v.amount, v.nonce, v.deadline, v.sig))
      .to.be.revertedWithCustomError(claim, 'BadNonce')
      .withArgs(1n, 0n);

    const forged = await voucher(stranger, user.address, alli(5), 1n);
    await expect(claim.connect(user).claim(forged.amount, 1n, forged.deadline, forged.sig)).to.be.revertedWithCustomError(claim, 'BadSignature');

    const honest = await voucher(signer, user.address, alli(5), 1n);
    await expect(claim.connect(user).claim(alli(50), 1n, honest.deadline, honest.sig)).to.be.revertedWithCustomError(claim, 'BadSignature');

    const old = await voucher(signer, user.address, alli(5), 1n, (await now()) - 1);
    await expect(claim.connect(user).claim(old.amount, 1n, old.deadline, old.sig)).to.be.revertedWithCustomError(claim, 'VoucherExpired');
  });

  it('holds the daily cap across users and resets the next UTC day', async () => {
    const { signer, user, stranger, claim, voucher } = await setup(alli(100));
    const a = await voucher(signer, user.address, alli(70), 0n);
    await claim.connect(user).claim(a.amount, 0n, a.deadline, a.sig);
    expect(await claim.remainingToday()).to.equal(alli(30));

    const b = await voucher(signer, stranger.address, alli(31), 0n);
    await expect(claim.connect(stranger).claim(b.amount, 0n, b.deadline, b.sig))
      .to.be.revertedWithCustomError(claim, 'DailyCapReached')
      .withArgs(alli(30));

    await time.increase(86_400);
    const c = await voucher(signer, stranger.address, alli(31), 0n);
    await claim.connect(stranger).claim(c.amount, 0n, c.deadline, c.sig);
    expect(await claim.remainingToday()).to.equal(alli(69));
  });

  it('stops everything while paused, and only the admin unpauses or withdraws', async () => {
    const { admin, signer, user, stranger, token, claim, voucher } = await setup();
    await claim.connect(admin).pause();
    const v = await voucher(signer, user.address, alli(5), 0n);
    await expect(claim.connect(user).claim(v.amount, 0n, v.deadline, v.sig)).to.be.revertedWithCustomError(claim, 'EnforcedPause');
    await expect(claim.connect(stranger).unpause()).to.be.revertedWithCustomError(claim, 'AccessControlUnauthorizedAccount');
    await expect(claim.connect(stranger).withdraw(stranger.address, 1n)).to.be.revertedWithCustomError(claim, 'AccessControlUnauthorizedAccount');
    await claim.connect(admin).withdraw(admin.address, alli(100_000));
    expect(await token.balanceOf(await claim.getAddress())).to.equal(0n);
  });
});
