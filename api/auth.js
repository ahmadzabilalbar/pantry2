/**
 * Google sign-in. /auth/google starts it and /auth/google/callback finishes it
 * (rewrites in vercel.json); the flow itself lives in lib/auth.js. Both end in
 * a redirect: to Google, or back to "/?login=<result>" for app.js to report.
 */
import {
  loadSession, commitSession, startGoogleLogin, finishGoogleLogin, setJsonSecurityHeaders
} from "../lib/auth.js";

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

export default async function handler(req, res) {
  setJsonSecurityHeaders(res);
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end();
  }
  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  try {
    if (query.step === "callback") {
      const sess = loadSession(req);
      const result = await finishGoogleLogin(req, res, sess, query);
      commitSession(req, res, sess);
      return redirect(res, `/?login=${result}`);
    }
    return redirect(res, startGoogleLogin(req, res, query.remember === "1"));
  } catch (e) {
    // Usually missing GOOGLE_OAUTH_* or SESSION_SECRET on the deployment.
    console.error("auth:", e.message);
    return redirect(res, "/?login=gagal");
  }
}
