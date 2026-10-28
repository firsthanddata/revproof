import { arc, arcTestnet } from 'viem/chains'
import { getAddress, type Address } from 'viem'
import { buildAddressExplorerUrl, buildTxExplorerUrl, getUsdc, requireChain } from '@/onchain-facts'
import { usdcDecimalsFor } from '@/onchain-money'
import {
  MAINNET_DEPLOY_BLOCK,
  MAINNET_ROUTER_ADDRESS,
  TESTNET_DEPLOY_BLOCK,
  TESTNET_ROUTER_ADDRESS,
} from '@/config/deployments'

export { routerAbi } from './routerAbi'

/** True once a mainnet RevenueRouter address is configured. Everything then runs on real USDC. */
export const IS_MAINNET = MAINNET_ROUTER_ADDRESS !== ''
export const NETWORK = IS_MAINNET ? arc : arcTestnet

/** The chain RevProof currently reads from and pays on. */
export const CHAIN_ID = NETWORK.id
export const CHAIN = requireChain(CHAIN_ID)
export const USDC_ADDRESS = getUsdc(CHAIN_ID)?.address as Address
export const USDC_DECIMALS = usdcDecimalsFor(CHAIN_ID)
export const RPC_URL = CHAIN.rpcUrls[0]

const rawAddress = IS_MAINNET ? MAINNET_ROUTER_ADDRESS : TESTNET_ROUTER_ADDRESS
if (!rawAddress) throw new Error('VITE_ROUTER_ADDRESS is not set')
export const ROUTER_ADDRESS: Address = getAddress(rawAddress)

const rawBlock = IS_MAINNET ? MAINNET_DEPLOY_BLOCK : TESTNET_DEPLOY_BLOCK
if (!rawBlock) throw new Error(IS_MAINNET ? 'VITE_MAINNET_DEPLOY_BLOCK is not set' : 'VITE_ROUTER_DEPLOY_BLOCK is not set')
/** First block that can contain RevenueRouter events. The indexer never scans before it. */
export const DEPLOY_BLOCK = BigInt(rawBlock)

export const MONTH_SECONDS = 30 * 24 * 60 * 60

export const txUrl = (hash: string) => buildTxExplorerUrl(CHAIN_ID, hash)
export const addressUrl = (address: string) => buildAddressExplorerUrl(CHAIN_ID, address)
export const routerUrl = addressUrl(ROUTER_ADDRESS)

export type Billing = 0 | 1
export const BILLING_LABEL: Record<Billing, string> = { 0: 'One-time', 1: 'Monthly' }
