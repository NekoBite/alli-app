import { expect } from 'chai';
import { ethers } from 'hardhat';

const LEATHER = 1;
const SILVER = 2;
const GOLD = 3;

async function setup() {
  const [admin, minter, alice, bob] = await ethers.getSigners();
  const shoes = await ethers.deployContract('AlliShoes', [admin.address, minter.address, 'https://alli.app/shoes/']);
  return { admin, minter, alice, bob, shoes };
}

describe('AlliShoes', () => {
  it('mints tiers and reports the highest one held', async () => {
    const { minter, alice, shoes } = await setup();
    expect(await shoes.highestTier(alice.address)).to.equal(0);
    await shoes.connect(minter).mint(alice.address, LEATHER);
    await shoes.connect(minter).mint(alice.address, GOLD);
    expect(await shoes.highestTier(alice.address)).to.equal(GOLD);
    expect(await shoes.tierOf(2)).to.equal(GOLD);
    expect(await shoes.tokenURI(2)).to.equal('https://alli.app/shoes/2');
  });

  it('keeps the tier count right through a burn (upgrade retires the old shoe)', async () => {
    const { minter, alice, shoes } = await setup();
    await shoes.connect(minter).mint(alice.address, SILVER);
    await shoes.connect(minter).burn(1);
    expect(await shoes.highestTier(alice.address)).to.equal(0);
  });

  it('is soulbound until transfers are switched on', async () => {
    const { admin, minter, alice, bob, shoes } = await setup();
    await shoes.connect(minter).mint(alice.address, GOLD);
    await expect(shoes.connect(alice).transferFrom(alice.address, bob.address, 1)).to.be.revertedWithCustomError(shoes, 'Soulbound');
    await shoes.connect(admin).setTransferable(true);
    await shoes.connect(alice).transferFrom(alice.address, bob.address, 1);
    expect(await shoes.highestTier(alice.address)).to.equal(0);
    expect(await shoes.highestTier(bob.address)).to.equal(GOLD);
  });

  it('rejects unknown tiers and lets the admin add one (e.g. Bronze) without lowering the ceiling', async () => {
    const { admin, minter, alice, shoes } = await setup();
    await expect(shoes.connect(minter).mint(alice.address, 4)).to.be.revertedWithCustomError(shoes, 'BadTier');
    await expect(shoes.connect(minter).mint(alice.address, 0)).to.be.revertedWithCustomError(shoes, 'BadTier');
    await expect(shoes.connect(admin).setMaxTier(2)).to.be.revertedWithCustomError(shoes, 'BadTier');
    await shoes.connect(admin).setMaxTier(4);
    await shoes.connect(minter).mint(alice.address, 4);
    expect(await shoes.highestTier(alice.address)).to.equal(4);
  });

  it('only minters mint', async () => {
    const { alice, shoes } = await setup();
    await expect(shoes.connect(alice).mint(alice.address, GOLD)).to.be.revertedWithCustomError(shoes, 'AccessControlUnauthorizedAccount');
  });
});
