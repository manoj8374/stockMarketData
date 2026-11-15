import { makeAutoObservable, observableRef } from 'mobx'

// What the shared top bar needs from whichever page is on screen.
export interface PageController {
  readonly asOf: Date | string | null
  readonly isRefreshing: boolean
  refresh(): void
}

export class UiStore {
  activePage: PageController | null = null

  constructor() {
    makeAutoObservable(this, { activePage: observableRef }, { autoBind: true })
  }

  setActivePage(page: PageController) {
    this.activePage = page
  }

  clearActivePage(page: PageController) {
    if (this.activePage === page) this.activePage = null
  }

  refreshActivePage() {
    this.activePage?.refresh()
  }
}
