import { login, setSessionCookie } from "./_auth.js";

export default async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const { username, password } = req.body || {};
  const result = login(username, password);
  if (!result) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  setSessionCookie(res, result.token);
  res.status(200).json({ ok: true, username, role: result.role });
};
