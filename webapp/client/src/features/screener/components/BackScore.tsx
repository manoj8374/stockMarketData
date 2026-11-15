import { Fragment } from 'react'
import { formatDate, formatPct, formatPrice, tone } from '../../../common/utils/format'
import type { BackPivot, StockModel } from '../models/StockModel'

export function BackScoreTable({ stock, pivot }: { stock: StockModel; pivot: BackPivot }) {
  const { rows } = stock.backBreakdown(pivot)
  return (
    <div className="bgrid">
      <span className="h">Window</span>
      <span className="h">From</span>
      <span className="h num">Close</span>
      <span className="h num">Return</span>
      {rows.map((r) => (
        <Fragment key={r.label}>
          <span>{r.label}</span>
          <span className="muted">{formatDate(r.date)}</span>
          <span className="num">{formatPrice(r.price)}</span>
          <span className={`num tone ${tone(r.returnPct)}`}>{formatPct(r.returnPct)}</span>
        </Fragment>
      ))}
    </div>
  )
}

interface PanelProps {
  stock: StockModel
  pivot: BackPivot
  value: number | null
  backWeights: Record<number, number>
}

export function BackScorePanel({ stock, pivot, value, backWeights }: PanelProps) {
  const { pivotDate, pivotPrice } = stock.backBreakdown(pivot)
  return (
    <>
      <div className="pop-head">
        <b>
          {stock.symbol} · {pivot}M-back score
        </b>
        <span className={`num tone ${tone(value)}`}>{formatPct(value)}</span>
      </div>
      <p className="pop-sub">
        Scored as if today were {formatDate(pivotDate)} (close ₹{formatPrice(pivotPrice)}).
      </p>
      <BackScoreTable stock={stock} pivot={pivot} />
      <p className="pop-foot">
        Weights 1M / 3M / 6M: {backWeights[1].toFixed(0)}% / {backWeights[3].toFixed(0)}% / {backWeights[6].toFixed(0)}%
      </p>
    </>
  )
}
