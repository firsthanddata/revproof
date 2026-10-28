# RevProof

> Built with Arc Studio - money-powered apps in minutes

Project memory for future agents and humans.

---

## What This App Does

Verified USDC revenue for businesses paid on Arc (think TrustMRR for stablecoin payments). Merchants register, create one-time or monthly products and share payment links. Customers pay in ONE transaction; the contract forwards the USDC to the merchant payout address and emits an event. Public revenue pages, the leaderboard and the embeddable badge are computed only from those events.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS (Arc Light tokens in `src/index.css`), tiny history-based router in `src/lib/nav.tsx`
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. `contracts/RevenueRouter.sol`, tests in `contracts/test/RevenueRouter.*.t.sol` (117 passing). `bun run contracts:build`, `bun run contracts:test`.
- Chain: Arc Testnet (5042002). Facts come from `@/onchain-facts`.

## Deployments

- RevenueRouter on Arc Testnet: `0xac52e885bca21a3a7809ad7270c78530ba84db08`
- Deploy tx: `0x7d53375448ff8c086b02bbe9ebf92f106b1574732d1e6140dce45dcf89358ff0`, block 69346790
- Stored in `.env` as `VITE_ROUTER_ADDRESS` and `VITE_ROUTER_DEPLOY_BLOCK` (restart Vite after changing).

## Design decisions

- Arc USDC is the native gas token. `pay()` and `refund()` are payable and need `msg.value == price * 1e12` (price and event amounts are 6-decimal USDC units). No approve, permit or transferFrom, so one customer transaction. Use `usdcToGasToken` from `@/onchain-money` for the value.
- Arc's Memo contract is not used: `Memo.memo` is nonpayable, so it cannot carry native value. The order reference is a first-class `orderRef` argument of `pay()` and is emitted in the Payment event. Checkout links accept `?ref=order-123`.
- Monthly = 30 days per payment, renewals extend from the current expiry. Refunding the newest unexpired period rolls the expiry back; older unexpired periods must be refunded newest-first (`RefundNewerFirst`).
- Owner and payout wallet cannot pay their own products. A founder can still pay from a separate wallet; the revenue page shows customer count and largest-payer share.
- Refunds to payers that reject native value or are blocklisted revert (documented limitation).
- Frontend indexer (`src/lib/IndexerProvider.tsx`) scans logs from `VITE_ROUTER_DEPLOY_BLOCK` in bounded ranges, then polls. `src/lib/indexer.ts` replays events, `src/lib/metrics.ts` computes numbers. `scripts/replay-check.ts` sanity-checks the replay.
- The badge snippet is self-contained HTML that calls the contract's `mrr()` view over RPC.

## Key Files

- `src/App.tsx` - routes: `/`, `/leaderboard`, `/dashboard`, `/m/:slug`, `/pay/:productId`
- `src/pages/` - Home, LeaderboardPage, MerchantPage, Checkout, Dashboard
- `src/components/` - MetricsGrid, RevenueChart, PaymentsTable, ProductsManager, BadgeEmbed, RefundButton, ...
- `src/lib/` - contract constants, indexer, metrics, formatting, share-link helpers

## To Run

```bash
bun install
bun run dev
```

## Mainnet

- `/deploy` (`src/pages/Deploy.tsx`) lets the owner deploy RevenueRouter to Arc Mainnet (5042) by signing with their own wallet. Arc Studio never deploys to mainnet. Bytecode is in `src/lib/routerBytecode.ts` (regenerate from `contracts/out` if the contract changes).
- Network selection: `src/config/deployments.ts` + `src/lib/contract.ts`. If `VITE_MAINNET_ROUTER_ADDRESS` and `VITE_MAINNET_DEPLOY_BLOCK` are set, the whole app switches to mainnet; otherwise testnet.
- Indexer caches scanned logs in localStorage and backs off on RPC rate limits (429).

## Testing

- Live testnet end-to-end: `contracts/test-integration/e2e-testnet.ts` (throwaway wallets read from /tmp, registers, pays, refunds, then compares the app's replay with the contract's `mrr()` and the badge snippet). Last run passed on Arc Testnet.
- Hosting: `public/_redirects` and `vercel.json` provide the SPA fallback so `/m/:slug` and `/pay/:id` links work when opened directly.

## Hosting

- Netlify: https://creative-squirrel-17ca20.netlify.app (static build of `dist`). Netlify access control may need to be set to Open for public visitors.
