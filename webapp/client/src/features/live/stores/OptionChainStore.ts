import { makeAutoObservable } from 'mobx'
import { Resource } from '../../../core/network/Resource'
import type { LiveService, OptionChainDto } from '../services/LiveService'

export class OptionChainStore {
  private readonly chains = new Map<string, Resource<OptionChainDto>>()
  private readonly service: LiveService

  constructor(service: LiveService) {
    this.service = service
    makeAutoObservable<OptionChainStore, 'chains' | 'service'>(this, { chains: false, service: false }, { autoBind: true })
  }

  chainFor(underlying: string, expiry: string | null) {
    const key = `${underlying}|${expiry ?? ''}`
    let resource = this.chains.get(key)
    if (!resource) {
      resource = new Resource<OptionChainDto>()
      this.chains.set(key, resource)
    }
    return resource
  }

  load(underlying: string, expiry: string | null, { refresh = false } = {}) {
    const resource = this.chainFor(underlying, expiry)
    if (!refresh && (resource.data || resource.isLoading)) return resource.pending
    return resource.load((signal) => this.service.getOptionChain(underlying, expiry ?? undefined, signal))
  }
}
