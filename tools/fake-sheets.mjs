/**
 * In-memory fake of the Google Sheets REST API, installed by replacing
 * global fetch. Used by `npm test` and `npm run preview` so the app can be
 * exercised without a real Google project. Never imported by the app itself.
 */
import crypto from "node:crypto";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { TABLES } from "../lib/store.js";

/** Fake credentials so lib/sheets.js and lib/auth.js run unchanged. */
export async function installFakeEnv(users) {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.GOOGLE_SHEET_ID = "sheet123";
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "svc@test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" })
  });
  process.env.SESSION_SECRET ||= crypto.randomBytes(32).toString("base64url");
  const accounts = {};
  for (const [u, { password, full_name, phpStyle }] of Object.entries(users)) {
    let hash = await bcrypt.hash(password, 4);
    if (phpStyle) hash = hash.replace(/^\$2b\$/, "$2y$");
    accounts[u] = { hash, full_name };
  }
  process.env.PANTRY_USERS = JSON.stringify(accounts);
}

export function installFakeSheets() {
  const sheets = {}; // title -> { id, rows: [[...]] }
  let nextId = 1;
  for (const [t, cols] of Object.entries(TABLES)) sheets[t] = { id: nextId++, rows: [[...cols]] };
  const calls = { read: 0, write: 0 };

  const colNum = s => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  function parseRange(r) {
    const m = r.match(/^'((?:[^']|'')+)'(?:!(.+))?$/);
    const tab = m[1].replace(/''/g, "'");
    if (!m[2]) return { tab, r1: 1, r2: Infinity, c1: 1 };
    let x = m[2].match(/^(\d+):(\d+)$/);
    if (x) return { tab, r1: +x[1], r2: +x[2], c1: 1 };
    x = m[2].match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d*))?$/);
    return { tab, c1: colNum(x[1]), r1: +x[2], r2: x[3] ? (x[4] ? +x[4] : Infinity) : +x[2], c2: x[3] ? colNum(x[3]) : undefined };
  }
  const trim = rows => { while (rows.length && rows.at(-1).every(v => v === "" || v === undefined)) rows.pop(); return rows; };
  const trimRow = row => { while (row.length && (row.at(-1) === "" || row.at(-1) === undefined)) row.pop(); return row; };

  globalThis.fetch = async (url, init = {}) => {
    url = new URL(url);
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.hostname === "oauth2.googleapis.com") return json(200, { access_token: "tok", expires_in: 3600 });
    assert.equal(init.headers.Authorization, "Bearer tok");
    const path = decodeURIComponent(url.pathname.replace("/v4/spreadsheets/sheet123", ""));
    const body = init.body ? JSON.parse(init.body) : null;

    if (path === "/values:batchGet") {
      calls.read++;
      return json(200, { valueRanges: url.searchParams.getAll("ranges").map(r => {
        const { tab, r1, r2, c1 } = parseRange(r);
        const s = sheets[tab];
        const rows = trim(s.rows.slice(r1 - 1, r2 === Infinity ? undefined : r2).map(row => trimRow([...row].slice(c1 - 1))));
        return { range: r, values: trim(rows.map(row => row.map(v => v ?? ""))) };
      }) });
    }
    if (path === "/values:batchUpdate") {
      calls.write++;
      assert.equal(body.valueInputOption, "RAW");
      for (const d of body.data) {
        const { tab, r1, c1 } = parseRange(d.range);
        d.values.forEach((row, i) => {
          const target = (sheets[tab].rows[r1 - 1 + i] ||= []);
          row.forEach((v, j) => { target[c1 - 1 + j] = v; });
        });
        for (let i = 0; i < sheets[tab].rows.length; i++) sheets[tab].rows[i] ||= [];
      }
      return json(200, {});
    }
    if (path === ":batchUpdate") {
      calls.write++;
      for (const rq of body.requests) {
        const byId = id => Object.values(sheets).find(s => s.id === id);
        if (rq.appendCells) {
          const s = byId(rq.appendCells.sheetId);
          trim(s.rows);
          for (const r of rq.appendCells.rows) {
            s.rows.push(r.values.map(c => {
              const v = c.userEnteredValue;
              return "numberValue" in v ? v.numberValue : "boolValue" in v ? v.boolValue : v.stringValue;
            }));
          }
        } else if (rq.deleteDimension) {
          const { sheetId, startIndex, endIndex } = rq.deleteDimension.range;
          byId(sheetId).rows.splice(startIndex, endIndex - startIndex);
        } else throw new Error("unexpected request " + JSON.stringify(rq));
      }
      return json(200, {});
    }
    if (path === "" && (init.method || "GET") === "GET") {
      return json(200, { sheets: Object.entries(sheets).map(([title, s]) => ({ properties: { title, sheetId: s.id } })) });
    }
    throw new Error("unmocked " + init.method + " " + path);
  };

  return { sheets, calls };
}
