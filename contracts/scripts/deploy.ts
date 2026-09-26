/**
 * Deploys the ALLI contract set and writes the addresses to deployments/<network>.json.
 *
 *   npx hardhat run scripts/deploy.ts                       # in-process network, smoke test
 *   npx hardhat run scripts/deploy.ts --network bscTestnet  # needs DEPLOYER_PRIVATE_KEY
 *
 * Env (all optional except on mainnet, where the script refuses to guess):
 *   ALLI_TOKEN_ADDRESS   use an existing ALLI instead of deploying AlliToken
 *   USDT_ADDRESS         BSC-USD; on a test network a MockUSDT is deployed when unset
 *   TREASURY_ADDRESS     receives payments and the initial ALLI supply (default: deployer)
 *   BACKEND_SIGNER       voucher / quote signer and shoe minter (default: deployer)
 *   REWARD_DAILY_CAP     ALLI per UTC day RewardClaim may pay (default 100,000)
 *   SHOES_BASE_URI       token metadata base (default https://alli.app/shoes/)
 */
import fs from 'fs';
import path from 'path';
import { ethers, network } from 'hardhat';

const E18 = 10n ** 18n;

async function main() {
  const [deployer] = await ethers.getSigners();
  const mainnet = network.config.chainId === 56;
  const env = (k: string) => process.env[k]?.trim() || undefined;
  if (mainnet) {
    for (const k of ['ALLI_TOKEN_ADDRESS', 'USDT_ADDRESS', 'TREASURY_ADDRESS', 'BACKEND_SIGNER']) {
      if (!env(k)) throw new Error(`${k} must be set explicitly for mainnet.`);
    }
  }

  const treasury = env('TREASURY_ADDRESS') ?? deployer.address;
  const signer = env('BACKEND_SIGNER') ?? deployer.address;
  const cap = BigInt(env('REWARD_DAILY_CAP') ?? '100000') * E18;

  const alli =
    env('ALLI_TOKEN_ADDRESS') ??
    (await (await ethers.deployContract('AlliToken', [treasury, 1_000_000_000n * E18])).getAddress());
  const usdt = env('USDT_ADDRESS') ?? (await (await ethers.deployContract('MockUSDT')).getAddress());

  const rewardClaim = await ethers.deployContract('RewardClaim', [alli, deployer.address, signer, cap]);
  const shoes = await ethers.deployContract('AlliShoes', [
    deployer.address,
    signer,
    env('SHOES_BASE_URI') ?? 'https://alli.app/shoes/',
  ]);
  const router = await ethers.deployContract('PaymentRouter', [deployer.address, signer, treasury, [alli, usdt]]);
  const payout = await ethers.deployContract('ReferralPayout', [deployer.address, signer]);

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    treasury,
    backendSigner: signer,
    contracts: {
      ALLI: alli,
      USDT: usdt,
      RewardClaim: await rewardClaim.getAddress(),
      AlliShoes: await shoes.getAddress(),
      PaymentRouter: await router.getAddress(),
      ReferralPayout: await payout.getAddress(),
    },
  };
  const file = path.join(__dirname, '..', 'deployments', `${network.name === 'hardhat' ? 'hardhat.local' : network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
  console.log(`\nWritten to ${path.relative(process.cwd(), file)}.`);
  console.log('Next: fund RewardClaim and ReferralPayout from the treasury, then set the addresses in server/.env.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
