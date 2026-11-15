type Cleanup = () => void

export class Disposer {
  private cleanups: Cleanup[] = []

  add(cleanup: Cleanup) {
    this.cleanups.push(cleanup)
  }

  dispose() {
    const cleanups = this.cleanups
    this.cleanups = []
    for (const cleanup of cleanups.reverse()) cleanup()
  }
}
