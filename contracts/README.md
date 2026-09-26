# ALLI contracts (BNB Smart Chain)

Five contracts, Solidity 0.8.28 on OpenZeppelin 5, built and tested with Hardhat. The compiler
comes from the npm `solc` package (see `hardhat.config.ts`), so nothing is downloaded at build time.

```bash
cd contracts && npm ci
npm run build          # compile + typechain
npm test               # 22 tests on the in-process network
npm run deploy:local   # smoke-deploy the whole set
npm run abi            # refresh abi/*.json after a change
```

| Contract | What it does | Who calls it | Backend side |
|---|---|---|---|
| `AlliToken` | Fixed-supply BEP-20 + permit + burn; minted once to the treasury, no mint function. Skip it if ALLI is already live and pass `ALLI_TOKEN_ADDRESS`. | — | — |
| `RewardClaim` | Pays ALLI for burned stars against a server-signed EIP-712 voucher `(user, amount, nonce, deadline)`. Sequential nonces, deadline, **daily cap across all users**, pausable, holds a float (cannot mint). `claimFor` lets the relayer pay gas; tokens still go to `user`. | member or relayer | `POST /v1/run/stars/exchange` signs the voucher |
| `PaymentRouter` | Every purchase — run packs, membership, seeds, shoes, market orders. Verifies the server's EIP-712 quote `(id, payer, token, amount, kind, deadline)`, pulls exactly `amount` to the treasury once, emits `Paid`. | payer | `POST /v1/payments/intents` quotes; the chain watcher fulfils on `Paid` |
| `AlliShoes` | ERC-721 run shoes with a tier per token and `highestTier(owner)`. Soulbound until `setTransferable(true)`; `maxTier` can grow (the wireframes draw a Bronze tier). | backend (`MINTER_ROLE`) | mints Leather at sign-up, upgrades after a `shoe` payment |
| `ReferralPayout` | Cumulative Merkle distributor for referral commissions, one root per payout token. Claims pay `cumulative − claimed`, so no double claims and no lost epochs. | member or relayer | publishes roots from the commission ledger |

The EIP-712 type definitions live once, in `src/services/chain/eip712.ts`; the server signs with
them and these tests import them, so the two cannot drift.

## Trust and keys

- **Admin** (`DEFAULT_ADMIN_ROLE`) rotates signers, changes caps and treasury, unpauses and
  withdraws floats. Put it behind a multisig before mainnet.
- **Backend signer** signs vouchers and quotes and mints shoes. A leak is bounded: RewardClaim by
  the daily cap and its float, PaymentRouter can only *receive* money, ReferralPayout by its float.
  `PAUSER_ROLE` can stop RewardClaim, PaymentRouter and ReferralPayout at once.
- Floats are topped up from the treasury; nothing here can create ALLI.

## Deploying to BSC testnet

```bash
export DEPLOYER_PRIVATE_KEY=0x...   # funded with test BNB
export BACKEND_SIGNER=0x...         # the server's signing address
npm run deploy:testnet              # writes deployments/bscTestnet.json
```

Then fund RewardClaim and ReferralPayout, and set the addresses in `server/.env` and the app's
`EXPO_PUBLIC_*` variables. Mainnet refuses to deploy unless every address is set explicitly.

**Not audited.** RewardClaim and PaymentRouter move real funds; get them audited before mainnet.
