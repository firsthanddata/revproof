# RevProof

**Verified USDC revenue for businesses paid on Arc.**

Built with [Arc Studio](https://studio.arc.io)

**Demo video:** [Watch the walkthrough](https://drive.google.com/file/d/1qQ_EcGNpOl9iOclJSb-qq0nb7NOjc-ma/view?usp=sharing)

## What it is, and why it matters

Buyers, investors and customers want proof that a business really earns what it says. Sites like TrustMRR provide that proof, but only for startups paid through Stripe-like processors, because that is the data they can verify. Founders paid in USDC have no trusted way to show their revenue.

RevProof fixes that. A business accepts USDC through a payment link, and the payment goes through a small contract that forwards the money straight to the business's own wallet and records the payment as a public event. A public revenue page then computes every number (total revenue, last 30 days, MRR, customers, refunds) from those events alone. Each number links to the transactions behind it, so anyone can check it without trusting RevProof or the business.

## What you can do

- **Accept USDC:** register a business, create one-time or monthly products and share a payment link per product. Add `?ref=order-123` to a link to attach your own order reference to the receipt.
- **Pay in one transaction:** customers connect a wallet, pay, and get a receipt with an Arc explorer link. There is no approval step.
- **Manage the business:** a dashboard to create and edit products, pause them, copy payment links, view metrics, issue refunds and change the payout wallet.
- **Prove revenue publicly:** every business gets a page at `/m/<slug>` with revenue, last 30 days, MRR from active monthly plans, paying customers, refunds, a monthly chart and recent payments.
- **Embed a badge:** a "Verified onchain revenue" badge, as a copy-paste HTML snippet that shows live MRR read straight from the contract.
- **Compare:** a public leaderboard ranks businesses by verified MRR.

## How it works

**The contract (`RevenueRouter`)** has no admin keys, no platform fee and no upgrade path, and it never holds funds.

- Merchants register a name, a URL slug and a payout address, then create products with a USDC price and a billing type (one-time or monthly).
- On Arc, USDC is the native token, so `pay()` is a payable call. The customer sends the exact price in one transaction and the contract forwards it to the merchant's payout wallet in the same call. Every payment emits an event with merchant, product, payer, amount, a paid-until time for monthly plans and the order reference.
- Monthly plans run 30 days per payment. Paying early extends from the current end date. Only paid-up monthly plans count toward MRR.
- Merchants can refund a payment through the contract. They fund it from their own wallet and the contract forwards it to the payer, with a Refund event.
- Products can be paused. Only the merchant owner can edit products, pause them or refund. The owner and payout wallets cannot pay their own products.
- Arc's transaction Memo contract cannot carry native value, so the order reference is a normal argument of `pay()` and is emitted in the Payment event instead.

**The app** reads the contract's events from the deployment block onward, replays them, and computes every figure in the browser. The MRR card also cross-checks itself against the contract's own `mrr()` view. Nothing is stored on a RevProof server.

## How Arc Studio was used

The whole project was built in Arc Studio from one product description.

- **Contract:** written from the spec, with the decision to use Arc's native-USDC payment model.
- **Tests:** 117 Foundry tests pass (113 unit and fuzz tests plus 4 invariants). They cover registration, product creation, forwarding and events, monthly paid-until logic, MRR excluding one-time products and expired plans, every refund order across three consecutive periods, paused products and owner-only permissions. The invariants check the contract never holds a balance.
- **Security reviews:** a balanced security review of the contract, followed by a static analysis scan (Slither, nothing actionable). The review found a bug where refunding monthly periods out of order could leave refunded time active. It was fixed and then re-checked with a second review and a fresh third pass, which found no further code issues.
- **End-to-end run on Arc Testnet:** a live script with two wallets registers a business, creates products, pays, refunds, then checks that the replayed numbers equal the contract's views and the badge.
- **App:** checkout, dashboard, public revenue pages, leaderboard, badge and the mainnet deploy page.

## Arc Testnet deployment

| | |
|---|---|
| Network | Arc Testnet (chain ID 5042002) |
| RevenueRouter | [`0xac52e885bca21a3a7809ad7270c78530ba84db08`](https://explorer.testnet.arc.io/address/0xac52e885bca21a3a7809ad7270c78530ba84db08) |
| Deployment transaction | [`0x7d53375448ff8c086b02bbe9ebf92f106b1574732d1e6140dce45dcf89358ff0`](https://explorer.testnet.arc.io/tx/0x7d53375448ff8c086b02bbe9ebf92f106b1574732d1e6140dce45dcf89358ff0) (block 69346790) |

### End-to-end run transactions

Business `e2e-mvry2jly`: a 2 USDC one-time product and a 3 USDC monthly product, paid from a second wallet, then the one-time payment refunded. Result right after the run: 5 USDC received, 2 USDC refunded, 3 USDC net, MRR 3 USDC, 1 paying customer, and the badge showed `$3.00 MRR`. Later browser checks of the checkout and dashboard added a few more small test payments and products to the same business.

| Step | Transaction |
|---|---|
| Register business | [`0x2b5331f2…f33f57`](https://explorer.testnet.arc.io/tx/0x2b5331f2c40db72ff015b276fbb96c333f7cc4de967f3a5ce1d76bcc58f33f57) |
| Create one-time product | [`0xa2013549…8763cf`](https://explorer.testnet.arc.io/tx/0xa201354926ad7476bb601d2e67f6d5521934335b7c2f053b6ec33c44b38763cf) |
| Create monthly product | [`0x0296e967…174cd0`](https://explorer.testnet.arc.io/tx/0x0296e967b9210f949bce3de2ed3136f8a64b0b9bcf3f6aa92693ff4591174cd0) |
| Pay one-time (ref `e2e-order-1`) | [`0x8caf6af0…967939`](https://explorer.testnet.arc.io/tx/0x8caf6af0786578ba5e992821e79b0b0cbcc4d71d5f641dd7ae6edd01fb967939) |
| Pay monthly (ref `e2e-order-2`) | [`0xd1a6a9cc…a01d0`](https://explorer.testnet.arc.io/tx/0xd1a6a9cc15928d9ece5b650f8af4240ce7cad1251915867926eeff1a644a01d0) |
| Refund the one-time payment | [`0x201d64ec…7d3c1b`](https://explorer.testnet.arc.io/tx/0x201d64ecadcf2292a7133aeab356b28d2b25b09646097330a86afb2e3e7d7c1b) |

## Known limitations

- **"Verified" means the USDC moved onchain, not that the payer is independent.** The owner and payout wallets cannot pay their own products, but a founder could pay from a separate wallet. That costs real USDC and fees, and the revenue page shows the customer count and the largest payer's share so readers can judge.
- **Some customers cannot be refunded.** Refunds go straight to the paying wallet. If that wallet is a contract that rejects USDC, or is blocklisted on Arc, the refund cannot be made through the contract and the payment stays counted as revenue. This is a deliberate design choice. Refunds of an unexpired monthly plan must also go newest first.
- **Monthly plans are prepaid, not automatic.** Customers renew by paying again. The contract never pulls money.
- **Not independently audited, and now on mainnet.** The app moves real USDC. The contract has had automated security reviews and static analysis only, with no independent professional audit yet. The app reads one network at a time.

## Mainnet

RevProof runs on **Arc Mainnet** (chain ID 5042) with real USDC. The owner deployed RevenueRouter from the app's `/deploy` page by signing with their own wallet. Arc Studio did not deploy to or send transactions on mainnet.

| | |
|---|---|
| Mainnet RevenueRouter | [`0xd640457144bf3a8736fa885e7f39b78e8948c327`](https://explorer.arc.io/address/0xd640457144bf3a8736fa885e7f39b78e8948c327) |
| Deployment transaction | [`0x80039a0f8d8376e7e029f534b00346aa18ef8259726ad116f4026ab8857b57c3`](https://explorer.arc.io/tx/0x80039a0f8d8376e7e029f534b00346aa18ef8259726ad116f4026ab8857b57c3) |
| Deployed at block | 28307164 |
| Deployer | [`0x8dc5730e440b7947750567edfb7f88af135f3602`](https://explorer.arc.io/address/0x8dc5730e440b7947750567edfb7f88af135f3602) |
| Runtime bytecode keccak256 | `0x6ba27cd67f0b1c2a09cb18da0f356707eb20e75f50c83380ddea4c0475bc2a0f` |

The onchain runtime bytecode hash above matches the reviewed build in this repository (`forge build`, then `forge inspect RevenueRouter deployedBytecode | cast keccak`), and the `/deploy` page shows the same hash. The testnet contract above stays available for testing, but the app now reads and pays on mainnet only.

### First real payment on mainnet

The first business on the mainnet contract is `firsthand-data`, and its first sale was a 1 USDC test purchase of "Job data feed (monthly)" from a second wallet. The purchase went through the deployed RevenueRouter in a single transaction, and the USDC was forwarded to the business's payout wallet in the same transaction.

| Step | Transaction | Block |
|---|---|---|
| Business registration | [`0x3579c106d40129323ddfef3bf2e823bddd560814677dc27948c0a6351846529a`](https://explorer.arc.io/tx/0x3579c106d40129323ddfef3bf2e823bddd560814677dc27948c0a6351846529a) | 28309518 |
| Product creation, "Job data feed (monthly)" | [`0x59a007393956ca8c9499e0b1e399c68a2af2053a1df362bbc5839d022f0900d8`](https://explorer.arc.io/tx/0x59a007393956ca8c9499e0b1e399c68a2af2053a1df362bbc5839d022f0900d8) | 28338883 |
| First purchase, 1 USDC (second wallet) | [`0xe2cb752a7c8bf144ccc079d746a9d05f24c6bcf5e57b270c458820f27733e87f`](https://explorer.arc.io/tx/0xe2cb752a7c8bf144ccc079d746a9d05f24c6bcf5e57b270c458820f27733e87f) | 28348133 |

Public revenue page for this business: https://creative-squirrel-17ca20.netlify.app/m/firsthand-data

The app picks its network from the environment. With `VITE_MAINNET_ROUTER_ADDRESS` and `VITE_MAINNET_DEPLOY_BLOCK` set it runs on Arc Mainnet, and with both empty it falls back to Arc Testnet.

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://getfoundry.sh).

```bash
bun install
bun run dev
```

```bash
bun run check            # lint and typecheck
bun run contracts:build  # compile the contract
bun run contracts:test   # run the 117 contract tests
```

### Environment variables

All values are public.

- `VITE_ROUTER_ADDRESS`: the Arc Testnet RevenueRouter address (used when no mainnet address is set).
- `VITE_ROUTER_DEPLOY_BLOCK`: the block it was deployed at. The app never reads history before it.
- `VITE_MAINNET_ROUTER_ADDRESS`: when set, the whole app uses this Arc Mainnet contract and real USDC. Currently `0xd640457144bf3a8736fa885e7f39b78e8948c327`.
- `VITE_MAINNET_DEPLOY_BLOCK`: required with the mainnet address. Currently `28307164`.

Restart the dev server after changing `.env`. On a host such as Netlify or Vercel, set the same names in the build environment.

### Live end-to-end test

`contracts/test-integration/e2e-testnet.ts` runs the testnet flow above with two throwaway wallets whose keys it reads from `/tmp`. It refuses to run while a mainnet address is configured; clear the two `VITE_MAINNET_*` values first.
