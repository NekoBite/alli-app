/**
 * Writes the ABIs the app and server call into abi/*.json (human-readable fragments), so a
 * contract change shows up as a diff next to the code that calls it.
 */
import fs from 'fs';
import path from 'path';
import { artifacts, ethers } from 'hardhat';

const CONTRACTS = ['AlliToken', 'RewardClaim', 'AlliShoes', 'PaymentRouter', 'ReferralPayout'];

async function main() {
  const dir = path.join(__dirname, '..', 'abi');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of CONTRACTS) {
    const { abi } = await artifacts.readArtifact(name);
    const human = new ethers.Interface(abi).format();
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(human, null, 2) + '\n');
    console.log(`abi/${name}.json  (${human.length} fragments)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
