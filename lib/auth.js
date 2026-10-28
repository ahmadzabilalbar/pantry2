/**
 * Sessions, admin rule, Google sign-in, CSRF and CSP - the single source of
 * truth for each.
 *
 * Serverless functions keep no state between requests, so the session lives in
 * one HMAC-signed cookie instead of a PHP session file. It carries the CSRF
 * token for everyone and, once logged in, the admin's email plus timestamps.
 * The client can read nothing it could not already see, and cannot alter it
 * without SESSION_SECRET.
 */
import crypto from "node:crypto";
import { parseCookies, addSetCookie, isHttps, origin } from "./http.js";

// The only accounts that may sign in. Exact match only - never a substring.
export const ADMIN_EMAILS = ["ahmadzabilalbar@gmail.com"];

const COOKIE = "pantry_session";
const SESSION_IDLE_TIMEOUT = 3600;      // 1 hour without a request
const SESSION_ABSOLUTE_TIMEOUT = 43200; // 12 hours however active
const REMEMBER_LIFETIME = 2592000;      // "Ingat saya": 30 days from login

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

export function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || "").trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Signed cookies (the session, and the short-lived Google sign-in state)
// ---------------------------------------------------------------------------

function encode(obj) {
  const data = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${data}.${sign(data)}`;
}

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

function setCookie(req, res, name, value, maxAge) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (isHttps(req)) parts.push("Secure");
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  addSetCookie(res, parts.join("; "));
}

const newCsrf = () => crypto.randomBytes(32).toString("hex");

/**
 * Load the session for this request, enforcing the lifetime rules:
 * idle 1 h / absolute 12 h, or 30 days for a remembered login. Removing the
 * email from ADMIN_EMAILS ends the session too.
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
    const expired = sess.rem
      ? t - sess.iat > REMEMBER_LIFETIME
      : t - sess.last > SESSION_IDLE_TIMEOUT || t - sess.iat > SESSION_ABSOLUTE_TIMEOUT;
    if (expired || !isAdminEmail(sess.u)) {
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
  const maxAge = s.u && s.rem ? Math.max(0, s.iat + REMEMBER_LIFETIME - now()) : undefined;
  setCookie(req, res, COOKIE, encode(s), maxAge);
  state.dirty = false;
}

function establishLogin(state, account, remember) {
  const t = now();
  // A fresh CSRF token: the pre-login one cannot be replayed afterwards.
  state.data = {
    csrf: newCsrf(),
    u: account.email,
    fn: account.name,
    iat: t,
    last: t,
    rem: Boolean(remember)
  };
  state.dirty = true;
}

/**
 * End the login. The cookie is replaced by an anonymous one; as with any
 * stateless session, a copy of the old cookie stays valid until it expires -
 * change SESSION_SECRET to cut every device off at once.
 */
export function logout(state) {
  state.data = { csrf: newCsrf() };
  state.dirty = true;
}

export const isLoggedIn = state => Boolean(state.data.u);
export const isAdminSession = state => isLoggedIn(state) && isAdminEmail(state.data.u);
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
// Google sign-in (OAuth 2.0 authorization code flow with PKCE)
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const OAUTH_COOKIE = "pantry_oauth";
const OAUTH_LIFETIME = 600; // 10 minutes to finish on Google's page

function googleClient() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  if (!id || !clientSecret) {
    throw new Error("Google sign-in is not configured (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET)");
  }
  return { id, clientSecret };
}

const callbackUrl = req => `${origin(req)}/auth/google/callback`;
const pkceChallenge = verifier => crypto.createHash("sha256").update(verifier).digest("base64url");

function jwtClaims(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Begin sign-in: keep a one-time state and PKCE verifier in a signed cookie,
 * and return the Google URL to redirect to.
 */
export function startGoogleLogin(req, res, remember) {
  const { id } = googleClient();
  const st = crypto.randomBytes(16).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  setCookie(req, res, OAUTH_COOKIE, encode({
    k: "oauth", st, v: verifier, rem: Boolean(remember), exp: now() + OAUTH_LIFETIME
  }), OAUTH_LIFETIME);
  return `${GOOGLE_AUTH_URL}?${new URLSearchParams({
    client_id: id,
    redirect_uri: callbackUrl(req),
    response_type: "code",
    scope: "openid email profile",
    state: st,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account"
  })}`;
}

/**
 * Finish sign-in when Google redirects back. Logs the session in only for a
 * verified email in ADMIN_EMAILS. Returns "ok", "batal" (cancelled on
 * Google's page), "ditolak" (not an admin email) or "gagal".
 */
export async function finishGoogleLogin(req, res, sess, query) {
  const pending = decode(parseCookies(req)[OAUTH_COOKIE]);
  setCookie(req, res, OAUTH_COOKIE, "", 0); // one use only
  const st = String(query.state ?? "");
  if (!pending || pending.k !== "oauth" || !(pending.exp > now()) || !st || !safeEqual(pending.st, st)) return "gagal";
  if (query.error || !query.code) return "batal";

  const { id, clientSecret } = googleClient();
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: String(query.code),
      code_verifier: pending.v,
      client_id: id,
      client_secret: clientSecret,
      redirect_uri: callbackUrl(req)
    })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.id_token) {
    console.error("Google token exchange failed:", r.status, body.error || "");
    return "gagal";
  }

  // The ID token came straight from Google's token endpoint over TLS, so its
  // signature need not be checked (OpenID Connect Core 3.1.3.7); its claims are.
  const c = jwtClaims(body.id_token);
  if (!c || !GOOGLE_ISSUERS.includes(c.iss) || c.aud !== id || !(c.exp > now()) || c.email_verified !== true) {
    return "gagal";
  }
  const email = String(c.email || "").trim().toLowerCase();
  if (!isAdminEmail(email)) return "ditolak";

  establishLogin(sess, { email, name: String(c.name || email) }, pending.rem);
  return "ok";
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
