import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPublicClient, http } from 'viem'
import { CHAIN_ID, DEPLOY_BLOCK, NETWORK, ROUTER_ADDRESS, RPC_URL } from './contract'
import { EMPTY_DERIVED, decodeLogs, derive, fetchLogs, type Derived, type RouterLog } from './indexer'

type Status = 'syncing' | 'live' | 'error'

interface IndexerValue {
  data: Derived
  status: Status
  /** True once the first full scan from the deployment block has finished. */
  ready: boolean
  syncedBlock: bigint
  headBlock: bigint
  refresh: () => Promise<void>
}

const client = createPublicClient({ chain: NETWORK, transport: http(RPC_URL, { batch: true }) })
const Ctx = createContext<IndexerValue | null>(null)

// Scanned history is cached in the browser so a page load only asks the RPC for new blocks.
const CACHE_KEY = `revproof:v1:${CHAIN_ID}:${ROUTER_ADDRESS.toLowerCase()}:${DEPLOY_BLOCK}`
const POLL_MS = 8000
const MAX_BACKOFF_MS = 60_000

function loadCache(): { cursor: bigint; logs: RouterLog[] } | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw, (_key, value: unknown) =>
      value && typeof value === 'object' && '__big' in value ? BigInt((value as { __big: string }).__big) : value,
    ) as { cursor: bigint; logs: RouterLog[] }
    return parsed.cursor >= DEPLOY_BLOCK - 1n ? parsed : null
  } catch {
    return null
  }
}

function saveCache(cursor: bigint, logs: RouterLog[]) {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ cursor, logs }, (_key, value: unknown) => (typeof value === 'bigint' ? { __big: value.toString() } : value)),
    )
  } catch {
    // Storage full or unavailable: the app still works, it just rescans next time.
  }
}

/** Reads every RevenueRouter event from the deployment block onward and keeps it fresh. */
export function IndexerProvider({ children }: { children: ReactNode }) {
  const [cached] = useState(loadCache)
  const logs = useRef<RouterLog[]>(cached?.logs ?? [])
  const cursor = useRef<bigint>(cached?.cursor ?? DEPLOY_BLOCK - 1n)
  const inflight = useRef<Promise<void> | null>(null)
  const delay = useRef(POLL_MS)
  const [data, setData] = useState<Derived>(() => (cached ? derive(cached.logs) : EMPTY_DERIVED))
  const [status, setStatus] = useState<Status>('syncing')
  const [ready, setReady] = useState(false)
  const [syncedBlock, setSynced] = useState<bigint>(DEPLOY_BLOCK - 1n)
  const [headBlock, setHead] = useState<bigint>(DEPLOY_BLOCK)

  const refresh = useCallback((): Promise<void> => {
    if (inflight.current) return inflight.current
    const run = (async () => {
      try {
        const head = await client.getBlockNumber()
        setHead(head)
        if (head > cursor.current) {
          const raw = await fetchLogs(client, cursor.current + 1n, head, (scanned) => setSynced(scanned))
          const decoded = decodeLogs(raw)
          if (decoded.length > 0) {
            logs.current = [...logs.current, ...decoded]
            setData(derive(logs.current))
          }
          cursor.current = head
          saveCache(head, logs.current)
        }
        setSynced(head)
        setStatus('live')
        setReady(true)
        delay.current = POLL_MS
      } catch {
        setStatus('error')
        delay.current = Math.min(delay.current * 2, MAX_BACKOFF_MS)
      } finally {
        inflight.current = null
      }
    })()
    inflight.current = run
    return run
  }, [])

  useEffect(() => {
    let stopped = false
    let timer: number | undefined
    const loop = async () => {
      if (document.visibilityState === 'visible') await refresh()
      if (!stopped) timer = window.setTimeout(() => void loop(), delay.current)
    }
    void loop()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [refresh])

  const value = useMemo(
    () => ({ data, status, ready, syncedBlock, headBlock, refresh }),
    [data, status, ready, syncedBlock, headBlock, refresh],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useIndexer(): IndexerValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useIndexer must be used inside IndexerProvider')
  return value
}

/** Current unix time in seconds, refreshed on an interval. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
