import { clearSessionCookie } from "./_auth.js";

export default async (req, res) => {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
};
