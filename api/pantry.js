/**
 * JSON API (port of api.php). Served at /api.php through a rewrite in
 * vercel.json, so app.js keeps calling "api.php?action=...".
 *
 * Every POST is guarded twice: CSRF first, then the admin check (logout is
 * exempt from the admin check only, never from CSRF). Signing in is Google's
 * redirect flow in api/auth.js, not a POST here.
 */
import { put } from "@vercel/blob";
import crypto from "node:crypto";
import {
  loadSession, commitSession, verifyCsrf, isAdminSession, authInfo,
  logout, csrfToken, setJsonSecurityHeaders
} from "../lib/auth.js";
import { readBody, readJson, sendJson } from "../lib/http.js";
import * as store from "../lib/store.js";

// Vercel refuses request bodies over 4.5 MB; app.js shrinks images first.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

async function freshPayload() {
  return store.buildPublicPayload(store.getPantryData(await store.loadTables({ fresh: true })), true);
}

/** Identify an image by its bytes, not by a client-supplied name or type. */
function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (buf.length > 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString("latin1"))) return { ext: "gif", mime: "image/gif" };
  if (buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

// ---------------------------------------------------------------------------
// GET routes
// ---------------------------------------------------------------------------

async function handleGet(req, res, sess, action) {
  if (action === "check_auth") return sendJson(res, 200, authInfo(sess));

  if (action === "get_staff") {
    if (!isAdminSession(sess)) fail(403, "Unauthorized: Admin session required");
    return sendJson(res, 200, store.staffList(await store.loadTables({ fresh: true })));
  }

  if (action === "get_events") {
    if (!isAdminSession(sess)) fail(403, "Unauthorized: Admin session required");
    return sendJson(res, 200, { events: store.eventsList(await store.loadTables({ fresh: true })) });
  }

  const isAdmin = isAdminSession(sess);
  const tables = await store.loadTables({ fresh: isAdmin });
  return sendJson(res, 200, store.buildPublicPayload(store.getPantryData(tables), isAdmin));
}

// ---------------------------------------------------------------------------
// POST routes (admin only, except logout)
// ---------------------------------------------------------------------------

const POST_ROUTES = {
  async add_staff(body) {
    const name = String(body.name ?? "").trim();
    if (name === "") fail(400, "Nama staf diperlukan");
    const id = await store.addStaff(name, body.username);
    if (!id) fail(409, "Gagal menambah staf (nama mungkin sudah wujud)");
    return { success: true, id, message: "Staf berjaya ditambah" };
  },

  async update_staff(body) {
    const id = parseInt(body.id, 10) || 0;
    const name = String(body.name ?? "").trim();
    if (id <= 0 || name === "") fail(400, "ID dan Nama staf diperlukan");
    if (!await store.updateStaff(id, name, body.username)) fail(404, "Staf tidak dijumpai");
    return { success: true, message: "Maklumat staf berjaya dikemas kini" };
  },

  async delete_staff(body) {
    const id = parseInt(body.id, 10) || 0;
    if (id <= 0) fail(400, "ID staf tidak sah");
    if (!await store.deleteStaff(id)) fail(404, "Staf tidak dijumpai");
    return { success: true, message: "Staf berjaya dipadamkan" };
  },

  async edit_event(body) {
    const id = parseInt(body.event_id, 10) || 0;
    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim();
    if (id <= 0 || title === "") fail(400, "ID acara dan tajuk acara diperlukan");
    if (!await store.editEvent(id, title, description)) fail(404, "Acara tidak dijumpai");
    return { success: true, message: "Maklumat acara berjaya dikemas kini!", data: await freshPayload() };
  },

  async add_contribution(body) {
    const id = await store.addContribution({
      ...contributionFields(body),
      status: body.status,
      note: body.note
    });
    if (!id) fail(500, "Gagal merekodkan sumbangan");
    return { success: true, id, message: "Sumbangan berjaya direkodkan!", data: await freshPayload() };
  },

  async edit_contribution(body) {
    const id = parseInt(body.contribution_id ?? body.id, 10) || 0;
    if (id <= 0) fail(400, "ID sumbangan tidak sah");
    if (!await store.updateContribution(id, contributionFields(body))) fail(404, "Rekod sumbangan tidak dijumpai");
    return { success: true, message: "Rekod sumbangan berjaya dikemas kini!", data: await freshPayload() };
  },

  async delete_contribution(body) {
    const id = parseInt(body.contribution_id ?? body.id, 10) || 0;
    if (id <= 0) fail(400, "ID sumbangan tidak sah");
    if (!await store.deleteContribution(id)) fail(404, "Rekod sumbangan tidak dijumpai");
    return { success: true, message: "Rekod sumbangan berjaya dipadam!", data: await freshPayload() };
  },

  async restore_contributions() {
    const restored = await store.restoreContributions();
    if (restored === false) fail(409, "Tiada rekod sandaran untuk dipulihkan, atau senarai sumbangan tidak kosong.");
    return {
      success: true,
      restored,
      message: `Berjaya memulihkan ${restored} rekod sumbangan daripada sandaran.`,
      data: await freshPayload()
    };
  },

  async add_expense(body) {
    const fields = expenseFields(body);
    await store.addExpense(fields);
    return { success: true, message: "Rekod perbelanjaan berjaya ditambah!", data: await freshPayload() };
  },

  async edit_expense(body) {
    const id = parseInt(body.expense_id ?? body.id, 10) || 0;
    if (id <= 0) fail(400, "ID perbelanjaan, tajuk, dan jumlah (> 0) diperlukan");
    const fields = expenseFields(body);
    if (!await store.updateExpense(id, fields)) fail(404, "Rekod perbelanjaan tidak dijumpai");
    return { success: true, message: "Rekod perbelanjaan berjaya dikemas kini!", data: await freshPayload() };
  },

  async delete_expense(body) {
    const id = parseInt(body.expense_id ?? body.id, 10) || 0;
    if (id <= 0) fail(400, "ID perbelanjaan tidak sah");
    if (!await store.deleteExpense(id)) fail(404, "Rekod perbelanjaan tidak dijumpai");
    return { success: true, message: "Rekod perbelanjaan berjaya dipadam!", data: await freshPayload() };
  },

  async save_expense_categories(body) {
    if (!Array.isArray(body.categories)) fail(400, "Senarai kategori tidak sah");
    let cleaned = [];
    for (const cat of body.categories.slice(0, 50)) {
      const c = String(cat ?? "").trim().slice(0, 100);
      if (c !== "" && !cleaned.includes(c)) cleaned.push(c);
    }
    if (!cleaned.length) cleaned = ["Peralatan / Perkakas", "Makanan & Minuman", "Lain-lain"];
    await store.saveExpenseCategories(cleaned);
    return { success: true, message: "Senarai kategori perbelanjaan berjaya dikemas kini!", data: await freshPayload() };
  }
};
POST_ROUTES.update_expense = POST_ROUTES.edit_expense;

function contributionFields(body) {
  const name = String(body.name ?? "").trim();
  const amount = parseFloat(body.amount) || 0;
  if (name === "" || amount <= 0) fail(400, "Nama penyumbang dan jumlah (> 0) diperlukan");
  const date = String(body.date ?? "").trim();
  if (date !== "" && !/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(date)) {
    fail(400, "Format tarikh sumbangan tidak sah");
  }
  return { name, username: body.username, amount, date: date.replace("T", " ") };
}

function expenseFields(body) {
  const title = String(body.title ?? "").trim();
  const amount = parseFloat(body.amount) || 0;
  if (title === "" || amount <= 0) fail(400, "Tajuk perbelanjaan dan jumlah (> 0) diperlukan");
  const date = String(body.date ?? "").trim();
  if (date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, "Format tarikh perbelanjaan tidak sah");
  return {
    title,
    amount,
    date,
    category: String(body.category ?? "").trim() || "Lain-lain",
    staffName: String(body.staff_name ?? "").trim(),
    notes: String(body.notes ?? "").trim(),
    receiptImage: String(body.receipt_image ?? "").trim()
  };
}

async function handleUpload(req, res) {
  const buf = await readBody(req, MAX_UPLOAD_BYTES);
  if (!buf.length) fail(400, "Tiada gambar dimuat naik");
  const type = sniffImage(buf);
  if (!type) fail(400, "Fail bukan gambar yang sah (jpg, png, gif, webp)");
  if (!process.env.BLOB_READ_WRITE_TOKEN) fail(500, "Storan gambar (Vercel Blob) belum dikonfigurasi");

  const name = `uploads/item_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${type.ext}`;
  const blob = await put(name, buf, {
    access: "public",
    contentType: type.mime,
    addRandomSuffix: false,
    cacheControlMaxAge: 31536000
  });
  return sendJson(res, 200, { success: true, image_url: blob.url });
}

async function handlePost(req, res, sess, action) {
  if (!verifyCsrf(req, sess)) {
    // 403 with a flag the client keys off (see apiPost in app.js).
    fail(403, "Sesi tamat atau token keselamatan tidak sah. Sila muat semula halaman.", { csrf_expired: true });
  }

  if (action === "logout") {
    logout(sess);
    commitSession(req, res, sess);
    return sendJson(res, 200, { success: true, message: "Logged out successfully", csrf_token: csrfToken(sess) });
  }

  if (!isAdminSession(sess)) fail(403, "Unauthorized: Admin session required");

  if (action === "upload_image") return handleUpload(req, res);

  const route = Object.hasOwn(POST_ROUTES, action) ? POST_ROUTES[action] : null;
  if (route) {
    const body = await readJson(req);
    if (body === null) fail(400, "Invalid JSON input");
    return sendJson(res, 200, await route(body));
  }

  // Default POST: bulk save of settings, announcement, showcase and items.
  if (action !== "") fail(404, "Tindakan tidak dikenali");
  const data = await readJson(req);
  if (data === null) fail(400, "Invalid JSON input");
  if (!Array.isArray(data.items)) fail(422, "Missing items array in payload");
  await store.savePantryData(data);
  return sendJson(res, 200, { success: true, message: "Collection data updated successfully" });
}

export default async function handler(req, res) {
  setJsonSecurityHeaders(res);
  let sess;
  try {
    sess = loadSession(req);
    const action = String(req.query?.action ?? new URL(req.url, "http://x").searchParams.get("action") ?? "");

    if (req.method === "GET") {
      commitSession(req, res, sess);
      return await handleGet(req, res, sess, action);
    }
    if (req.method === "POST") {
      commitSession(req, res, sess);
      return await handlePost(req, res, sess, action);
    }
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (e) {
    if (e instanceof HttpError || e.status === 413) {
      const message = e.status === 413 ? "Saiz gambar melebihi had 4MB" : e.message;
      return sendJson(res, e.status, { error: message, ...(e.extra || {}) });
    }
    console.error("Unhandled error in api/pantry:", e);
    return sendJson(res, 500, { error: "Ralat pelayan dalaman" });
  }
}
