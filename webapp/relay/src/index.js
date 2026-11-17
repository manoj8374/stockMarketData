import mysql from 'mysql2/promise'
import { createServer } from './server.js'
import { KiteFeed } from './feeds/kiteFeed.js'
import { SimulatedFeed } from './feeds/simulatedFeed.js'

const env = process.env
const port = Number(env.PORT) || 8090

if (!env.LIVE_TOKEN_SECRET) {
  console.error('LIVE_TOKEN_SECRET is required (the same value as on the web app).')
  process.exit(1)
}

async function readAccessToken() {
  if (env.KITE_ACCESS_TOKEN) return env.KITE_ACCESS_TOKEN
  const db = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  })
  try {
    const [rows] = await db.query("SELECT value FROM app_settings WHERE name = 'kite_access_token'")
    return rows[0]?.value ?? null
  } finally {
    await db.end()
  }
}

const useKite = env.FEED_MODE !== 'simulated' && Boolean(env.KITE_API_KEY)
const feed = useKite ? new KiteFeed({ apiKey: env.KITE_API_KEY, getAccessToken: readAccessToken }) : new SimulatedFeed()
const allowedOrigins = (env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const { server } = createServer({ feed, secret: env.LIVE_TOKEN_SECRET, allowedOrigins })
feed.start()
server.listen(port, () => console.log(`Live relay on :${port} (${feed.mode} feed)`))
