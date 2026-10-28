import { useCallback, useState } from 'react'
import type { Hex } from 'viem'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { CHAIN_ID } from './contract'
import { parseOnchainError } from './format'
import { useIndexer } from './IndexerProvider'

/**
 * Runs one RevenueRouter write: switches network if needed, waits for the receipt,
 * re-reads onchain history, and reports a friendly result. Returns true on success.
 */
export function useRouterTx() {
  const { writeContractAsync: write } = useWriteContract()
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const client = usePublicClient({ chainId: CHAIN_ID })
  const { refresh } = useIndexer()
  const [busy, setBusy] = useState(false)

  const run = useCallback(
    async (start: () => Promise<Hex>, success: string): Promise<boolean> => {
      setBusy(true)
      try {
        if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
        const hash = await start()
        const receipt = await client?.waitForTransactionReceipt({ hash })
        if (receipt && receipt.status !== 'success') throw new Error('Transaction reverted')
        await refresh()
        toast.success(success)
        return true
      } catch (error) {
        const message = parseOnchainError(error)
        if (message) toast.error(message)
        return false
      } finally {
        setBusy(false)
      }
    },
    [chainId, client, refresh, switchChainAsync],
  )

  return { write, run, busy }
}
