import { useEffect, useMemo, useState } from 'react'
import { encodeFunctionData } from 'viem'
import { ShieldCheck } from 'lucide-react'
import type { MerchantRec } from '@/lib/indexer'
import { ROUTER_ADDRESS, RPC_URL, routerAbi } from '@/lib/contract'
import { fmtUsd } from '@/lib/format'
import { buildShareLink } from '@/lib/share'
import { CopyButton } from './ui'

/**
 * A self-contained snippet: no libraries, no RevProof server. It asks the Arc RPC
 * for the contract's own mrr() view when the page loads, so the number is always live.
 */
export function buildBadgeSnippet(merchant: MerchantRec, pageUrl: string): string {
  const data = encodeFunctionData({ abi: routerAbi, functionName: 'mrr', args: [BigInt(merchant.id)] })
  const id = `revproof-${merchant.slug}`
  const rpc = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: ROUTER_ADDRESS, data }, 'latest'] })
  return `<a id="${id}" href="${pageUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid rgba(18,45,69,.14);border-radius:999px;background:#fff;color:#122d45;font:600 13px/1 system-ui,sans-serif;text-decoration:none">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a8047" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
  <span>Verified onchain revenue</span>
  <span data-mrr style="color:#6b6580;font-weight:500">loading</span>
</a>
<script>
(function(){var el=document.querySelector('#${id} [data-mrr]');
fetch('${RPC_URL}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${rpc})})
.then(function(r){return r.json()})
.then(function(j){var cents=Number(BigInt(j.result)/10000n)/100;el.textContent='$'+cents.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' MRR'})
.catch(function(){el.textContent='see revenue'})})();
</script>`
}

export function BadgePreview({ mrr }: { mrr: bigint }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-white px-3.5 py-2.5 text-[13px] font-semibold leading-none">
      <ShieldCheck className="h-4 w-4 text-[color:var(--success)]" aria-hidden />
      <span>Verified onchain revenue</span>
      <span className="num font-medium text-[color:var(--muted)]">{fmtUsd(mrr)} MRR</span>
    </span>
  )
}

export function BadgeEmbed({ merchant, mrr }: { merchant: MerchantRec; mrr: bigint }) {
  const [pageUrl, setPageUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void buildShareLink(`/m/${merchant.slug}`).then((url) => live && setPageUrl(url))
    return () => {
      live = false
    }
  }, [merchant.slug])
  const snippet = useMemo(() => (pageUrl ? buildBadgeSnippet(merchant, pageUrl) : ''), [merchant, pageUrl])

  return (
    <section className="card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="display text-xl font-semibold">Embeddable badge</h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Paste this on your site. It reads your MRR straight from the contract each time the page loads and links to your public revenue page.
        </p>
      </div>
      <div className="grid place-items-center rounded-2xl bg-[color:var(--surface-muted)] p-6">
        <BadgePreview mrr={mrr} />
      </div>
      <textarea
        readOnly
        value={snippet}
        rows={6}
        aria-label="Badge HTML snippet"
        className="field mono h-auto resize-none py-3 text-xs"
        onFocus={(e) => e.currentTarget.select()}
      />
      <CopyButton value={snippet} label="Copy HTML snippet" disabled={!snippet} />
    </section>
  )
}
