import { observer } from 'mobx-react-lite'
import { formatPrice } from '../../../common/utils/format'
import type { TickModel } from '../models/TickModel'

// The span is re-keyed on every price change, so React remounts it and the
// CSS flash animation plays again.
export const LivePrice = observer(function LivePrice({ tick }: { tick: TickModel | undefined }) {
  if (!tick) return <span className="muted">—</span>
  return (
    <span key={tick.version} className={`live-price ${tick.direction ? `flash-${tick.direction}` : ''}`}>
      {formatPrice(tick.ltp)}
    </span>
  )
})
