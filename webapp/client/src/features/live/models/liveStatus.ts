export function liveStatusLabel(
  status: string,
  feedMode: string | null,
  feedState: string | undefined,
  retryInMs: number | null
) {
  switch (status) {
    case 'open':
      if (feedState === 'down') return { tone: 'down', text: 'Kite feed down' }
      if (feedState === 'connecting') return { tone: 'warn', text: 'Kite reconnecting' }
      return feedMode === 'simulated' ? { tone: 'warn', text: 'Simulated prices' } : { tone: 'up', text: 'Live' }
    case 'connecting':
      return { tone: 'warn', text: 'Connecting…' }
    case 'reconnecting':
      return { tone: 'warn', text: retryInMs ? `Reconnecting in ${Math.ceil(retryInMs / 1000)}s` : 'Reconnecting…' }
    case 'unavailable':
      return { tone: 'muted', text: 'Live feed not set up' }
    default:
      return null
  }
}
