/**
 * Create the tabs and header rows in an empty Google Sheet, and seed the
 * single collection event. Safe to re-run: existing tabs are left alone.
 *
 *   npm run sheet:init
 */
import { TABLES, newId, nowLocal } from "../lib/store.js";
import { a1, getMeta, batchUpdate, getValues, writeRanges } from "../lib/sheets.js";

const meta = await getMeta();
const existing = new Set((meta.sheets || []).map(s => s.properties.title));

const add = Object.keys(TABLES).filter(t => !existing.has(t));
if (add.length) {
  await batchUpdate(add.map(title => ({
    addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } }
  })));
  console.log("Created tabs:", add.join(", "));
}

const tabs = Object.keys(TABLES);
const headers = await getValues(tabs.map(t => a1(t, "1:1")));
const writes = [];
tabs.forEach((t, i) => {
  if (!(headers[i][0] || []).length) {
    writes.push({ range: a1(t, "A1"), values: [TABLES[t]] });
  }
});
await writeRanges(writes);
if (writes.length) console.log("Wrote header rows:", writes.map(w => w.range).join(", "));

// There is exactly one collection event; edit_event needs it to exist.
const [events] = await getValues([a1("events", "A2:A")]);
if (!events.length) {
  await writeRanges([{
    range: a1("events", "A2"),
    values: [[newId(), "Pantry Aras 2", "", "active", 0, 0, nowLocal(), ""]]
  }]);
  console.log("Seeded the active collection event.");
}

// The default Sheet1 is not used.
if (existing.has("Sheet1") && existing.size === 1) {
  const sheet1 = meta.sheets.find(s => s.properties.title === "Sheet1");
  await batchUpdate([{ deleteSheet: { sheetId: sheet1.properties.sheetId } }]);
  console.log("Removed the empty Sheet1 tab.");
}

console.log("Sheet is ready.");
