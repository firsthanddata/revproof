import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, keccak256, stringToBytes, stringToHex, toHex } from 'viem'
import { Amount } from '@/onchain-money'
import { USDC_DECIMALS } from './contract'

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** Formats a raw 6-decimal USDC amount as "$1,234.50". */
export function fmtUsd(raw: bigint, fractionDigits = 2): string {
  const negative = raw < 0n
  const fixed = Amount.fromRaw(negative ? -raw : raw, USDC_DECIMALS).toFixed(fractionDigits)
  const [whole, frac] = fixed.split('.')
  return `${negative ? '-' : ''}$${group(whole)}${frac ? `.${frac}` : ''}`
}

/** Plain USDC figure without the currency symbol, e.g. "1,234.50". */
export function fmtUsdc(raw: bigint, fractionDigits = 2): string {
  return fmtUsd(raw, fractionDigits).replace('$', '')
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

export function fmtDate(seconds: number | bigint): string {
  return new Date(Number(seconds) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateTime(seconds: number | bigint): string {
  return new Date(Number(seconds) * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function timeAgo(seconds: number, now: number): string {
  const diff = Math.max(0, now - seconds)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** Turns an optional order reference into the bytes32 the contract emits. */
export function orderRefToBytes32(ref: string | null | undefined): `0x${string}` {
  const value = (ref ?? '').trim()
  if (!value) return toHex(0, { size: 32 })
  if (stringToBytes(value).length <= 32) return stringToHex(value, { size: 32 })
  return keccak256(stringToBytes(value))
}

export function bytes32ToOrderRef(hex: string): string {
  if (/^0x0+$/.test(hex)) return ''
  try {
    const bytes = Uint8Array.from((hex.slice(2).match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)))
    const end = bytes.indexOf(0) === -1 ? bytes.length : bytes.indexOf(0)
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(0, end))
    return /^[\x20-\x7e]+$/.test(text) ? text : `${hex.slice(0, 10)}…`
  } catch {
    return `${hex.slice(0, 10)}…`
  }
}

const REVERT_MESSAGES: Record<string, string> = {
  IncorrectNativeValue: 'The amount sent does not match the price. Refresh and try again.',
  ProductPaused: 'This product is paused by the merchant right now.',
  ProductNotFound: 'This product does not exist.',
  SelfPayment: 'Merchants cannot pay their own products. Use a different wallet.',
  SlugTaken: 'That URL slug is already taken.',
  InvalidSlug: 'Slugs use 3-32 lowercase letters, numbers and dashes, and cannot start or end with a dash.',
  InvalidName: 'Names must be 1-64 characters.',
  InvalidPayout: 'Enter a valid payout address.',
  InvalidPrice: 'Price must be greater than zero.',
  Unauthorized: 'Only the merchant owner can do this.',
  RefundNewerFirst: 'Refund this customer\'s newer payments first, then this one.',
  AlreadyRefunded: 'This payment was already refunded.',
  NativeTransferFailed: 'The receiving wallet could not accept the transfer.',
}

/** Returns a friendly message, or null when the user simply closed the wallet prompt. */
export function parseOnchainError(error: unknown): string | null {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return null
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      if (name && REVERT_MESSAGES[name]) return REVERT_MESSAGES[name]
    }
    const message = error.shortMessage.toLowerCase()
    if (message.includes('insufficient funds') || message.includes('exceeds the balance')) {
      return 'Not enough USDC to cover the amount plus network fees.'
    }
    if (message.includes('user rejected') || message.includes('denied')) return null
    return error.shortMessage
  }
  const message = error instanceof Error ? error.message : String(error)
  if (/user rejected|denied/i.test(message)) return null
  return 'Something went wrong. Please try again.'
}
