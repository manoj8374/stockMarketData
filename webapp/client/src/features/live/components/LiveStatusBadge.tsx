import { observer } from 'mobx-react-lite'
import { useStores } from '../../../app/useStores'
import { liveStatusLabel } from '../models/liveStatus'

export const LiveStatusBadge = observer(function LiveStatusBadge() {
  const { live } = useStores()
  const label = liveStatusLabel(live.status, live.feedMode, live.feed?.state, live.retryInMs)
  if (!label) return null
  return (
    <span className={`live-badge live-${label.tone}`} role="status" title={live.feed?.message ?? label.text}>
      <i aria-hidden="true" />
      {label.text}
    </span>
  )
})
