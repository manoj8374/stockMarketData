import { observer } from 'mobx-react-lite'
import { useStores } from '../../../app/useStores'
import { useController } from '../../../common/hooks/useController'
import { BrandMark, Icon } from '../../../common/components'
import { LoginController } from '../controllers/LoginController'
import { CandleArt } from './CandleArt'

export const LoginPage = observer(function LoginPage() {
  const { auth } = useStores()
  const controller = useController(() => new LoginController(auth), [auth])
  const { guest, error, notice, isSubmitting } = controller

  return (
    <div className="login">
      <div className="login-art">
        <CandleArt />
        <div className="login-copy">
          <div className="brand">
            <BrandMark />
            <div>
              <b>NSE Equities</b>
              <span>Momentum workbench</span>
            </div>
          </div>
          <p className="login-big">Find the stocks and industries with real momentum behind them.</p>
          <ul className="facts">
            <li>Daily candles for every NSE equity</li>
            <li>Weighted momentum scoring</li>
            <li>Live watchlist and option chain</li>
            <li>Kite portfolio</li>
          </ul>
        </div>
      </div>

      <div className="login-side">
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault()
            void controller.submit()
          }}
        >
          <div>
            <h1>Sign in</h1>
            <p className="sub">Use the account you were given for this workbench.</p>
          </div>

          {notice && !error && <div className="form-notice">{notice}</div>}
          {error && (
            <div className="form-error" role="alert">
              <Icon name="alert" />
              <span>{error}</span>
            </div>
          )}

          <label className="field">
            <span>Username</span>
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={controller.username}
              onChange={(e) => controller.setUsername(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <span className="pw">
              <input
                type={controller.showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={controller.password}
                onChange={(e) => controller.setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={controller.toggleShowPassword}
                aria-label={controller.showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={controller.showPassword}
              >
                <Icon name={controller.showPassword ? 'eyeOff' : 'eye'} />
              </button>
            </span>
          </label>

          <button className="btn primary block" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>

          {guest && (
            <section className="guest" aria-labelledby="guest-title">
              <div className="guest-head">
                <span className="guest-icon">
                  <Icon name="user" />
                </span>
                <div>
                  <b id="guest-title">Guest access</b>
                  <span>Read-only: Screener, Sectors, Industries and live markets</span>
                </div>
              </div>
              <dl className="guest-creds">
                <div>
                  <dt>Username</dt>
                  <dd>
                    <code>{guest.username}</code>
                  </dd>
                </div>
                <div>
                  <dt>Password</dt>
                  <dd>
                    <code>{guest.password}</code>
                  </dd>
                </div>
              </dl>
              <button type="button" className="btn" onClick={() => void controller.signInAsGuest()} disabled={isSubmitting}>
                Sign in as guest
              </button>
            </section>
          )}

          <p className="login-foot">Need your own account? Ask the owner.</p>
        </form>
      </div>
    </div>
  )
})
