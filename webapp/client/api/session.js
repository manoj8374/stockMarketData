import { getSession, getGuestCredentials } from "./_auth.js";

export default async (req, res) => {
  const session = getSession(req);
  res.setHeader("Cache-Control", "no-store");
  if (!session) {
    // Signed-out visitors also get the guest account (if one is configured)
    // so the login page can show it.
    res.status(200).json({ authenticated: false, guest: getGuestCredentials() });
    return;
  }
  res.status(200).json({ authenticated: true, username: session.username, role: session.role });
};
