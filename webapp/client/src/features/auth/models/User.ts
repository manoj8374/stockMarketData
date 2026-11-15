export type Role = 'owner' | string

export class User {
  readonly username: string
  readonly role: Role

  constructor(username: string, role: Role) {
    this.username = username
    this.role = role
  }

  get isOwner() {
    return this.role === 'owner'
  }

  get initial() {
    return (this.username || '?').slice(0, 1).toUpperCase()
  }

  get roleLabel() {
    return this.isOwner ? 'Owner' : 'Read-only'
  }
}
