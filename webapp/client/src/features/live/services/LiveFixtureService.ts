import type { InstrumentDto, LiveService, OptionChainDto } from './LiveService'

export const FIXTURE_INSTRUMENTS: InstrumentDto[] = [
  { symbol: 'NSE:NIFTY 50', name: 'Nifty 50 index', exchange: 'NSE', type: 'INDEX' },
  { symbol: 'NSE:RELIANCE', name: 'Reliance Industries Ltd', exchange: 'NSE', type: 'EQ' },
  { symbol: 'NSE:HDFCBANK', name: 'HDFC Bank Ltd', exchange: 'NSE', type: 'EQ' },
  { symbol: 'NSE:INFY', name: 'Infosys Ltd', exchange: 'NSE', type: 'EQ' },
  { symbol: 'NSE:TCS', name: 'Tata Consultancy Services Ltd', exchange: 'NSE', type: 'EQ' },
  { symbol: 'NSE:SBIN', name: 'State Bank of India', exchange: 'NSE', type: 'EQ' },
  { symbol: 'NSE:ITC', name: 'ITC Ltd', exchange: 'NSE', type: 'EQ' },
]

export class LiveFixtureService implements LiveService {
  async getSocketUrl() {
    return 'ws://fixture/ws?token=test'
  }

  async search(query: string) {
    const q = query.trim().toUpperCase()
    return FIXTURE_INSTRUMENTS.filter((i) => i.symbol.includes(q) || i.name.toUpperCase().includes(q))
  }

  async getOptionChain(underlying: string, expiry?: string): Promise<OptionChainDto> {
    const expiries = ['2026-11-17', '2026-11-24']
    const chosen = expiry && expiries.includes(expiry) ? expiry : expiries[0]
    const tag = chosen.replace(/-/g, '').slice(2)
    const strikes = Array.from({ length: 41 }, (_, i) => 23300 + i * 50).map((strike) => ({
      strike,
      ce: `NFO:${underlying}${tag}${strike}CE`,
      pe: `NFO:${underlying}${tag}${strike}PE`,
    }))
    return { underlying, spotSymbol: 'NSE:NIFTY 50', lotSize: 75, expiries, expiry: chosen, strikes }
  }
}
