/**
 * Sessions, admin rule, logins, CSRF and CSP - the single source of truth for
 * each (port of auth.php).
 *
 * Serverless functions keep no state between requests, so the session lives in
 * one HMAC-signed cookie instead of a PHP session file. It carries the CSRF
 * token for everyone and, once logged in, the username plus timestamps.
 * The client can read nothing it could not already see, and cannot alter it
 * without SESSION_SECRET.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { parseCookies, addSetCookie, isHttps } from "./http.js";

// Exact match only - never a name substring.
export const ADMIN_USERNAMES = ["zabil", "5973"];

const COOKIE = "pantry_session";
const SESSION_IDLE_TIMEOUT = 3600;      // 1 hour without a request
const SESSION_ABSOLUTE_TIMEOUT = 43200; // 12 hours however active
const REMEMBER_LIFETIME = 2592000;      // "Ingat saya": 30 days from login

// Compared against when the username is unknown, so both paths cost one bcrypt.
const DUMMY_HASH = "$2b$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG";

function secret() {
  const s = process.env.SESSION_SECRET || "";
  if (s.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return s;
}

const now = () => Math.floor(Date.now() / 1000);
const sign = data => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------------------------------------------------------------------------
// Accounts (PANTRY_USERS env: same JSON shape as the old local_users.json)
// ---------------------------------------------------------------------------

function loadUsers() {
  try {
    const users = JSON.parse(process.env.PANTRY_USERS || "{}");
    return users && typeof users === "object" ? users : {};
  } catch {
    console.error("PANTRY_USERS is not valid JSON");
    return {};
  }
}

/** Fingerprint of the account's hash: changing the password ends its sessions. */
function accountFingerprint(user) {
  return crypto.createHash("sha256").update(String(user.hash || "")).digest("base64url").slice(0, 16);
}

// PHP writes $2y$; bcryptjs expects $2a$/$2b$. The algorithm is identical.
const normaliseHash = hash => String(hash).replace(/^\$2y\$/, "$2b$");

export async function verifyLogin(username, password) {
  const key = String(username || "").trim().toLowerCase();
  const user = loadUsers()[key];
  const hash = user && user.hash ? normaliseHash(user.hash) : DUMMY_HASH;
  const ok = await bcrypt.compare(String(password || ""), hash).catch(() => false);
  if (!ok || !user || !user.hash) return null;
  return { username: key, full_name: String(user.full_name || key), fp: accountFingerprint(user) };
}

export function isAdminUsername(username) {
  return ADMIN_USERNAMES.includes(String(username || "").trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Session cookie
// ---------------------------------------------------------------------------

function decode(value) {
  if (!value || !value.includes(".")) return null;
  const [data, mac] = value.split(".");
  if (!safeEqual(sign(data), mac)) return null;
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

const newCsrf = () => crypto.randomBytes(32).toString("hex");

/**
 * Load the session for this request, enforcing the lifetime rules:
 * idle 1 h / absolute 12 h, or 30 days for a remembered login. A password
 * change or a removed account ends the session too.
 */
export function loadSession(req) {
  const raw = decode(parseCookies(req)[COOKIE]);
  const sess = raw && typeof raw === "object" ? raw : {};
  const state = { data: sess, dirty: false };

  if (!sess.csrf) {
    sess.csrf = newCsrf();
    state.dirty = true;
  }

  if (sess.u) {
    const t = now();
    const user = loadUsers()[sess.u];
    const expired = sess.rem
      ? t - sess.iat > REMEMBER_LIFETIME
      : t - sess.last > SESSION_IDLE_TIMEOUT || t - sess.iat > SESSION_ABSOLUTE_TIMEOUT;
    if (expired || !user || accountFingerprint(user) !== sess.fp) {
      state.data = { csrf: sess.csrf };
      state.dirty = true;
    } else if (t - sess.last > 60) {
      // Slide the idle window (at most one cookie rewrite per minute).
      sess.last = t;
      state.dirty = true;
    }
  }
  return state;
}

export function commitSession(req, res, state) {
  if (!state.dirty) return;
  const s = state.data;
  const data = Buffer.from(JSON.stringify(s)).toString("base64url");
  const parts = [
    `${COOKIE}=${data}.${sign(data)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (isHttps(req)) parts.push("Secure");
  if (s.u && s.rem) {
    parts.push(`Max-Age=${Math.max(0, s.iat + REMEMBER_LIFETIME - now())}`);
  }
  addSetCookie(res, parts.join("; "));
  state.dirty = false;
}

export function establishLogin(state, account, remember) {
  const t = now();
  // A fresh CSRF token: the pre-login one cannot be replayed afterwards.
  state.data = {
    csrf: newCsrf(),
    u: account.username,
    fn: account.full_name,
    fp: account.fp,
    iat: t,
    last: t,
    rem: Boolean(remember)
  };
  state.dirty = true;
}

/**
 * End the login. The cookie is replaced by an anonymous one; as with any
 * stateless session, a copy of the old cookie stays valid until it expires -
 * change the password or SESSION_SECRET to cut every device off at once.
 */
export function logout(state) {
  state.data = { csrf: newCsrf() };
  state.dirty = true;
}

export const isLoggedIn = state => Boolean(state.data.u);
export const isAdminSession = state => isLoggedIn(state) && isAdminUsername(state.data.u);
export const csrfToken = state => state.data.csrf;

export function verifyCsrf(req, state) {
  const supplied = req.headers["x-csrf-token"] || "";
  return Boolean(state.data.csrf) && typeof supplied === "string" && safeEqual(state.data.csrf, supplied);
}

export function authInfo(state) {
  return {
    is_logged_in: isLoggedIn(state),
    is_admin: isAdminSession(state),
    username: state.data.u || "",
    full_name: state.data.fn || "",
    csrf_token: csrfToken(state)
  };
}

// ---------------------------------------------------------------------------
// Content-Security-Policy
// ---------------------------------------------------------------------------

export const newNonce = () => crypto.randomBytes(16).toString("base64");

// Uploaded images are served from the Vercel Blob store.
const BLOB_HOST = "https://*.public.blob.vercel-storage.com";

export function setPageSecurityHeaders(res, nonce) {
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    `img-src 'self' data: blob: ${BLOB_HOST}`,
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}'`,
    "connect-src 'self'"
  ].join("; "));
}

export function setJsonSecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
}
