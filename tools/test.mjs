/**
 * End-to-end test: the real handlers (api/page.js, api/pantry.js) against the
 * in-memory fake Sheets API. Covers the security rules in AGENTS.md - CSRF,
 * exact-match admin, privacy split, row-level writes.
 *
 *   npm test
 */
import { Readable } from "node:stream";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { installFakeEnv, installFakeSheets, fakeGoogle } from "./fake-sheets.mjs";

installFakeEnv();
const { sheets, calls } = installFakeSheets();

// seed: one event, a settings title, staff, an item
sheets.events.rows.push([1, "Kutipan Pantry", "", "active", 0, 0, "2026-01-01 08:00:00", ""]);
sheets.settings.rows.push(["title", "Kutipan Pantry"], ["currency", "RM"]);
sheets.staff.rows.push([1, "AHMAD BIN ALI", "1234", ""], [2, "SITI BINTI ABU", "2345", ""]);
sheets.items.rows.push(["itm1", "Microwave", 400, 0, 1, "", "seeking", "", "Dapur", "fa-box", 0, "2026-01-01 09:00:00"]);

// --------------------------------------------------------------- req/res mocks
const page = (await import("../api/page.js")).default;
const api = (await import("../api/pantry.js")).default;
const auth = (await import("../api/auth.js")).default;
const cookieJar = {}; // name -> value

async function call(handler, { method = "GET", url = "/", body, headers = {} } = {}) {
  const buf = body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const req = Readable.from(buf.length ? [buf] : []);
  const u = new URL(url, "https://pantry.test");
  const cookie = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join("; ");
  Object.assign(req, {
    method, url,
    query: Object.fromEntries(u.searchParams),
    headers: { host: "pantry.test", "x-forwarded-proto": "https", "x-real-ip": "1.2.3.4", cookie, ...headers }
  });
  const res = {
    statusCode: 200, headers: {}, body: "",
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(b) { this.body = b ?? ""; }
  };
  await handler(req, res);
  for (const c of [].concat(res.headers["set-cookie"] || [])) {
    const pair = c.split(";")[0];
    const name = pair.slice(0, pair.indexOf("="));
    const value = pair.slice(pair.indexOf("=") + 1);
    if (value === "" || /;\s*Max-Age=0\b/i.test(c)) delete cookieJar[name];
    else cookieJar[name] = value;
  }
  const ct = res.headers["content-type"] || "";
  return { status: res.statusCode, headers: res.headers, json: ct.includes("json") ? JSON.parse(res.body) : null, html: res.body };
}
const post = (action, body, csrf, extra = {}) =>
  call(api, { method: "POST", url: `/api.php?action=${action}`, body, headers: { "x-csrf-token": csrf, ...extra } });

/**
 * Walk the Google sign-in: /auth/google, then Google's redirect back to the
 * callback. `state` / `error` simulate a forged or cancelled return.
 * Resolves to { result, callback } where result is the ?login= value.
 */
async function googleLogin({ remember = false, state, error } = {}) {
  let r = await call(auth, { url: `/api/auth?step=start${remember ? "&remember=1" : ""}` });
  assert.equal(r.status, 302);
  const to = new URL(r.headers.location);
  assert.equal(to.origin + to.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(to.searchParams.get("client_id"), process.env.GOOGLE_OAUTH_CLIENT_ID);
  assert.equal(to.searchParams.get("redirect_uri"), "https://pantry.test/auth/google/callback");
  assert.equal(to.searchParams.get("code_challenge_method"), "S256");
  const qs = new URLSearchParams({ step: "callback", state: state ?? to.searchParams.get("state") });
  if (error) qs.set("error", error); else qs.set("code", "c0de");
  const callback = await call(auth, { url: `/api/auth?${qs}` });
  assert.equal(callback.status, 302);
  const result = new URL(callback.headers.location, "https://pantry.test").searchParams.get("login");
  return { result, callback, challenge: to.searchParams.get("code_challenge") };
}
const isAdminNow = async () => (await call(api, { url: "/api.php?action=check_auth" })).json.is_admin;

// ------------------------------------------------------------------- the flow
let r = await call(page);
assert.equal(r.status, 200);
assert.match(r.headers["content-security-policy"], /nonce-/);
assert.ok(r.html.includes("window.INITIAL_DATA"), "bootstrap present");
assert.ok(!r.html.includes("AHMAD BIN ALI"), "anon page must not carry staff names");
assert.ok(r.html.includes("Kutipan Pantry"));
assert.ok(!r.html.includes("<?php"));
assert.ok(r.html.includes('data-url="https://pantry.test/"'), "share links to the page itself");
assert.ok(/id="statTotalCollected">[\d,]+</.test(r.html), "amounts show no RM and no .00");
console.log("✓ anonymous page renders, no staff names");

r = await call(api, { url: "/api.php?action=check_auth" });
let csrf = r.json.csrf_token;
assert.equal(r.json.is_admin, false);
assert.ok(csrf.length === 64);

// CSRF enforced
r = await post("logout", {}, "wrong");
assert.equal(r.status, 403); assert.equal(r.json.csrf_expired, true);
// non-admin POST refused; the old password login is gone
r = await post("add_staff", { name: "X" }, csrf);
assert.equal(r.status, 403);
r = await post("login", { username: "zabil", password: "rahsia123" }, csrf);
assert.equal(r.status, 403, "no password login route");
console.log("✓ CSRF enforced, no password login");

// Google sign-in: everything but a verified admin email is refused
let g = await googleLogin({ state: "forged" });
assert.equal(g.result, "gagal"); assert.equal(await isAdminNow(), false);
g = await googleLogin({ error: "access_denied" });
assert.equal(g.result, "batal");
fakeGoogle.email = "orang.lain@gmail.com";
g = await googleLogin();
assert.equal(g.result, "ditolak"); assert.equal(await isAdminNow(), false);
fakeGoogle.email = "xahmadzabilalbar@gmail.com";
assert.equal((await googleLogin()).result, "ditolak", "no substring match");
fakeGoogle.email = "ahmadzabilalbar@gmail.com";
fakeGoogle.claims = { email_verified: false };
assert.equal((await googleLogin()).result, "gagal", "unverified email refused");
fakeGoogle.claims = { aud: "someone-elses-client" };
assert.equal((await googleLogin()).result, "gagal", "token for another client refused");
fakeGoogle.claims = { exp: Math.floor(Date.now() / 1000) - 10 };
assert.equal((await googleLogin()).result, "gagal", "expired ID token refused");
fakeGoogle.claims = {};
assert.equal(await isAdminNow(), false);
// the admin, in any letter case, with "Ingat saya"
fakeGoogle.email = "AhmadZabilAlbar@Gmail.com";
g = await googleLogin({ remember: true });
assert.equal(g.result, "ok");
assert.equal(crypto.createHash("sha256").update(fakeGoogle.lastExchange.code_verifier).digest("base64url"), g.challenge, "PKCE verifier matches");
assert.equal(fakeGoogle.lastExchange.redirect_uri, "https://pantry.test/auth/google/callback");
assert.ok([].concat(g.callback.headers["set-cookie"]).some(c => c.startsWith("pantry_session=") && /Max-Age=\d{6,}/.test(c)), "remembered login persists");
assert.equal(cookieJar.pantry_oauth, undefined, "sign-in state cookie is one-use");
r = await call(api, { url: "/api.php?action=check_auth" });
assert.equal(r.json.is_admin, true);
assert.equal(r.json.username, "ahmadzabilalbar@gmail.com");
assert.notEqual(r.json.csrf_token, csrf, "CSRF token rotated on login");
csrf = r.json.csrf_token;
console.log("✓ Google sign-in: state, cancel, non-admin, substring, unverified, aud, exp, PKCE, remember");

// contributions
r = await post("add_contribution", { name: "AHMAD BIN ALI", username: "1234", amount: 50, date: "2026-10-01T10:30" }, csrf);
assert.equal(r.status, 200, JSON.stringify(r.json));
const cid = r.json.id;
assert.equal(r.json.data.contributions.length, 1);
assert.equal(r.json.data.contributions[0].date, "2026-10-01 10:30");
assert.equal(sheets.contributions_backup.rows.length, 2, "backup row written");
await post("add_contribution", { name: "SITI BINTI ABU", amount: 25.5 }, csrf);
r = await post("add_contribution", { name: "x", amount: 5, date: "bad" }, csrf);
assert.equal(r.status, 400);
r = await post("edit_contribution", { contribution_id: cid, name: "AHMAD BIN ALI", username: "1234", amount: 60, date: "2026-09-30T08:15" }, csrf);
assert.equal(r.status, 200, JSON.stringify(r.json));
const edited = r.json.data.contributions.find(c => c.id === cid);
assert.equal(edited.amount, 60);
assert.equal(edited.date, "2026-09-30 08:15");
const amountCol = sheets.contributions_backup.rows[0].indexOf("amount");
assert.ok(sheets.contributions_backup.rows.some(row => Number(row[amountCol]) === 60), "backup row updated");
r = await post("edit_contribution", { contribution_id: 999, name: "x", amount: 5 }, csrf);
assert.equal(r.status, 404);
r = await post("edit_contribution", { contribution_id: cid, name: "", amount: 5 }, csrf);
assert.equal(r.status, 400);
r = await post("delete_contribution", { contribution_id: cid }, csrf);
assert.equal(r.status, 200);
assert.equal(r.json.data.contributions.length, 1);
assert.equal(sheets.contributions_backup.rows.length, 2, "matching backup removed");
console.log("✓ contributions add/edit/delete keep backup in step");

// expenses
r = await post("add_expense", { title: "Sabun", amount: 12.3, date: "2026-10-02", staff_name: "SITI BINTI ABU" }, csrf);
assert.equal(r.status, 200);
const eid = r.json.data.expenses[0].id;
r = await post("edit_expense", { expense_id: eid, title: "Sabun & Tisu", amount: 15, date: "2026-10-02", category: "", staff_name: "SITI BINTI ABU" }, csrf);
assert.equal(r.json.data.expenses[0].title, "Sabun & Tisu");
assert.equal(r.json.data.expenses[0].category, "Lain-lain");
r = await post("edit_expense", { expense_id: 999, title: "z", amount: 1 }, csrf);
assert.equal(r.status, 404);
console.log("✓ expenses add/edit; unknown id -> 404");

// bulk save keeps created_at and prunes
r = await call(api, { url: "/api.php" });
const data = r.json;
assert.ok(data.contributions.length === 1, "admin sees ledger");
data.items.push({ id: "itm2", name: "Peti Sejuk", target_price: 1000, quantity: 1, status: "seeking" });
data.announcement = { title: "Baharu", message: "=HYPERLINK(\"x\")" };
r = await call(api, { method: "POST", url: "/api.php", body: data, headers: { "x-csrf-token": csrf } });
assert.equal(r.status, 200, JSON.stringify(r.json));
assert.equal(sheets.items.rows[1][11], "2026-01-01 09:00:00", "created_at preserved");
assert.equal(sheets.announcement.rows[1][1], "=HYPERLINK(\"x\")", "stored as literal text");
data.items = data.items.filter(i => i.id !== "itm1");
await call(api, { method: "POST", url: "/api.php", body: data, headers: { "x-csrf-token": csrf } });
r = await call(api, { url: "/api.php" });
assert.deepEqual(r.json.items.map(i => i.id), ["itm2"]);
assert.equal(r.json.totals.target_total, 1000);
assert.equal(r.json.totals.total_collected, 25.5);
assert.equal(r.json.totals.total_expenses, 15);
console.log("✓ bulk save upserts items (created_at kept), prunes, totals right");

// staff + event
r = await post("add_staff", { name: "BARU BIN LAMA" }, csrf); assert.equal(r.status, 200);
r = await post("add_staff", { name: "baru bin lama" }, csrf); assert.equal(r.status, 409);
r = await post("update_staff", { id: 2, name: "SITI BINTI ABU BAKAR" }, csrf); assert.equal(r.status, 200);
r = await post("update_staff", { id: 77, name: "Z" }, csrf); assert.equal(r.status, 404);
r = await post("delete_staff", { id: 1 }, csrf); assert.equal(r.status, 200);
r = await call(api, { url: "/api.php?action=get_staff" });
assert.deepEqual(r.json.map(s => s.name), ["BARU BIN LAMA", "SITI BINTI ABU BAKAR"]);
r = await post("edit_event", { event_id: 1, title: "Tabung Dapur", description: "d" }, csrf);
assert.equal(r.json.data.title, "Tabung Dapur");
r = await post("save_expense_categories", { categories: ["A", "A", " ", "B"] }, csrf);
assert.deepEqual(r.json.data.expense_categories, ["A", "B"]);
console.log("✓ staff CRUD (unique names, 404s), event edit updates title, categories");

// upload rejects non-images before touching Blob
r = await call(api, { method: "POST", url: "/api.php?action=upload_image", body: Buffer.from("<?php echo 1;"), headers: { "x-csrf-token": csrf, "content-type": "image/png" } });
assert.equal(r.status, 400);
console.log("✓ upload sniffing rejects non-image bytes");

// admin page includes staff
r = await call(page);
assert.ok(r.html.includes("SITI BINTI ABU BAKAR"), "admin page carries staff");
assert.ok(r.html.includes('class="is-admin"'));

// public payload after logout
r = await post("logout", {}, csrf);
r = await call(api, { url: "/api.php" });
assert.deepEqual(r.json.contributions, []);
assert.deepEqual(r.json.events, []);
assert.equal(r.json.giver_coins[0].name, "Penyumbang #1");
assert.equal(r.json.expenses[0].staff_name, "SITI");
assert.equal(r.json.contributions_backup_count, undefined);
r = await call(api, { url: "/api.php?action=get_staff" });
assert.equal(r.status, 403);
console.log("✓ logout -> public payload anonymised, staff directory refused");

// tampered cookie is rejected
cookieJar.pantry_session = cookieJar.pantry_session.replace(/.$/, c => (c === "A" ? "B" : "A"));
r = await call(api, { url: "/api.php?action=check_auth" });
assert.equal(r.json.is_admin, false);
console.log("✓ tampered session cookie ignored");

console.log(`\nAll passed. Sheets calls: ${calls.read} reads, ${calls.write} writes.`);
