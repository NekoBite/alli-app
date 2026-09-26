import { expect } from 'chai';
import { ethers } from 'hardhat';
import { alli } from './helpers';

describe('AlliToken', () => {
  it('mints the whole supply to the treasury once, and has no mint', async () => {
    const [, treasury] = await ethers.getSigners();
    const token = await ethers.deployContract('AlliToken', [treasury.address, alli(1_000_000_000)]);
    expect(await token.totalSupply()).to.equal(alli(1_000_000_000));
    expect(await token.balanceOf(treasury.address)).to.equal(alli(1_000_000_000));
    expect(new ethers.Interface(token.interface.fragments).getFunction('mint')).to.equal(null);
  });

  it('lets holders burn (the treasury share of referral roll-ups can be burned)', async () => {
    const [, treasury] = await ethers.getSigners();
    const token = await ethers.deployContract('AlliToken', [treasury.address, alli(100)]);
    await token.connect(treasury).burn(alli(40));
    expect(await token.totalSupply()).to.equal(alli(60));
  });

  it('refuses a zero treasury', async () => {
    await expect(ethers.deployContract('AlliToken', [ethers.ZeroAddress, 1n])).to.be.revertedWith('ALLI: treasury is zero');
  });
});
