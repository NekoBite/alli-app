import '@nomicfoundation/hardhat-toolbox';
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from 'hardhat/builtin-tasks/task-names';
import { subtask, type HardhatUserConfig } from 'hardhat/config';

const SOLC_VERSION = '0.8.28';

/**
 * Compile with the solc build from npm instead of downloading one from binaries.soliditylang.org,
 * so builds work offline and in sandboxes that block that host. The npm version is pinned to
 * SOLC_VERSION in package.json; a mismatch fails loudly rather than compiling with the wrong one.
 */
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
  if (args.solcVersion !== SOLC_VERSION) return runSuper();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const solc = require('solc');
  const longVersion = solc.version() as string;
  if (!longVersion.startsWith(SOLC_VERSION)) {
    throw new Error(`npm solc is ${longVersion}; expected ${SOLC_VERSION}`);
  }
  return { compilerPath: require.resolve('solc/soljson.js'), isSolcJs: true, version: SOLC_VERSION, longVersion };
});

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: SOLC_VERSION,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // BSC has supported Cancun opcodes since the Tycho hard fork (2024).
      evmVersion: 'cancun',
    },
  },
  paths: { sources: './src' },
  networks: {
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL ?? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
      chainId: 97,
      accounts,
    },
    bsc: {
      url: process.env.BSC_RPC_URL ?? 'https://bsc-dataseed.bnbchain.org',
      chainId: 56,
      accounts,
    },
  },
  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY ?? '',
  },
  gasReporter: { enabled: process.env.REPORT_GAS === '1', currency: 'USD' },
};

export default config;
