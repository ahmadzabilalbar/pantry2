/**
 * Local preview on fake data - no Google project, Vercel account or Blob store
 * needed. Mimics vercel.json's routing: public/ as static files, "/" and
 * "/laporan" to api/page.js, "/api.php" to api/pantry.js, "/auth/google*" to
 * api/auth.js. Google's consent page is skipped: "Log Masuk dengan Google"
 * comes straight back signed in as the fake admin.
 *
 *   npm run preview        -> http://localhost:3000
 *
 * Data lives in memory and is lost when the server stops. For the real thing
 * against your sheet, use `vercel dev` with .env.local.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installFakeEnv, installFakeSheets } from "./fake-sheets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);

installFakeEnv();
const { sheets } = installFakeSheets();
sheets.events.rows.push([1, "Pantry Aras 2", "Kutipan demo", "active", 0, 0, "2026-10-01 08:00:00", ""]);
sheets.settings.rows.push(["title", "Pantry Aras 2"], ["currency", "RM"]);
sheets.staff.rows.push([1, "AHMAD BIN ALI", "1234", ""], [2, "SITI BINTI ABU", "2345", ""]);
sheets.items.rows.push(
  ["itm1", "Microwave", 450, 0, 1, "", "seeking", "Untuk dapur aras 2", "Dapur", "fa-box", 0, "2026-10-01 09:00:00"],
  ["itm2", "Cerek Elektrik", 80, 0, 2, "", "seeking", "", "Dapur", "fa-mug-hot", 1, "2026-10-01 09:00:00"]
);
sheets.contributions.rows.push(
  [1, "AHMAD BIN ALI", "1234", 50, "2026-10-02 10:15", "paid", "", "2026-10-02 10:15:00"],
  [2, "SITI BINTI ABU", "2345", 30, "2026-10-03 14:40", "paid", "", "2026-10-03 14:40:00"]
);
sheets.expenses.rows.push([1, "Sabun & Tisu", 18.9, "2026-10-04", "Lain-lain", "SITI BINTI ABU", "", "", "2026-10-04 12:00:00"]);

const page = (await import("../api/page.js")).default;
const api = (await import("../api/pantry.js")).default;
const auth = (await import("../api/auth.js")).default;

/** Stand in for Google's consent page: go straight back with a demo code. */
function skipGoogleConsent(res) {
  const setHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => {
    if (name.toLowerCase() === "location" && String(value).startsWith("https://accounts.google.com/")) {
      const q = new URL(value).searchParams;
      value = `${q.get("redirect_uri")}?code=demo&state=${encodeURIComponent(q.get("state"))}`;
    }
    return setHeader(name, value);
  };
}

const MIME = {
  ".js": "text/javascript", ".css": "text/css", ".html": "text/html",
  ".woff2": "font/woff2", ".ttf": "font/ttf", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  req.query = Object.fromEntries(url.searchParams);
  try {
    if (url.pathname === "/" || url.pathname === "/index.php") return await page(req, res);
    if (url.pathname === "/laporan") { req.query.view = "laporan"; return await page(req, res); }
    if (url.pathname === "/api.php") return await api(req, res);
    if (url.pathname === "/auth/google") {
      req.query.step = "start";
      skipGoogleConsent(res);
      return await auth(req, res);
    }
    if (url.pathname === "/auth/google/callback") { req.query.step = "callback"; return await auth(req, res); }

    const file = path.join(PUBLIC, path.normalize(url.pathname));
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end("Preview error");
  }
}).listen(PORT, () => {
  console.log(`Preview: http://localhost:${PORT}  (log masuk Google palsu sebagai pentadbir, data palsu dalam memori)`);
});
