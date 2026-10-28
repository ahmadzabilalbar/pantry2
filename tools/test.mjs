/**
 * End-to-end test: the real handlers (api/page.js, api/pantry.js) against the
 * in-memory fake Sheets API. Covers the security rules in AGENTS.md - CSRF,
 * exact-match admin, privacy split, row-level writes.
 *
 *   npm test
 */
import { Readable } from "node:stream";
import assert from "node:assert/strict";
import { installFakeEnv, installFakeSheets } from "./fake-sheets.mjs";

await installFakeEnv({
  // $2y$ like PHP's password_hash(), to prove old hashes carry over.
  zabil: { password: "rahsia123", full_name: "Ahmad Zabil", phpStyle: true },
  staff1: { password: "biasa123", full_name: "Staf Biasa" }
});
const { sheets, calls } = installFakeSheets();

// seed: one event, a settings title, staff, an item
sheets.events.rows.push([1, "Kutipan Pantry", "", "active", 0, 0, "2026-01-01 08:00:00", ""]);
sheets.settings.rows.push(["title", "Kutipan Pantry"], ["currency", "RM"]);
sheets.staff.rows.push([1, "AHMAD BIN ALI", "1234", ""], [2, "SITI BINTI ABU", "2345", ""]);
sheets.items.rows.push(["itm1", "Microwave", 400, 0, 1, "", "seeking", "", "Dapur", "fa-box", 0, "2026-01-01 09:00:00"]);

// --------------------------------------------------------------- req/res mocks
const page = (await import("../api/page.js")).default;
const api = (await import("../api/pantry.js")).default;
let cookieJar = "";

async function call(handler, { method = "GET", url = "/", body, headers = {} } = {}) {
  const buf = body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const req = Readable.from(buf.length ? [buf] : []);
  const u = new URL(url, "https://pantry.test");
  Object.assign(req, {
    method, url,
    query: Object.fromEntries(u.searchParams),
    headers: { host: "pantry.test", "x-forwarded-proto": "https", "x-real-ip": "1.2.3.4", cookie: cookieJar, ...headers }
  });
  const res = {
    statusCode: 200, headers: {}, body: "",
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(b) { this.body = b ?? ""; }
  };
  await handler(req, res);
  for (const c of [].concat(res.headers["set-cookie"] || [])) {
    cookieJar = c.split(";")[0];
  }
  const ct = res.headers["content-type"] || "";
  return { status: res.statusCode, headers: res.headers, json: ct.includes("json") ? JSON.parse(res.body) : null, html: res.body };
}
const post = (action, body, csrf, extra = {}) =>
  call(api, { method: "POST", url: `/api.php?action=${action}`, body, headers: { "x-csrf-token": csrf, ...extra } });

// ------------------------------------------------------------------- the flow
let r = await call(page);
assert.equal(r.status, 200);
assert.match(r.headers["content-security-policy"], /nonce-/);
assert.ok(r.html.includes("window.INITIAL_DATA"), "bootstrap present");
assert.ok(!r.html.includes("AHMAD BIN ALI"), "anon page must not carry staff names");
assert.ok(r.html.includes("Kutipan Pantry"));
assert.ok(!r.html.includes("<?php"));
assert.ok(r.html.includes('href="https://pantry.test/laporan"') || r.html.includes('data-url="https://pantry.test/laporan"'));
console.log("✓ anonymous page renders, no staff names");

r = await call(api, { url: "/api.php?action=check_auth" });
let csrf = r.json.csrf_token;
assert.equal(r.json.is_admin, false);
assert.ok(csrf.length === 64);

// CSRF enforced
r = await post("login", { username: "zabil", password: "rahsia123" }, "wrong");
assert.equal(r.status, 403); assert.equal(r.json.csrf_expired, true);
// non-admin POST refused
r = await post("add_staff", { name: "X" }, csrf);
assert.equal(r.status, 403);
// bad password
r = await post("login", { username: "zabil", password: "nope" }, csrf);
assert.equal(r.status, 401);
assert.equal(sheets.login_attempts.rows.length, 3, "two throttle identifiers recorded");
// non-admin account logs in but is not admin
r = await post("login", { username: "staff1", password: "biasa123" }, csrf);
assert.equal(r.status, 200); assert.equal(r.json.is_admin, false);
csrf = r.json.csrf_token;
r = await post("add_staff", { name: "X" }, csrf);
assert.equal(r.status, 403, "non-admin login cannot write");
r = await post("logout", {}, csrf); csrf = r.json.csrf_token;
// admin login with a PHP $2y$ hash
r = await post("login", { username: "ZABIL", password: "rahsia123", remember: true }, csrf);
assert.equal(r.status, 200); assert.equal(r.json.is_admin, true);
assert.equal(sheets.login_attempts.rows.length, 1, "throttle rows cleared on success (header only)");
csrf = r.json.csrf_token;
console.log("✓ CSRF, admin rule, throttle rows, $2y$ hash login");

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
r = await post("delete_contribution", { contribution_id: cid }, csrf);
assert.equal(r.status, 200);
assert.equal(r.json.data.contributions.length, 1);
assert.equal(sheets.contributions_backup.rows.length, 2, "matching backup removed");
console.log("✓ contributions add/delete keep backup in step");

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

// admin page includes staff; report is public-only
r = await call(page);
assert.ok(r.html.includes("SITI BINTI ABU BAKAR"), "admin page carries staff");
assert.ok(r.html.includes('class="is-admin"'));
r = await call(page, { url: "/api/page?view=laporan" });
assert.ok(r.html.includes("Laporan"));
assert.ok(!r.html.includes("SITI BINTI ABU"), "report never shows giver names");
assert.ok(r.html.includes("SITI") === true, "purchaser given name shown");
assert.ok(r.html.includes("RM 15.00"));

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
cookieJar = cookieJar.replace(/.$/, c => (c === "A" ? "B" : "A"));
r = await call(api, { url: "/api.php?action=check_auth" });
assert.equal(r.json.is_admin, false);
console.log("✓ tampered session cookie ignored");

console.log(`\nAll passed. Sheets calls: ${calls.read} reads, ${calls.write} writes.`);
