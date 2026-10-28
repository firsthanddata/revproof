import { useState } from 'react'
import { erc20Abi, keccak256, type Hex } from 'viem'
import { arc } from 'viem/chains'
import { useAccount, useDeployContract, usePublicClient, useReadContract, useSwitchChain, useWaitForTransactionReceipt } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { buildAddressExplorerUrl, buildTxExplorerUrl, getUsdc, requireChain } from '@/onchain-facts'
import { routerAbi } from '@/lib/routerAbi'
import { ROUTER_CREATION_BYTECODE, ROUTER_RUNTIME_BYTECODE } from '@/lib/routerBytecode'
import { CHAIN, IS_MAINNET, ROUTER_ADDRESS } from '@/lib/contract'
import { fmtUsd, parseOnchainError, shortAddress } from '@/lib/format'
import { CopyButton, ExplorerLink, Notice, Spinner } from '@/components/ui'

const MAINNET = requireChain(arc.id)
const MAINNET_USDC = getUsdc(arc.id)
const CREATION_HASH = keccak256(ROUTER_CREATION_BYTECODE as Hex)
const RUNTIME_HASH = keccak256(ROUTER_RUNTIME_BYTECODE as Hex)
const BYTECODE_SIZE = (ROUTER_CREATION_BYTECODE.length - 2) / 2

const MAINNET_WARNING =
  'Warning: Transactions on mainnet involve real funds and, once submitted, are irreversible. Arc Studio may generate or edit code or configuration that references mainnet, but Arc Studio does not deploy to, transact on, sign for, fund, or otherwise interact with mainnet on your behalf. Any code used for mainnet must be independently reviewed, tested, validated, deployed, and operated by you outside of Arc Studio. You are solely responsible for any losses, errors, or other consequences resulting from your use of any code, configuration, or output generated or edited through Arc Studio in connection with mainnet. Before proceeding, you should first use testnet, obtain an independent professional audit, and carefully review all wallet addresses, contract addresses, chain settings, permissions, and other configuration details. Only continue to mainnet after you have completed your independent review and have determined that you want to proceed.'

const CHECKS = [
  'I understand mainnet transactions use real funds and cannot be undone.',
  'I reviewed the contract source and rebuilt the bytecode hashes above myself.',
  'I obtained, or knowingly chose to skip, an independent professional audit.',
]

function Hash({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3">
      <dt className="text-[color:var(--muted)]">{label}</dt>
      <dd className="mono mt-1 break-all text-xs font-medium">{value}</dd>
    </div>
  )
}

function Result({ hash }: { hash: Hex }) {
  const client = usePublicClient({ chainId: arc.id })
  const receipt = useWaitForTransactionReceipt({ hash, chainId: arc.id })
  const address = receipt.data?.contractAddress ?? undefined
  const [codeMatch, setCodeMatch] = useState<'unchecked' | 'checking' | 'match' | 'mismatch'>('unchecked')

  const verify = async () => {
    if (!client || !address) return
    setCodeMatch('checking')
    const code = await client.getCode({ address })
    setCodeMatch(code && keccak256(code) === RUNTIME_HASH ? 'match' : 'mismatch')
  }

  if (receipt.isLoading || !receipt.data) {
    return (
      <div className="card flex items-center gap-3 p-5" aria-live="polite">
        <Spinner /> <span className="font-semibold">Waiting for Arc Mainnet to confirm…</span>
        <ExplorerLink href={buildTxExplorerUrl(arc.id, hash)} className="ml-auto text-sm">
          Transaction
        </ExplorerLink>
      </div>
    )
  }
  if (receipt.data.status !== 'success' || !address) {
    return (
      <Notice tone="error">
        The deployment transaction failed.{' '}
        <ExplorerLink href={buildTxExplorerUrl(arc.id, hash)}>View it on the explorer</ExplorerLink>
      </Notice>
    )
  }

  const block = receipt.data.blockNumber.toString()
  const env = `VITE_MAINNET_ROUTER_ADDRESS=${address}\nVITE_MAINNET_DEPLOY_BLOCK=${block}`
  return (
    <section className="card space-y-4 p-6" aria-live="polite">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-7 w-7 text-[color:var(--success)]" aria-hidden />
        <h2 className="display text-2xl font-semibold">RevenueRouter deployed on Arc Mainnet</h2>
      </div>
      <dl className="divide-y divide-[color:var(--border)] text-sm">
        <div className="flex flex-wrap justify-between gap-2 py-3">
          <dt className="text-[color:var(--muted)]">Contract</dt>
          <dd>
            <ExplorerLink href={buildAddressExplorerUrl(arc.id, address)} className="mono font-semibold">
              {address}
            </ExplorerLink>
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2 py-3">
          <dt className="text-[color:var(--muted)]">Deployment transaction</dt>
          <dd>
            <ExplorerLink href={buildTxExplorerUrl(arc.id, hash)} className="mono font-semibold">
              {shortAddress(hash)}
            </ExplorerLink>
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2 py-3">
          <dt className="text-[color:var(--muted)]">Deployed at block</dt>
          <dd className="num font-semibold">{block}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void verify()} disabled={codeMatch === 'checking'}>
          {codeMatch === 'checking' ? <Spinner /> : null} Check onchain code matches this build
        </button>
        {codeMatch === 'match' && <span className="text-sm font-semibold text-[color:var(--success)]">Onchain code matches the reviewed build.</span>}
        {codeMatch === 'mismatch' && <span className="text-sm font-semibold text-[color:var(--danger)]">Onchain code does NOT match. Do not use this address.</span>}
      </div>
      <div>
        <p className="text-sm font-semibold">Point the app at it</p>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Add these two lines to <span className="mono">.env</span> (or your host's build environment) and rebuild. The whole app then reads and pays on this contract.
        </p>
        <pre className="mono mt-2 overflow-x-auto rounded-xl bg-[color:var(--surface-muted)] p-3 text-xs">{env}</pre>
        <div className="mt-2">
          <CopyButton value={env} label="Copy config lines" />
        </div>
      </div>
    </section>
  )
}

export function Deploy() {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { deployContractAsync, isPending, reset } = useDeployContract()
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false))
  const [hash, setHash] = useState<Hex | null>(null)
  const [error, setError] = useState<string | null>(null)

  const balance = useReadContract({
    address: MAINNET_USDC?.address as Hex,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: arc.id,
    query: { enabled: Boolean(address) && Boolean(MAINNET_USDC) },
  })

  const ready = checked.every(Boolean)
  const wrongChain = isConnected && chainId !== arc.id

  const deploy = async () => {
    setError(null)
    try {
      const tx = await deployContractAsync({
        abi: routerAbi,
        bytecode: ROUTER_CREATION_BYTECODE,
        chainId: arc.id,
      })
      setHash(tx)
    } catch (e) {
      const message = parseOnchainError(e)
      if (message) setError(message)
      reset()
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="eyebrow">Mainnet deployment</p>
        <h1 className="display mt-2 text-balance text-4xl font-bold">Deploy RevenueRouter to Arc Mainnet</h1>
        <p className="mt-3 text-pretty text-[color:var(--ink-2)]">
          You sign the deployment with your own wallet, such as Rabby. This page never holds a key and RevProof does not deploy for you.
        </p>
      </header>

      <div className="rounded-2xl border border-[rgba(186,43,76,0.35)] bg-[rgba(186,43,76,0.05)] p-5">
        <p className="flex items-center gap-2 font-semibold text-[color:var(--danger)]">
          <AlertTriangle className="h-5 w-5" aria-hidden /> Real funds, irreversible
        </p>
        <p className="mt-2 text-sm text-[color:var(--ink-2)]">{MAINNET_WARNING}</p>
      </div>

      <section className="card p-5 sm:p-6">
        <h2 className="display text-xl font-semibold">What you will sign</h2>
        <dl className="mt-2 divide-y divide-[color:var(--border)] text-sm">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-[color:var(--muted)]">Network</dt>
            <dd className="font-semibold">
              {MAINNET.name} (chain ID {MAINNET.chainId})
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-[color:var(--muted)]">RPC</dt>
            <dd className="mono text-xs font-semibold">{MAINNET.rpcUrls[0]}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-[color:var(--muted)]">Transaction</dt>
            <dd className="font-semibold">Contract creation, no constructor arguments, no value</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-[color:var(--muted)]">Creation bytecode</dt>
            <dd className="num font-semibold">{BYTECODE_SIZE.toLocaleString('en-US')} bytes</dd>
          </div>
          <Hash label="Creation bytecode keccak256" value={CREATION_HASH} />
          <Hash label="Runtime bytecode keccak256 (what ends up onchain)" value={RUNTIME_HASH} />
        </dl>
        <div className="mt-3 rounded-xl bg-[color:var(--surface-muted)] p-3 text-xs text-[color:var(--ink-2)]">
          <p className="font-semibold">Verify it yourself</p>
          <p className="mt-1">
            Build <span className="mono">contracts/RevenueRouter.sol</span> with solc 0.8.28, EVM cancun, optimizer 200 runs (the settings in{' '}
            <span className="mono">foundry.toml</span>), then compare:
          </p>
          <pre className="mono mt-2 overflow-x-auto">forge build{'\n'}forge inspect RevenueRouter bytecode | cast keccak</pre>
        </div>
      </section>

      <section className="card space-y-3 p-5 sm:p-6">
        <h2 className="display text-xl font-semibold">Before you continue</h2>
        {CHECKS.map((text, i) => (
          <label key={text} className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 accent-[color:var(--accent)]"
              checked={checked[i]}
              onChange={(e) => setChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))}
            />
            <span>{text}</span>
          </label>
        ))}
      </section>

      {hash ? (
        <Result hash={hash} />
      ) : (
        <section className="card space-y-4 p-5 sm:p-6">
          <h2 className="display text-xl font-semibold">Deploy</h2>
          {isConnected && (
            <p className="text-sm text-[color:var(--muted)]">
              Deployer <span className="mono font-semibold text-[color:var(--ink)]">{shortAddress(address ?? '')}</span>
              {balance.data !== undefined && !wrongChain && (
                <>
                  {' '}
                  holds <span className="num font-semibold text-[color:var(--ink)]">{fmtUsd(balance.data)}</span> USDC on Arc Mainnet. Deployment gas is paid in USDC.
                </>
              )}
            </p>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          {!isConnected ? (
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button type="button" className="btn btn-primary w-full" onClick={show}>
                  Connect wallet
                </button>
              )}
            </ConnectKitButton.Custom>
          ) : wrongChain ? (
            <button type="button" className="btn btn-primary w-full" disabled={switching} onClick={() => switchChain({ chainId: arc.id })}>
              {switching ? <Spinner /> : null} Switch wallet to {MAINNET.name}
            </button>
          ) : (
            <button type="button" className="btn btn-primary w-full" disabled={!ready || isPending} onClick={() => void deploy()}>
              {isPending ? (
                <>
                  <Spinner /> Review and sign in your wallet
                </>
              ) : (
                'Deploy to Arc Mainnet'
              )}
            </button>
          )}
          {!ready && <p className="text-xs text-[color:var(--muted)]">Tick all three boxes to enable deployment.</p>}
        </section>
      )}

      <section className="card p-5 text-sm sm:p-6">
        <h2 className="display text-xl font-semibold">This app right now</h2>
        {IS_MAINNET ? (
          <p className="mt-2">
            Using the mainnet contract{' '}
            <ExplorerLink href={buildAddressExplorerUrl(arc.id, ROUTER_ADDRESS)} className="mono font-semibold">
              {ROUTER_ADDRESS}
            </ExplorerLink>
            . All payments are real USDC.
          </p>
        ) : (
          <p className="mt-2">
            Using the {CHAIN.name} contract{' '}
            <ExplorerLink href={buildAddressExplorerUrl(CHAIN.chainId, ROUTER_ADDRESS)} className="mono font-semibold">
              {ROUTER_ADDRESS}
            </ExplorerLink>
            . No mainnet address is configured yet.
          </p>
        )}
      </section>
    </div>
  )
}
