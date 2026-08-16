import crypto from "crypto";

const COOKIE_NAME = "session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getUsers() {
  try {
    return JSON.parse(process.env.AUTH_USERS || "[]");
  } catch {
    return [];
  }
}

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verify(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(data).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

// Returns { username, role } if the request has a valid session cookie, else null.
export function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verify(cookies[COOKIE_NAME]);
}

// Returns a signed session token if username/password match a configured
// user, else null. Plain-text password comparison is fine here -- this is a
// personal-use visibility gate, not a system protecting real credentials.
export function login(username, password) {
  const users = getUsers();
  const match = users.find((u) => u.username === username && u.password === password);
  if (!match) return null;
  return { token: sign({ username: match.username, role: match.role, exp: Date.now() + SESSION_TTL_MS }), role: match.role };
}

export function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}
