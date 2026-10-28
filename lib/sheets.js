/**
 * Minimal Google Sheets v4 client.
 *
 * No SDK: the service-account JWT is signed with node:crypto and exchanged for
 * an access token, then the REST API is called with fetch. That keeps the
 * function bundle small and cold starts short.
 *
 * Every value is written with RAW / typed cell data, never USER_ENTERED, so a
 * string such as "=IMPORTXML(...)" typed into a form is stored as text and can
 * never become a formula.
 */
import crypto from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets/";

let tokenCache = null;   // { token, exp }
let sheetIdCache = null; // { [title]: sheetId }

export class SheetsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function serviceAccount() {
  let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  let key = process.env.GOOGLE_PRIVATE_KEY || "";
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const json = JSON.parse(raw);
    email = json.client_email;
    key = json.private_key;
  }
  if (!email || !key) {
    throw new Error("Google service account is not configured (GOOGLE_SERVICE_ACCOUNT_JSON)");
  }
  // Env editors often store the PEM with literal "\n" sequences.
  return { email, key: key.replace(/\\n/g, "\n") };
}

export function spreadsheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID is not set");
  return id;
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;

  const { email, key } = serviceAccount();
  const enc = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  })}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(key, "base64url");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new SheetsError(res.status, `Google auth failed (${res.status}): ${body.error_description || body.error || "no token"}`);
  }
  tokenCache = { token: body.access_token, exp: now + (body.expires_in || 3600) };
  return tokenCache.token;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Call the Sheets API. 429 (quota) and 5xx are retried with backoff: the
 * per-minute read quota is shared by every visitor, so a burst is expected.
 */
async function request(method, path, { query, body } = {}) {
  const url = new URL(API_BASE + encodeURIComponent(spreadsheetId()) + path);
  for (const [k, v] of Object.entries(query || {})) {
    for (const item of [].concat(v)) url.searchParams.append(k, item);
  }

  for (let attempt = 0; ; attempt++) {
    const headers = { Authorization: `Bearer ${await accessToken()}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (res.ok) return res.json();

    if (res.status === 401) tokenCache = null;
    const retryable = res.status === 429 || res.status >= 500 || res.status === 401;
    if (retryable && attempt < 3) {
      await sleep(400 * 2 ** attempt + Math.random() * 250);
      continue;
    }
    const text = await res.text().catch(() => "");
    throw new SheetsError(res.status, `Sheets ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

/** A1 range on a tab; tab names are always quoted. */
export function a1(tab, range = "") {
  return `'${tab.replace(/'/g, "''")}'${range ? "!" + range : ""}`;
}

/** 1 -> A, 27 -> AA */
export function colLetter(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || "A";
}

/** Read several ranges in one call. Returns one 2-D array per range. */
export async function getValues(ranges) {
  const res = await request("GET", "/values:batchGet", {
    query: {
      ranges,
      majorDimension: "ROWS",
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING"
    }
  });
  return (res.valueRanges || []).map(v => v.values || []);
}

/** Overwrite several ranges in one atomic call. data: [{ range, values }] */
export async function writeRanges(data) {
  if (!data.length) return null;
  return request("POST", "/values:batchUpdate", {
    body: { valueInputOption: "RAW", data }
  });
}

/** Spreadsheet structural updates (appendCells, deleteDimension, addSheet...). */
export async function batchUpdate(requests) {
  if (!requests.length) return null;
  return request("POST", ":batchUpdate", { body: { requests } });
}

export async function getMeta() {
  return request("GET", "", { query: { fields: "sheets.properties(sheetId,title)" } });
}

export async function sheetIds(refresh = false) {
  if (!sheetIdCache || refresh) {
    const meta = await getMeta();
    sheetIdCache = {};
    for (const s of meta.sheets || []) {
      sheetIdCache[s.properties.title] = s.properties.sheetId;
    }
  }
  return sheetIdCache;
}

async function sheetIdOf(tab) {
  let ids = await sheetIds();
  if (ids[tab] === undefined) ids = await sheetIds(true);
  if (ids[tab] === undefined) throw new Error(`Sheet tab "${tab}" does not exist - run tools/init-sheet.mjs`);
  return ids[tab];
}

function cell(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { userEnteredValue: { numberValue: value } };
  }
  if (typeof value === "boolean") {
    return { userEnteredValue: { boolValue: value } };
  }
  // stringValue is always literal text - never parsed as a formula.
  return { userEnteredValue: { stringValue: value === null || value === undefined ? "" : String(value) } };
}

/** Request that appends rows after the last row with data on a tab. */
export async function appendRequest(tab, rows) {
  return {
    appendCells: {
      sheetId: await sheetIdOf(tab),
      rows: rows.map(r => ({ values: r.map(cell) })),
      fields: "userEnteredValue"
    }
  };
}

/** Requests that delete whole rows (1-based row numbers), bottom-up. */
export async function deleteRowsRequests(tab, rowNumbers) {
  const sheetId = await sheetIdOf(tab);
  return [...new Set(rowNumbers)]
    .sort((a, b) => b - a)
    .map(n => ({
      deleteDimension: {
        range: { sheetId, dimension: "ROWS", startIndex: n - 1, endIndex: n }
      }
    }));
}
