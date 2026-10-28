import { IndexerProvider } from '@/lib/IndexerProvider'
import { Link, useLocation } from '@/lib/nav'
import { Layout } from '@/components/Layout'
import { EmptyState } from '@/components/ui'
import { Home } from '@/pages/Home'
import { LeaderboardPage } from '@/pages/LeaderboardPage'
import { MerchantPage } from '@/pages/MerchantPage'
import { Checkout } from '@/pages/Checkout'
import { Dashboard } from '@/pages/Dashboard'
import { Deploy } from '@/pages/Deploy'

function NotFound() {
  return (
    <div className="card mx-auto max-w-lg">
      <EmptyState
        title="Page not found"
        body="That page does not exist."
        action={
          <Link to="/" className="btn btn-ghost">
            Back home
          </Link>
        }
      />
    </div>
  )
}

function Routes() {
  const { path } = useLocation()
  const clean = path.replace(/\/+$/, '') || '/'

  if (clean === '/') return <Home />
  if (clean === '/leaderboard') return <LeaderboardPage />
  if (clean === '/dashboard') return <Dashboard />
  if (clean === '/deploy') return <Deploy />

  const merchant = /^\/m\/([a-z0-9-]+)$/.exec(clean)
  if (merchant) return <MerchantPage key={merchant[1]} slug={merchant[1]} />

  const pay = /^\/pay\/(\d+)$/.exec(clean)
  if (pay) return <Checkout key={pay[1]} productId={Number(pay[1])} />

  return <NotFound />
}

export default function App() {
  return (
    <IndexerProvider>
      <Layout>
        <Routes />
      </Layout>
    </IndexerProvider>
  )
}
