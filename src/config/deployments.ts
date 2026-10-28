/**
 * Where RevenueRouter lives. The app reads ONE network at a time:
 *
 * - Arc Mainnet when VITE_MAINNET_ROUTER_ADDRESS is set (real USDC).
 * - Arc Testnet otherwise.
 *
 * To go live on mainnet: deploy from the /deploy page with your own wallet, then put the
 * address and block shown there into .env (or your host's build environment), rebuild, and
 * the whole app switches to the mainnet contract. Leave both empty to stay on testnet.
 */
export const TESTNET_ROUTER_ADDRESS: string | undefined = import.meta.env.VITE_ROUTER_ADDRESS
export const TESTNET_DEPLOY_BLOCK: string | undefined = import.meta.env.VITE_ROUTER_DEPLOY_BLOCK

export const MAINNET_ROUTER_ADDRESS: string = (import.meta.env.VITE_MAINNET_ROUTER_ADDRESS ?? '').trim()
export const MAINNET_DEPLOY_BLOCK: string = (import.meta.env.VITE_MAINNET_DEPLOY_BLOCK ?? '').trim()
