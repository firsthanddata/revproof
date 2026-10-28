import type { ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { ShieldCheck } from 'lucide-react'
import { clsx } from 'clsx'
import { Link, useLocation } from '@/lib/nav'
import { useIndexer } from '@/lib/IndexerProvider'
import { CHAIN, IS_MAINNET, ROUTER_ADDRESS, routerUrl } from '@/lib/contract'
import { shortAddress } from '@/lib/format'

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="RevProof home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--accent)] text-white">
        <ShieldCheck className="h-5 w-5" aria-hidden />
      </span>
      <span className="display text-xl font-bold">RevProof</span>
    </Link>
  )
}

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const { path } = useLocation()
  const active = path === to || path.startsWith(`${to}/`)
  return (
    <Link
      to={to}
      className={clsx(
        'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
        active ? 'bg-[color:var(--surface-muted)] text-[color:var(--ink)]' : 'text-[color:var(--muted)] hover:text-[color:var(--ink)]',
      )}
    >
      {children}
    </Link>
  )
}

function WalletButton() {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show, address }) => (
        <button type="button" onClick={show} className={clsx('btn btn-sm', isConnected ? 'btn-ghost' : 'btn-primary')}>
          {isConnected && address ? <span className="mono">{shortAddress(address)}</span> : 'Connect wallet'}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}

function SyncStatus() {
  const { status, ready, syncedBlock, headBlock } = useIndexer()
  const remaining = headBlock > syncedBlock ? headBlock - syncedBlock : 0n
  let text = `Live from ${CHAIN.name}, block ${syncedBlock.toLocaleString('en-US')}`
  if (status === 'error') text = `Could not reach ${CHAIN.name}. Retrying.`
  else if (!ready) text = `Reading onchain history, ${remaining.toLocaleString('en-US')} blocks to go`
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={clsx(
          'h-2 w-2 rounded-full',
          status === 'error' ? 'bg-[color:var(--danger)]' : ready ? 'bg-[color:var(--success)]' : 'bg-[#c98a00] animate-pulse',
        )}
        aria-hidden
      />
      <span className="num">{text}</span>
    </span>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[rgba(255,255,255,0.8)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 sm:h-16 sm:flex-nowrap sm:py-0">
          <Brand />
          <nav className="order-last -mx-2 flex w-full items-center gap-1 sm:order-none sm:mx-0 sm:w-auto" aria-label="Main">
            <NavLink to="/leaderboard">Leaderboard</NavLink>
            <NavLink to="/dashboard">Dashboard</NavLink>
          </nav>
          <WalletButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-10">{children}</main>
      <footer className="border-t border-[color:var(--border)] px-4 py-6 pb-20 text-xs text-[color:var(--muted)]">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <SyncStatus />
          <span>
            Every figure is computed from events of the{' '}
            <a href={routerUrl} target="_blank" rel="noopener noreferrer" className="link mono">
              {shortAddress(ROUTER_ADDRESS)}
            </a>{' '}
            contract. {IS_MAINNET ? 'Real USDC on Arc Mainnet.' : 'Testnet USDC only.'}{' '}
            <Link to="/deploy" className="link">
              Deploy your own
            </Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
