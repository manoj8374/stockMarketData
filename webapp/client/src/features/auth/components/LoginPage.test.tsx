import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from './LoginPage'
import { renderWithStores } from '../../../test/renderWithStores'

async function renderLogin() {
  const view = renderWithStores(<LoginPage />)
  await view.store.auth.loadSession()
  return view
}

describe('LoginPage', () => {
  it('shows the guest credentials', async () => {
    await renderLogin()
    expect(await screen.findByText('Guest access')).toBeInTheDocument()
    expect(screen.getByText('guest')).toBeInTheDocument()
    expect(screen.getByText('guest-pass')).toBeInTheDocument()
  })

  it('hides the guest card when no guest is configured', async () => {
    const { store } = renderWithStores(<LoginPage />)
    store.auth.guest = null
    expect(screen.queryByText('Guest access')).not.toBeInTheDocument()
  })

  it('shows an error for a wrong password', async () => {
    await renderLogin()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Username'), 'owner')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("don't match")
  })

  it('signs in as guest with one click', async () => {
    const { store } = await renderLogin()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign in as guest' }))
    await waitFor(() => expect(store.auth.user?.username).toBe('guest'))
  })

  it('toggles password visibility', async () => {
    await renderLogin()
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
  })
})
