import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import StockScreener from './StockScreener'

function BrowseList({ title, subtitle, items, labelKey, onSelect, onBack, loading, error }) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="title-block">
          {onBack && <button className="btn subtle" onClick={onBack}>‹ Back</button>}
          <h1>{title}</h1>
          {subtitle && <span className="muted small">{subtitle}</span>}
        </div>
      </header>

      {error && <div className="banner error">Failed to load: {error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{labelKey === 'sector' ? 'Sector' : 'Industry'}</th>
              <th className="num">Stocks</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={2} className="empty-state">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={2} className="empty-state">Nothing here.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item[labelKey]} className="clickable-row" onClick={() => onSelect(item[labelKey])}>
                  <td className="symbol-cell">{item[labelKey]}</td>
                  <td className="num">{item.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Sector/industry names can contain "/" (e.g. "Automobiles-Trucks/Lcv"), which
// would otherwise be read as a path separator -- encodeURIComponent turns it
// into %2F, which react-router treats as a literal character within a single
// path segment (not a separator) and decodes back to "/" in useParams.
function sectorPath(sector) {
  return `/sectors/${encodeURIComponent(sector)}`
}
function industryPath(sector, industry) {
  return `/sectors/${encodeURIComponent(sector)}/${encodeURIComponent(industry)}`
}

export default function SectorsBrowser({ minMarketCap = 0 }) {
  const { sector, industry } = useParams()
  const navigate = useNavigate()

  const [sectors, setSectors] = useState([])
  const [industries, setIndustries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (sector) return // only needed at the top-level sectors list
    setLoading(true)
    setError(null)
    fetch(`/api/sectors?minMarketCap=${minMarketCap}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed: ${r.status}`)
        return r.json()
      })
      .then((data) => setSectors(data.sectors))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [sector, minMarketCap])

  useEffect(() => {
    if (!sector || industry) return // only needed at the industries-within-a-sector list
    setLoading(true)
    setError(null)
    fetch(`/api/industries?sector=${encodeURIComponent(sector)}&minMarketCap=${minMarketCap}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed: ${r.status}`)
        return r.json()
      })
      .then((data) => setIndustries(data.industries))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [sector, industry, minMarketCap])

  if (sector && industry) {
    return (
      <StockScreener
        fixedSector={sector}
        fixedIndustry={industry}
        minMarketCap={minMarketCap}
        onBack={() => navigate(sectorPath(sector))}
      />
    )
  }

  if (sector) {
    return (
      <BrowseList
        title={sector}
        subtitle="Select an industry to see its stocks"
        items={industries}
        labelKey="industry"
        onSelect={(i) => navigate(industryPath(sector, i))}
        onBack={() => navigate('/sectors')}
        loading={loading}
        error={error}
      />
    )
  }

  return (
    <BrowseList
      title="Sectors"
      subtitle="Select a sector to see its industries"
      items={sectors}
      labelKey="sector"
      onSelect={(s) => navigate(sectorPath(s))}
      loading={loading}
      error={error}
    />
  )
}
