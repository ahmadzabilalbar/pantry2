/**
 * Pantry data layer on Google Sheets.
 *
 * One tab per former MySQL table; row 1 holds the column names. Columns are
 * mapped by header name, so someone reordering columns or adding a notes
 * column in the sheet does not corrupt anything - but the listed columns must
 * stay. tools/init-sheet.mjs creates the tabs.
 *
 * Rules carried over from the MySQL version (see AGENTS.md):
 *  - contributions / expenses are row-level: append one row, update one row,
 *    delete one row. Never rewrite those tabs.
 *  - items are upserted by id; created_at survives every save.
 *  - totals have one definition: computeTotals().
 *  - buildPublicPayload() is the only place that decides what is public.
 */
import {
  a1, colLetter, getValues, writeRanges, batchUpdate,
  appendRequest, deleteRowsRequests
} from "./sheets.js";

export const TABLES = {
  settings: ["key", "value"],
  announcement: ["title", "message", "updated_at"],
  showcase: ["title", "image", "description", "visible", "updated_at"],
  items: ["id", "name", "target_price", "collected_amount", "quantity", "image", "status", "description", "category", "icon", "sort_order", "created_at"],
  contributions: ["id", "name", "username", "amount", "date", "status", "note", "created_at"],
  contributions_backup: ["id", "name", "username", "amount", "date", "status", "note", "created_at"],
  events: ["id", "title", "description", "status", "target_total", "total_collected", "created_at", "closed_at"],
  expenses: ["id", "title", "amount", "date", "category", "staff_name", "notes", "receipt_image", "created_at"],
  staff: ["id", "name", "username", "created_at"]
};

// Tabs read for a page/API render.
const DATA_TABS = Object.keys(TABLES);

const DEFAULT_CATEGORIES = ["Peralatan / Perkakas", "Makanan & Minuman", "Lain-lain"];
const MAX_CELL = 45000; // Sheets refuses cells over 50,000 characters.

// ---------------------------------------------------------------------------
// Time & ids
// ---------------------------------------------------------------------------

const TZ = "Asia/Kuala_Lumpur";

/** Local wall-clock time as "YYYY-MM-DD HH:mm:ss" (what MySQL's NOW() stored). */
export function nowLocal() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export const todayLocal = () => nowLocal().slice(0, 10);

/**
 * Sheets has no auto-increment, and two requests may insert at once, so ids
 * are time-based with a random tail. They stay integers below 2^53, which
 * app.js already parses with parseInt(), and sort after the migrated MySQL ids.
 */
export function newId(offset = 0) {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000) + offset;
}

// ---------------------------------------------------------------------------
// Tab <-> objects
// ---------------------------------------------------------------------------

function parseTable(name, values) {
  const cols = TABLES[name];
  if (!values.length) {
    throw new Error(`Sheet tab "${name}" has no header row - run tools/init-sheet.mjs`);
  }
  const header = values[0].map(h => String(h ?? "").trim());
  const index = {};
  for (const c of cols) {
    const i = header.indexOf(c);
    if (i < 0) throw new Error(`Sheet tab "${name}" is missing column "${c}"`);
    index[c] = i;
  }

  const rows = [];
  values.slice(1).forEach((raw, i) => {
    if (!raw || raw.every(v => v === "" || v === null || v === undefined)) return;
    const row = { _row: i + 2, _raw: raw };
    for (const c of cols) row[c] = raw[index[c]] ?? "";
    rows.push(row);
  });
  return { name, header, rows, lastRow: values.length };
}

/** Object -> row array in the tab's column order, keeping unknown columns. */
function toRow(table, obj) {
  const out = table.header.map((_, i) => (obj._raw && obj._raw[i] !== undefined ? obj._raw[i] : ""));
  table.header.forEach((h, i) => {
    if (h in obj && !h.startsWith("_")) {
      let v = obj[h];
      if (typeof v === "string" && v.length > MAX_CELL) v = v.slice(0, MAX_CELL);
      out[i] = v === null || v === undefined ? "" : v;
    }
  });
  return out;
}

function rowRange(table, rowNumber) {
  return a1(table.name, `A${rowNumber}:${colLetter(table.header.length)}${rowNumber}`);
}

/**
 * Range write that replaces a whole small tab (settings / announcement /
 * showcase / items) in place. Rows past the new end are blanked in the same
 * call, so it is a single atomic write.
 */
function rewriteTableData(table, objs) {
  const rows = objs.map(o => toRow(table, o));
  const height = Math.max(rows.length, table.lastRow - 1);
  if (height === 0) return null;
  while (rows.length < height) rows.push(table.header.map(() => ""));
  return {
    range: a1(table.name, `A2:${colLetter(table.header.length)}${height + 1}`),
    values: rows
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

let cache = null; // { at, tables }
const CACHE_TTL_MS = 15000;

/**
 * Read every data tab in one batchGet.
 *
 * The Sheets read quota (~60/min for the service account) is shared by every
 * visitor, so public reads are served from a short per-instance cache; admin
 * reads and reads before a write pass fresh=true. If Google refuses (quota),
 * a stale copy is served rather than an error page.
 */
export async function loadTables({ fresh = false, tabs = DATA_TABS } = {}) {
  const full = tabs === DATA_TABS;
  if (full && !fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.tables;
  }
  try {
    const values = await getValues(tabs.map(t => a1(t)));
    const tables = {};
    tabs.forEach((t, i) => { tables[t] = parseTable(t, values[i]); });
    if (full) cache = { at: Date.now(), tables };
    return tables;
  } catch (e) {
    if (full && !fresh && cache) {
      console.error("Sheets read failed, serving cached data:", e.message);
      return cache.tables;
    }
    throw e;
  }
}

export function invalidateCache() {
  cache = null;
}

const num = v => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const int = v => Math.trunc(num(v));
const str = v => (v === null || v === undefined ? "" : String(v));
const truthy = v => v === true || v === 1 || ["1", "true", "yes"].includes(str(v).toLowerCase());

function parseJsonSetting(value) {
  try {
    return JSON.parse(str(value));
  } catch {
    return null;
  }
}

function settingsMap(tables) {
  const map = {};
  for (const r of tables.settings.rows) map[str(r.key)] = str(r.value);
  return map;
}

function contributionRows(table) {
  return table.rows.map(r => {
    let dt = str(r.date).trim();
    const created = str(r.created_at);
    if (dt !== "" && dt.length <= 10 && created.length >= 16) {
      dt += " " + created.slice(11, 16);
    } else if (dt === "" && created) {
      dt = created.slice(0, 16);
    }
    return {
      id: int(r.id),
      name: str(r.name),
      username: str(r.username),
      amount: num(r.amount),
      date: dt,
      created_at: created,
      status: str(r.status) || "paid",
      note: str(r.note)
    };
  }).sort((a, b) => a.id - b.id);
}

export function eventsList(tables) {
  return tables.events.rows.map(r => {
    const target = num(r.target_total);
    const collected = num(r.total_collected);
    return {
      id: int(r.id),
      title: str(r.title),
      description: str(r.description),
      status: str(r.status) || "active",
      target_total: target,
      total_collected: collected,
      lebihan: Math.max(0, collected - target),
      created_at: str(r.created_at),
      closed_at: str(r.closed_at) || null
    };
  }).sort((a, b) => b.id - a.id);
}

export function staffList(tables) {
  return tables.staff.rows
    .map(r => ({ id: int(r.id), name: str(r.name), username: str(r.username) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Port of get_pantry_data_db(): the full (private) dataset. */
export function getPantryData(tables) {
  const settings = settingsMap(tables);

  const annRow = tables.announcement.rows.at(-1);
  const announcement = annRow
    ? { title: str(annRow.title), message: str(annRow.message) }
    : {
        title: "Kutipan Barangan Dapur Mula Dibuka!",
        message: "Sumbangan kini dibuka untuk pembelian microwave dan peti sejuk baharu dapur. Semua ahli staf dijemput menyumbang."
      };

  const showRow = tables.showcase.rows.at(-1);
  const showcase = showRow
    ? { title: str(showRow.title), image: str(showRow.image), description: str(showRow.description), visible: truthy(showRow.visible) }
    : {
        title: "Kelengkapan Dapur & Pantry",
        image: "",
        description: "**Kemudahan Bersama Untuk Semua Staf**\n\nSumbangan ini bertujuan menyediakan kelengkapan dapur berkualiti tinggi untuk kegunaan harian bersama.",
        visible: true
      };

  const items = tables.items.rows
    .map(r => ({ r, sort: int(r.sort_order), created: str(r.created_at) }))
    .sort((a, b) => a.sort - b.sort || a.created.localeCompare(b.created))
    .map(({ r }) => ({
      id: str(r.id),
      name: str(r.name),
      target_price: num(r.target_price),
      collected_amount: num(r.collected_amount),
      quantity: int(r.quantity) || 1,
      image: str(r.image),
      status: str(r.status) || "seeking",
      description: str(r.description),
      category: str(r.category),
      icon: str(r.icon) || "fa-box"
    }));

  const contributions = contributionRows(tables.contributions);
  const contributionsBackupCount = contributions.length === 0 ? tables.contributions_backup.rows.length : 0;

  const expenses = tables.expenses.rows
    .map(r => ({
      id: int(r.id),
      title: str(r.title),
      amount: num(r.amount),
      date: str(r.date).slice(0, 10),
      category: str(r.category) || "Lain-lain",
      staff_name: str(r.staff_name),
      notes: str(r.notes),
      receipt_image: str(r.receipt_image)
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const events = eventsList(tables);
  const active = events.find(e => e.status === "active");

  let expenseCategories = parseJsonSetting(settings.expense_categories);
  if (!Array.isArray(expenseCategories) || !expenseCategories.length) expenseCategories = [...DEFAULT_CATEGORIES];

  let sectionVisibility = parseJsonSetting(settings.section_visibility);
  if (!sectionVisibility || typeof sectionVisibility !== "object" || Array.isArray(sectionVisibility)) sectionVisibility = {};
  sectionVisibility = {
    announcement: true, showcase: true, metrics: true, progress: true, items: true,
    expenses: true, coins: true, admin_report: true, admin_staff: true,
    ...sectionVisibility
  };

  const result = {
    currency: settings.currency || "RM",
    title: settings.title || "Pantry Aras 2",
    announcement,
    showcase,
    items,
    contributions,
    expenses,
    expense_categories: expenseCategories,
    events,
    active_event_id: active ? active.id : null,
    section_visibility: sectionVisibility,
    poster_footer: settings.poster_footer || "",
    section_visibility_saved_at: settings.section_visibility_saved_at ? int(settings.section_visibility_saved_at) : 0,
    contributions_backup_count: contributionsBackupCount
  };
  if (settings.target_total !== undefined && settings.target_total !== "") {
    result.target_total = num(settings.target_total);
  }
  return result;
}

export const FALLBACK_DATA = { currency: "RM", title: "Pantry Aras 2", items: [], contributions: [] };

// ---------------------------------------------------------------------------
// Totals & privacy (ports of compute_pantry_totals / build_public_payload)
// ---------------------------------------------------------------------------

const GENERIC_TITLES = ["", "pantry", "kongsi", "kongsi pantry", "pantry aras 2"];

export function formatPantryTitle(t) {
  const s = str(t).trim();
  return GENERIC_TITLES.includes(s.toLowerCase()) ? "Pantry Aras 2" : s;
}

/** Half away from zero, like PHP's round(). */
function round(x, digits = 2) {
  const f = 10 ** digits;
  return (Math.sign(x) * Math.round(Math.abs(x) * f + Number.EPSILON)) / f;
}

/** Single definition of every total; mirrored by computeTotals() in app.js. */
export function computeTotals(data) {
  let totalCollected = 0;
  for (const c of data.contributions || []) totalCollected += num(c.amount);

  let targetTotal = 0;
  let totalExpenses = 0;
  for (const itm of data.items || []) {
    const price = num(itm.target_price) * Math.max(1, int(itm.quantity ?? 1) || 1);
    targetTotal += price;
    if (["bought", "completed", "purchased", "dibeli"].includes(str(itm.status || "seeking").toLowerCase())) {
      totalExpenses += price;
    }
  }
  for (const e of data.expenses || []) totalExpenses += num(e.amount);

  const hasTarget = targetTotal > 0;
  return {
    total_collected: round(totalCollected),
    target_total: round(targetTotal),
    total_expenses: round(totalExpenses),
    baki: round(totalCollected - totalExpenses),
    remaining_needed: round(Math.max(0, targetTotal - totalCollected)),
    extra_amount: round(Math.max(0, totalCollected - targetTotal)),
    percent_complete: hasTarget ? Math.min(100, round((totalCollected / targetTotal) * 100, 1)) : 100,
    has_target: hasTarget,
    contributor_count: (data.contributions || []).length
  };
}

/** Given name only: everything from "bin"/"binti" on is dropped. */
export function publicGivenName(name) {
  const s = str(name).trim();
  const given = s.replace(/\s+(?:bin|binti)\b.*$/iu, "").trim();
  return given !== "" ? given : s;
}

/**
 * THE privacy filter. Non-admins get aggregate metrics plus anonymised giver
 * coins; the contribution log, staff names and event history stay private.
 * Any new field that carries giver identity must be stripped here.
 */
export function buildPublicPayload(source, isAdmin) {
  const data = { ...source };
  const stamp = c => {
    const t = Date.parse(str(c.date).replace(" ", "T"));
    return Number.isNaN(t) ? Infinity : t;
  };
  const ordered = [...(data.contributions || [])].sort((a, b) => stamp(a) - stamp(b));

  const giverCoins = [];
  let totalCollected = 0;
  let idx = 1;
  for (const c of ordered) {
    const amt = num(c.amount);
    if (amt <= 0) continue;
    totalCollected += amt;
    giverCoins.push({
      name: isAdmin ? (c.name || `Penyumbang #${idx}`) : `Penyumbang #${idx}`,
      amount: amt
    });
    idx++;
  }

  data.giver_coins = giverCoins;
  delete data.contributions_backup;
  // Derived BEFORE the ledger is stripped below.
  data.totals = computeTotals(data);

  if (!isAdmin) {
    data.total_collected = totalCollected;
    data.contributor_count = giverCoins.length;
    data.contributions = [];
    data.events = [];
    data.expenses = (data.expenses || []).map(e => ({ ...e, staff_name: publicGivenName(e.staff_name) }));
    delete data.contributions_backup_count;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

async function freshTables(tabs) {
  return loadTables({ fresh: true, tabs });
}

function done(result) {
  invalidateCache();
  return result;
}

/**
 * Bulk save: settings, announcement, showcase and items only (port of
 * save_pantry_data_db). Contributions and expenses are never written here.
 * One read, then one atomic values:batchUpdate.
 */
export async function savePantryData(data) {
  const t = await freshTables(["settings", "announcement", "showcase", "items"]);
  const writes = [];

  // 1. Settings (merged; unknown keys are kept)
  const settings = settingsMap(t);
  const before = JSON.stringify(settings);
  if (data.currency !== undefined) settings.currency = str(data.currency);
  if (data.title !== undefined) settings.title = str(data.title);
  if (data.target_total !== undefined) settings.target_total = str(data.target_total);
  if (Array.isArray(data.expense_categories)) {
    settings.expense_categories = JSON.stringify(data.expense_categories.map(str));
  }
  if (data.section_visibility !== undefined) {
    settings.section_visibility = typeof data.section_visibility === "object"
      ? JSON.stringify(data.section_visibility)
      : str(data.section_visibility);
    settings.section_visibility_saved_at = String(Math.floor(Date.now() / 1000));
  }
  if (JSON.stringify(settings) !== before) {
    writes.push(rewriteTableData(t.settings, Object.entries(settings).map(([key, value]) => ({ key, value }))));
  }

  // 2. Announcement (single row)
  if (data.announcement && typeof data.announcement === "object") {
    writes.push(rewriteTableData(t.announcement, [{
      title: str(data.announcement.title),
      message: str(data.announcement.message),
      updated_at: nowLocal()
    }]));
  }

  // 3. Showcase (single row)
  if (data.showcase && typeof data.showcase === "object") {
    writes.push(rewriteTableData(t.showcase, [{
      title: str(data.showcase.title),
      image: str(data.showcase.image),
      description: str(data.showcase.description),
      visible: data.showcase.visible ? 1 : 0,
      updated_at: nowLocal()
    }]));
  }

  // 4. Items: upsert by id in payload order; created_at (and any extra
  //    columns someone added in the sheet) carried over from the stored row.
  if (Array.isArray(data.items)) {
    const existing = new Map(t.items.rows.map(r => [str(r.id), r]));
    const objs = [];
    let sort = 0;
    for (const item of data.items) {
      const id = str(item && item.id);
      if (id === "") continue;
      const prev = existing.get(id);
      objs.push({
        _raw: prev ? prev._raw : undefined,
        id,
        name: str(item.name),
        target_price: num(item.target_price),
        collected_amount: num(item.collected_amount),
        quantity: Math.max(1, int(item.quantity ?? 1) || 1),
        image: str(item.image),
        status: str(item.status) || "seeking",
        description: str(item.description),
        category: str(item.category),
        icon: str(item.icon) || "fa-box",
        sort_order: sort++,
        created_at: prev ? str(prev.created_at) : nowLocal()
      });
    }
    writes.push(rewriteTableData(t.items, objs));
  }

  await writeRanges(writes.filter(Boolean));
  return done(true);
}

export async function saveExpenseCategories(categories) {
  const t = await freshTables(["settings"]);
  const settings = settingsMap(t);
  settings.expense_categories = JSON.stringify(categories);
  await writeRanges([rewriteTableData(t.settings, Object.entries(settings).map(([key, value]) => ({ key, value })))]);
  return done(true);
}

// --- Contributions (row-level) ---------------------------------------------

/** Append one contribution and its backup copy in one atomic call. */
export async function addContribution({ name, username = "", amount, date = "", status = "paid", note = "" }) {
  name = str(name).trim();
  amount = num(amount);
  if (name === "" || amount <= 0) return false;

  const t = await freshTables(["contributions", "contributions_backup"]);
  const id = newId();
  const row = {
    id,
    name,
    username: str(username).trim(),
    amount,
    date: str(date).trim() || nowLocal().slice(0, 16),
    status: str(status).trim() || "paid",
    note: str(note).trim().slice(0, 255),
    created_at: nowLocal()
  };
  await batchUpdate([
    await appendRequest("contributions", [toRow(t.contributions, row)]),
    await appendRequest("contributions_backup", [toRow(t.contributions_backup, row)])
  ]);
  return done(id);
}

/** Delete one contribution and one matching backup row. */
export async function deleteContribution(id) {
  id = int(id);
  if (id <= 0) return false;
  const t = await freshTables(["contributions", "contributions_backup"]);
  const row = t.contributions.rows.find(r => int(r.id) === id);
  if (!row) return false;

  const requests = await deleteRowsRequests("contributions", [row._row]);
  // Prefer the backup row with the same id (rows written by this app share
  // it); otherwise match on the row's values like the MySQL version did.
  const backup = t.contributions_backup.rows.find(r => int(r.id) === id)
    || t.contributions_backup.rows.find(r =>
      str(r.name) === str(row.name) && str(r.username) === str(row.username)
      && num(r.amount) === num(row.amount) && str(r.date) === str(row.date));
  if (backup) requests.push(...await deleteRowsRequests("contributions_backup", [backup._row]));

  await batchUpdate(requests);
  return done(true);
}

/** Explicit admin action: refill an empty ledger from the backup tab. */
export async function restoreContributions() {
  const t = await freshTables(["contributions", "contributions_backup"]);
  if (t.contributions.rows.length > 0) return false;
  const backup = contributionRows(t.contributions_backup);
  if (!backup.length) return false;

  const rows = backup.map(b => toRow(t.contributions, {
    id: b.id > 0 ? b.id : newId(),
    name: b.name,
    username: b.username,
    amount: b.amount,
    date: b.date || todayLocal(),
    status: b.status || "paid",
    note: b.note,
    created_at: b.created_at || nowLocal()
  }));
  await batchUpdate([await appendRequest("contributions", rows)]);
  return done(rows.length);
}

// --- Expenses (row-level) ---------------------------------------------------

function expenseRow(f) {
  return {
    title: str(f.title),
    amount: num(f.amount),
    date: str(f.date) || todayLocal(),
    category: str(f.category).trim() || "Lain-lain",
    staff_name: str(f.staffName),
    notes: str(f.notes),
    receipt_image: str(f.receiptImage)
  };
}

export async function addExpense(fields) {
  const t = await freshTables(["expenses"]);
  const row = { id: newId(), ...expenseRow(fields), created_at: nowLocal() };
  await batchUpdate([await appendRequest("expenses", [toRow(t.expenses, row)])]);
  return done(row.id);
}

export async function updateExpense(id, fields) {
  const t = await freshTables(["expenses"]);
  const row = t.expenses.rows.find(r => int(r.id) === int(id));
  if (!row) return false;
  await writeRanges([{
    range: rowRange(t.expenses, row._row),
    values: [toRow(t.expenses, { ...row, ...expenseRow(fields) })]
  }]);
  return done(true);
}

export async function deleteExpense(id) {
  const t = await freshTables(["expenses"]);
  const row = t.expenses.rows.find(r => int(r.id) === int(id));
  if (!row) return false;
  await batchUpdate(await deleteRowsRequests("expenses", [row._row]));
  return done(true);
}

// --- Event (there is exactly one) -------------------------------------------

export async function editEvent(id, title, description = "") {
  const t = await freshTables(["events", "settings"]);
  const row = t.events.rows.find(r => int(r.id) === int(id));
  if (!row) return false;

  const writes = [{
    range: rowRange(t.events, row._row),
    values: [toRow(t.events, { ...row, title, description })]
  }];
  if (str(row.status) === "active") {
    const settings = settingsMap(t);
    settings.title = title;
    writes.push(rewriteTableData(t.settings, Object.entries(settings).map(([key, value]) => ({ key, value }))));
  }
  await writeRanges(writes);
  return done(true);
}

// --- Staff directory -------------------------------------------------------

export async function addStaff(name, username = "") {
  name = str(name).trim();
  if (name === "") return false;
  const t = await freshTables(["staff"]);
  // The MySQL column was UNIQUE.
  if (t.staff.rows.some(r => str(r.name).toLowerCase() === name.toLowerCase())) return false;
  const id = newId();
  await batchUpdate([await appendRequest("staff", [toRow(t.staff, {
    id, name, username: str(username).trim(), created_at: nowLocal()
  })])]);
  return done(id);
}

export async function updateStaff(id, name, username = "") {
  name = str(name).trim();
  if (int(id) <= 0 || name === "") return false;
  const t = await freshTables(["staff"]);
  const row = t.staff.rows.find(r => int(r.id) === int(id));
  if (!row) return false;
  await writeRanges([{
    range: rowRange(t.staff, row._row),
    values: [toRow(t.staff, { ...row, name, username: str(username).trim() })]
  }]);
  return done(true);
}

export async function deleteStaff(id) {
  const t = await freshTables(["staff"]);
  const row = t.staff.rows.find(r => int(r.id) === int(id));
  if (!row) return false;
  await batchUpdate(await deleteRowsRequests("staff", [row._row]));
  return done(true);
}
