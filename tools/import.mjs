/**
 * One-off: load the MySQL export into the Google Sheet and move the uploaded
 * images to Vercel Blob.
 *
 *   npm run sheet:import -- migration/export.json C:/xampp/htdocs/pantry
 *
 * Run `npm run sheet:init` first. Refuses to touch a tab that already holds
 * data (pass --force to overwrite). Ids and created_at are kept as they were.
 * Images are uploaded as-is (the old app already resized them to 1200px).
 */
import fs from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import { TABLES } from "../lib/store.js";
import { a1, colLetter, getValues, writeRanges } from "../lib/sheets.js";

const args = process.argv.slice(2).filter(a => a !== "--force");
const force = process.argv.includes("--force");
const [exportFile, appDir] = args;
if (!exportFile || !appDir) {
  console.error("Usage: npm run sheet:import -- <export.json> <old pantry app dir> [--force]");
  process.exit(1);
}

const dump = JSON.parse(fs.readFileSync(exportFile, "utf8"));

// MySQL column -> sheet column, where they differ.
const RENAME = { settings: { key_name: "key" } };

const NUMERIC = new Set(["id", "amount", "target_price", "collected_amount", "quantity", "sort_order", "visible", "target_total", "total_collected"]);

// --- images ----------------------------------------------------------------

const uploaded = new Map();
async function migrateImage(ref) {
  const src = String(ref || "").trim();
  if (!src.startsWith("uploads/")) return src; // already a URL or empty
  if (uploaded.has(src)) return uploaded.get(src);

  const file = path.join(appDir, src);
  if (!fs.existsSync(file)) {
    console.warn(`  ! missing image ${src} - left as is`);
    uploaded.set(src, src);
    return src;
  }
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" }[ext];
  const blob = await put(src, fs.readFileSync(file), {
    access: "public",
    contentType: mime,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 31536000
  });
  console.log(`  image ${src} -> ${blob.url}`);
  uploaded.set(src, blob.url);
  return blob.url;
}

// items.image may hold several comma-separated paths.
async function migrateImageList(value) {
  const parts = String(value || "").split(",").map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) out.push(await migrateImage(p));
  return out.join(", ");
}

// --- rows -------------------------------------------------------------------

async function rowsFor(table) {
  const cols = TABLES[table];
  const rename = RENAME[table] || {};
  const rows = [];
  for (const src of dump[table] || []) {
    const r = {};
    for (const [k, v] of Object.entries(src)) r[rename[k] || k] = v;

    if (table === "items") r.image = await migrateImageList(r.image);
    if (table === "showcase") r.image = await migrateImage(r.image);
    if (table === "expenses") r.receipt_image = await migrateImage(r.receipt_image);

    rows.push(cols.map(c => {
      const v = r[c];
      if (v === null || v === undefined) return "";
      if (NUMERIC.has(c) && v !== "" && Number.isFinite(Number(v))) return Number(v);
      return String(v);
    }));
  }
  // Single-row tabs keep only the latest row, as the MySQL app read them.
  if (table === "announcement" || table === "showcase") return rows.slice(-1);
  return rows;
}

const tabs = Object.keys(TABLES).filter(t => t !== "login_attempts");
const current = await getValues(tabs.map(t => a1(t, "A2:A")));
const busy = tabs.filter((t, i) => current[i].length > 0 && (dump[t] || []).length > 0);
if (busy.length && !force) {
  console.error(`These tabs already hold data: ${busy.join(", ")}. Re-run with --force to overwrite them.`);
  process.exit(1);
}

const writes = [];
for (const t of tabs) {
  if (!(dump[t] || []).length) continue;
  console.log(`${t}: ${dump[t].length} rows`);
  const rows = await rowsFor(t);
  // Blank any leftover rows below (only matters with --force).
  const height = Math.max(rows.length, current[tabs.indexOf(t)].length);
  while (rows.length < height) rows.push(TABLES[t].map(() => ""));
  writes.push({ range: a1(t, `A2:${colLetter(TABLES[t].length)}${height + 1}`), values: rows });
}
await writeRanges(writes);
console.log(`Done. ${uploaded.size} image(s) processed.`);
console.log("Check the sheet, then delete migration/export.json - it holds real staff data.");
