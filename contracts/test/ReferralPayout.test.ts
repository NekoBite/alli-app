import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { alli } from './helpers';

function tree(entries: [string, string, bigint][]) {
  return StandardMerkleTree.of(entries, ['address', 'address', 'uint256']);
}

async function setup() {
  const [admin, publisher, alice, bob, relayer] = await ethers.getSigners();
  const usdt = await ethers.deployContract('MockUSDT');
  const payout = await ethers.deployContract('ReferralPayout', [admin.address, publisher.address]);
  await usdt.mint(await payout.getAddress(), alli(10_000));
  return { admin, publisher, alice, bob, relayer, usdt, payout, token: await usdt.getAddress() };
}

describe('ReferralPayout', () => {
  it('pays cumulative earnings, then only the difference after a new root', async () => {
    const { publisher, alice, bob, usdt, payout, token } = await setup();
    const t1 = tree([
      [alice.address, token, alli(40)],
      [bob.address, token, alli(10)],
    ]);
    await payout.connect(publisher).publish(token, t1.root);
    await payout.claim(token, alice.address, alli(40), t1.getProof(0));
    expect(await usdt.balanceOf(alice.address)).to.equal(alli(40));

    // Next epoch: Alice earned 20 more (a roll-up); Bob never claimed epoch 1 and loses nothing.
    const t2 = tree([
      [alice.address, token, alli(60)],
      [bob.address, token, alli(25)],
    ]);
    await payout.connect(publisher).publish(token, t2.root);
    await expect(payout.claim(token, alice.address, alli(60), t2.getProof(0)))
      .to.emit(payout, 'Claimed')
      .withArgs(token, alice.address, alli(20), alli(60));
    await payout.claim(token, bob.address, alli(25), t2.getProof(1));
    expect(await usdt.balanceOf(alice.address)).to.equal(alli(60));
    expect(await usdt.balanceOf(bob.address)).to.equal(alli(25));
    expect(await payout.epoch(token)).to.equal(2n);
  });

  it('matches the OpenZeppelin leaf layout', async () => {
    const { alice, payout, token } = await setup();
    const t = tree([[alice.address, token, alli(7)]]);
    expect(await payout.leafFor(alice.address, token, alli(7))).to.equal(t.leafHash([alice.address, token, alli(7)]));
  });

  it('refuses a double claim, an inflated amount and a claim for someone else’s leaf', async () => {
    const { publisher, alice, bob, relayer, usdt, payout, token } = await setup();
    const t = tree([
      [alice.address, token, alli(40)],
      [bob.address, token, alli(10)],
    ]);
    await payout.connect(publisher).publish(token, t.root);
    // Anyone may relay; the money still lands with Alice.
    await payout.connect(relayer).claim(token, alice.address, alli(40), t.getProof(0));
    expect(await usdt.balanceOf(relayer.address)).to.equal(0n);
    await expect(payout.claim(token, alice.address, alli(40), t.getProof(0))).to.be.revertedWithCustomError(payout, 'NothingToClaim');
    await expect(payout.claim(token, bob.address, alli(99), t.getProof(1))).to.be.revertedWithCustomError(payout, 'BadProof');
    await expect(payout.claim(token, bob.address, alli(40), t.getProof(0))).to.be.revertedWithCustomError(payout, 'BadProof');
  });

  it('only the publisher publishes', async () => {
    const { alice, payout, token } = await setup();
    await expect(payout.connect(alice).publish(token, ethers.ZeroHash)).to.be.revertedWithCustomError(payout, 'AccessControlUnauthorizedAccount');
  });
});
