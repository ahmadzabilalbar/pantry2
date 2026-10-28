/** Small request/response helpers for Vercel Node functions. */

/** Read the raw request body, refusing anything over `limit` bytes. */
export async function readBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const err = new Error("Payload too large");
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Parse a JSON body; an empty body becomes {}, a malformed one null. */
export async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // A malformed cookie from some other app on the domain: ignore it.
    }
  }
  return out;
}

export function addSetCookie(res, cookie) {
  const prev = res.getHeader("Set-Cookie");
  const list = prev ? [].concat(prev) : [];
  list.push(cookie);
  res.setHeader("Set-Cookie", list);
}

export function isHttps(req) {
  return String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

export function origin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${isHttps(req) ? "https" : "http"}://${host}`;
}

/** Client IP as reported by Vercel's edge (which overwrites these headers). */
export function clientIp(req) {
  const real = String(req.headers["x-real-ip"] || "").trim();
  if (real) return real;
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket?.remoteAddress || "0.0.0.0";
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(html);
}

/** HTML-escape for text and attribute contexts. */
export function h(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// U+2028 / U+2029 are valid in JSON but end a line inside a <script>.
const LINE_SEPARATORS = new RegExp("[" + String.fromCharCode(0x2028, 0x2029) + "]", "g");

/** JSON safe to embed inside a <script> element. */
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/'/g, "\\u0027")
    .replace(LINE_SEPARATORS, c => "\\u" + c.charCodeAt(0).toString(16));
}
