import { getSession, signLiveToken } from "./_auth.js";

// Tells the browser where the live relay is and gives it a token for it.
// relayUrl is null until LIVE_RELAY_URL is set, which the UI shows as
// "live feed not set up".
export default async (req, res) => {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const relayUrl = (process.env.LIVE_RELAY_URL || "").replace(/\/+$/, "") || null;
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ relayUrl, token: relayUrl ? signLiveToken(session) : null });
};
