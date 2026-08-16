import crypto from "crypto";
import { getSession } from "../_auth.js";
import { setSetting } from "../_db.js";

const RAILWAY_PROJECT_ID = "62997a4a-b85b-45f0-824d-d63bf4816652";
const RAILWAY_ENVIRONMENT_ID = "f641c209-58eb-468c-bd27-5aed56a9f328";
const RAILWAY_CRON_CANDLES_SERVICE_ID = "6365e5db-ed3a-4789-9030-04a3886214d5";

async function exchangeToken(requestToken) {
  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;
  const checksum = crypto.createHash("sha256").update(apiKey + requestToken + apiSecret).digest("hex");
  const r = await fetch("https://api.kite.trade/session/token", {
    method: "POST",
    headers: { "X-Kite-Version": "3", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.message || `Kite token exchange failed (${r.status})`);
  return json.data.access_token;
}

// Best-effort: cron-candles (Railway) still runs its own Python scripts that
// read KITE_ACCESS_TOKEN from its own env var, not from app_settings -- push
// it there too so the daily candle sync also picks up the fresh token.
async function pushToRailway(accessToken) {
  const r = await fetch("https://backboard.railway.com/graphql/v2", {
    method: "POST",
    headers: {
      "Project-Access-Token": process.env.RAILWAY_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }",
      variables: {
        input: {
          projectId: RAILWAY_PROJECT_ID,
          environmentId: RAILWAY_ENVIRONMENT_ID,
          serviceId: RAILWAY_CRON_CANDLES_SERVICE_ID,
          name: "KITE_ACCESS_TOKEN",
          value: accessToken,
        },
      },
    }),
  });
  const json = await r.json();
  if (json.errors) console.error("Railway push failed:", JSON.stringify(json.errors));
}

export default async (req, res) => {
  const session = getSession(req);
  if (!session || session.role !== "owner") {
    res.status(403).send("Forbidden");
    return;
  }

  const { request_token, status } = req.query;
  if (status !== "success" || !request_token) {
    res.status(400).send(`Kite login did not complete (status: ${status || "unknown"}).`);
    return;
  }

  try {
    const accessToken = await exchangeToken(request_token);
    await setSetting("kite_access_token", accessToken);
    await pushToRailway(accessToken).catch((e) => console.error("Railway push error:", e));

    res.setHeader("Content-Type", "text/html");
    res.status(200).send(`
      <!doctype html>
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h2>Kite connected ✓</h2>
          <p>The access token was refreshed. You can close this tab.</p>
          <script>setTimeout(() => { window.location.href = "/"; }, 1500);</script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(502).send(`Kite token exchange failed: ${err.message}`);
  }
};
