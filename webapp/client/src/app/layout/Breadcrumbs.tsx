import { Link } from 'react-router-dom'
import { Icon } from '../../common/components'
import { sectorPath } from '../../common/utils/format'

const TITLES: Record<string, string> = {
  '/': 'Screener',
  '/industries': 'Industry momentum',
  '/watchlist': 'Watchlist',
  '/option-chain': 'Option chain',
  '/portfolio': 'Portfolio',
}

function safeDecode(segment: string) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function Breadcrumbs({ pathname }: { pathname: string }) {
  if (!pathname.startsWith('/sectors')) return <b>{TITLES[pathname] ?? 'Screener'}</b>

  const [sector, industry] = pathname.split('/').slice(2).filter(Boolean).map(safeDecode)
  if (!sector) return <b>Sectors</b>
  return (
    <>
      <Link to="/sectors">Sectors</Link>
      <Icon name="chevronRight" />
      {industry ? <Link to={sectorPath(sector)}>{sector}</Link> : <b>{sector}</b>}
      {industry && (
        <>
          <Icon name="chevronRight" />
          <b>{industry}</b>
        </>
      )}
    </>
  )
}
