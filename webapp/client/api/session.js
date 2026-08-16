import { getSession } from "./_auth.js";

export default async (req, res) => {
  const session = getSession(req);
  res.setHeader("Cache-Control", "no-store");
  if (!session) {
    res.status(200).json({ authenticated: false });
    return;
  }
  res.status(200).json({ authenticated: true, username: session.username, role: session.role });
};
