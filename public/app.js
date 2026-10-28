/**
 * Pantry
 * Local account authentication (Zabil as Admin),
 * 2-column item card layout with image uploads and private Admin Giver Report.
 */

// Application State
const state = {
  // Expense months shown expanded; starts with the current month only
  openExpenseMonths: new Set([currentMonthKey()]),
  data: {
    currency: "RM",
    title: "Pantry Aras 2",
    announcement: {
      title: "Kutipan Barangan Dapur Mula Dibuka!",
      message: "Sumbangan kini dibuka untuk pembelian microwave dan peti sejuk baharu dapur. Semua ahli staf dijemput menyumbang."
    },
    showcase: {
      title: "Kelengkapan Dapur & Pantry",
      image: "",
      description: "**Kemudahan Bersama Untuk Semua Staf**\n\nSumbangan ini bertujuan menyediakan kelengkapan dapur berkualiti tinggi untuk kegunaan harian bersama."
    },
    items: [],
    contributions: [],
    section_visibility: {
      announcement: true,
      showcase: true,
      metrics: true,
      progress: true,
      items: true,
      expenses: true,
      coins: true,
      admin_report: true,
      admin_staff: true
    }
  },
  staffList: [], // Loaded from staff_names.txt
  giverSearchQuery: "",
  giverSortOrder: "newest",
  isAdmin: false,
  adminName: "Ahmad Zabil Albar",
  csrfToken: ""
};

// ---------------------------------------------------------------------------
// API transport
//
// Every state-changing request must carry the per-session CSRF token in
// X-CSRF-Token; api.php rejects a POST without it. Routing all writes through
// these helpers means a new endpoint cannot forget the header.
// ---------------------------------------------------------------------------

function getCsrfToken() {
  return state.csrfToken || (window.INITIAL_AUTH && window.INITIAL_AUTH.csrf_token) || "";
}

/** GET a JSON endpoint. Returns the parsed body, or throws on a transport error. */
async function apiGet(url) {
  const res = await fetch(url, { cache: "no-cache", credentials: "same-origin" });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/**
 * POST to an endpoint with the CSRF token attached.
 *
 * @param {string} url
 * @param {object|FormData|null} payload JSON-encoded, or a FormData carrying
 *   an "image" file for upload_image.
 */
async function apiPost(url, payload = null) {
  const headers = { "X-CSRF-Token": getCsrfToken() };
  const init = { method: "POST", headers, credentials: "same-origin" };

  if (payload instanceof FormData) {
    // Image upload: the server takes the raw image bytes, shrunk here first
    // (Vercel refuses request bodies over 4.5 MB, and smaller is faster).
    const blob = await compressImageForUpload(payload.get("image"));
    if (blob.size > MAX_UPLOAD_BYTES) {
      return { ok: false, status: 413, body: { error: "Saiz gambar melebihi had 4MB walaupun selepas dimampatkan" } };
    }
    headers["Content-Type"] = blob.type || "application/octet-stream";
    init.body = blob;
  } else if (payload !== null) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(payload);
  }

  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));

  // A rejected token means the session rotated or expired underneath us. Say so
  // plainly instead of surfacing a generic failure the user cannot act on.
  if (body.csrf_expired) {
    showToast("Sesi anda telah tamat. Sila muat semula halaman dan log masuk semula.", "error");
  }

  return { ok: res.ok, status: res.status, body };
}

// ---------------------------------------------------------------------------
// Upload compression
//
// Every image is stored at the smallest size that stays readable: at most
// 1000px on the long edge (receipt text and QR codes remain legible), encoded
// as WebP q0.6, or JPEG q0.65 where the browser cannot encode WebP. A typical
// phone photo lands around 60-150 KB. Animated GIFs are sent untouched, and
// the original is kept whenever re-encoding would not make it smaller.
// ---------------------------------------------------------------------------

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const UPLOAD_MAX_EDGE = 1000;
const UPLOAD_WEBP_QUALITY = 0.6;
const UPLOAD_JPEG_QUALITY = 0.65;

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

async function compressImageForUpload(file) {
  if (!(file instanceof Blob) || file.type === "image/gif") return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    return file; // undecodable here (e.g. HEIC) - the server validates it
  }

  const scale = Math.min(1, UPLOAD_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  // White behind transparent PNGs (QR codes), which JPEG would turn black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();

  let blob = await canvasToBlob(canvas, "image/webp", UPLOAD_WEBP_QUALITY);
  // Browsers without a WebP encoder silently return PNG instead.
  if (!blob || blob.type !== "image/webp") {
    blob = await canvasToBlob(canvas, "image/jpeg", UPLOAD_JPEG_QUALITY);
  }
  if (!blob) return file;
  return blob.size < file.size || scale < 1 ? blob : file;
}

const GENERIC_TITLES = ["", "pantry", "kongsi", "kongsi pantry", "pantry aras 2"];

function formatPantryTitle(title) {
  if (!title || typeof title !== "string") return "Pantry Aras 2";
  const trimmed = title.trim();
  return GENERIC_TITLES.includes(trimmed.toLowerCase()) ? "Pantry Aras 2" : trimmed;
}

// Initializer
document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

// Theme Management (Dark / Light Theme Switcher)
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  
  const themeBtnIcon = document.getElementById("themeBtnIcon");
  const btnToggleTheme = document.getElementById("btnToggleTheme");
  
  if (themeBtnIcon) {
    themeBtnIcon.className = theme === "light" ? "fa-solid fa-sun" : "fa-solid fa-moon";
  }
  if (btnToggleTheme) {
    btnToggleTheme.title = theme === "light" ? "Tukar ke Mod Gelap" : "Tukar ke Mod Terang";
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
  const newTheme = currentTheme === "light" ? "dark" : "light";
  applyTheme(newTheme);
  showToast(newTheme === "light" ? "Mod Terang (Light Theme) diaktifkan" : "Mod Gelap (Dark Theme) diaktifkan", "info");
}

async function initApp() {
  initTheme();
  setupEventListeners();
  setDefaultDate();

  // api/page.js server-renders the auth state and the privacy-filtered dataset,
  // so a normal page load needs zero API round trips before first paint.
  const bootstrapped = applyBootstrapPayload();
  showLoginResult();

  try {
    if (bootstrapped) {
      loadStaffList();
    } else {
      await checkSessionAuth();
      await Promise.all([
        loadData(),
        loadStaffList()
      ]);
      return;
    }
  } catch (e) {
    console.error("Initialization error:", e);
  }

  updateAllUI();
}

// Seed state from the server-rendered bootstrap payload. Returns false when the
// page was served without one (e.g. app.js loaded standalone), so the caller
// falls back to fetching over the API.
function applyBootstrapPayload() {
  const auth = window.INITIAL_AUTH;
  const data = window.INITIAL_DATA;
  if (!data || typeof data !== "object") return false;

  if (auth && typeof auth === "object") {
    state.isAdmin = Boolean(auth.is_admin);
    if (auth.full_name) state.adminName = auth.full_name;
  }
  state.data = data;
  state.storageType = "ssr";
  console.log("Bootstrapped from server-rendered payload (0 API round trips)");
  return true;
}

// Google sign-in returns to "/?login=<result>" (see api/auth.js). Report it,
// then drop the parameter so a reload doesn't repeat the toast.
function showLoginResult() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("login");
  if (!result) return;
  params.delete("login");
  const qs = params.toString();
  history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);

  const messages = {
    ok: [`Berjaya log masuk sebagai Pentadbir ${state.adminName}!`, "success"],
    batal: ["Log masuk dibatalkan", "info"],
    ditolak: ["Akaun Google ini tidak dibenarkan log masuk sebagai Pentadbir", "error"],
    gagal: ["Log masuk Google gagal. Sila cuba lagi.", "error"]
  };
  const [message, type] = messages[result] || messages.gagal;
  showToast(message, type);
}

// Check session authentication status via api.php?action=check_auth
async function checkSessionAuth() {
  try {
    const { ok, body: auth } = await apiGet("api.php?action=check_auth");
    if (!ok) return false;

    const wasAdmin = state.isAdmin;
    state.isAdmin = Boolean(auth.is_admin);
    if (state.isAdmin && auth.full_name) state.adminName = auth.full_name;
    if (auth.csrf_token) state.csrfToken = auth.csrf_token;

    // Admin sees a richer payload than the anonymous one, so re-fetch only when
    // the privilege level actually changed.
    return state.isAdmin !== wasAdmin;
  } catch (err) {
    console.warn("Failed checking session auth:", err);
    return false;
  }
}

function formatDateTimeDisplay(dateStr) {
  if (!dateStr || dateStr === '-') return '-';
  const str = String(dateStr).replace('T', ' ').trim();
  
  const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?/);
  if (match) {
    const yyyy = match[1];
    const m = parseInt(match[2], 10);
    const d = parseInt(match[3], 10);
    const hh = match[4] ? match[4].padStart(2, '0') : '';
    const mm = match[5] ? match[5] : '';
    
    const timePart = hh ? ` ${hh}:${mm}` : '';
    return `${d}/${m}/${yyyy}${timePart}`;
  }
  
  return str;
}

// Set default date & time picker to now
function setDefaultDate() {
  const dateInput = document.getElementById("inputCollectionDate");
  if (dateInput) {
    const now = new Date();
    const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    dateInput.value = localIso;
  }
}

// Load Staff List from pre-rendered SSR window.INITIAL_STAFF or API action=get_staff fallback
async function loadStaffList() {
  if (Array.isArray(window.INITIAL_STAFF) && window.INITIAL_STAFF.length > 0) {
    state.staffList = window.INITIAL_STAFF;
    console.log(`Loaded ${state.staffList.length} staff members (Pre-rendered SSR)`);
    populateStaffDropdown();
    return;
  }
  // The directory is admin-only; asking anonymously only earns a 403 and
  // costs a function invocation on every public page view.
  if (!state.isAdmin) return;
  try {
    const { ok, body: list } = await apiGet("api.php?action=get_staff");
    if (ok) {
      if (Array.isArray(list) && list.length > 0) {
        state.staffList = list;
        console.log(`Loaded ${list.length} staff members from server API`);
        populateStaffDropdown();
        if (state.isAdmin) renderAdminGiverReport(state.data.currency || "RM");
        return;
      }
    }
  } catch (e) {
    console.error("Failed fetching staff via API endpoint:", e);
  }
}

// Populate Staff Dropdown Menu Options with Real-Time Filter
function populateStaffDropdown(filterQuery = "") {
  const select = document.getElementById("selectStaffName");
  const countEl = document.getElementById("staffFilteredCount");
  if (!select) return;

  const query = (filterQuery || "").trim().toLowerCase();
  const sortedStaff = [...state.staffList].sort((a, b) => a.name.localeCompare(b.name));

  const filteredStaff = sortedStaff.filter(s => {
    if (!query) return true;
    const nameMatch = (s.name || "").toLowerCase().includes(query);
    const userMatch = (s.username || "").toLowerCase().includes(query);
    return nameMatch || userMatch;
  });

  if (countEl) {
    countEl.textContent = query
      ? `${filteredStaff.length} daripada ${state.staffList.length}`
      : `${state.staffList.length}`;
  }

  select.innerHTML = `
    <option value="">-- Pilih Ahli Staf UUM IT (${filteredStaff.length}) --</option>
    ${filteredStaff.map(s => `
      <option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>
    `).join('')}
  `;
  populateExpenseStaffDropdown();
}

// Populate Staff Dropdown inside Add/Edit Expense Modal with Real-Time Search Filter
// Expense categories come from the `expense_categories` setting. A category
// that is no longer in the list (an older record) is kept as an extra option
// so editing that record does not silently change it.
function populateExpenseCategorySelect(selected = "Lain-lain") {
  const select = document.getElementById("inputExpenseCategory");
  if (!select) return;
  const categories = Array.isArray(state.data.expense_categories) && state.data.expense_categories.length
    ? [...state.data.expense_categories]
    : ["Peralatan / Perkakas", "Makanan & Minuman", "Lain-lain"];
  if (selected && !categories.includes(selected)) categories.push(selected);
  select.innerHTML = categories
    .map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("");
  select.value = categories.includes(selected) ? selected : categories[0];
}

async function manageExpenseCategories() {
  const current = (state.data.expense_categories || []).join(", ");
  const input = prompt("Senarai kategori perbelanjaan (pisahkan dengan koma):", current);
  if (input === null) return;
  const categories = input.split(",").map(c => c.trim()).filter(Boolean);
  const select = document.getElementById("inputExpenseCategory");
  const selected = select ? select.value : "Lain-lain";
  try {
    const { ok, body: result } = await apiPost("api.php?action=save_expense_categories", { categories });
    if (ok && result.success) {
      if (result.data) state.data = result.data;
      populateExpenseCategorySelect(selected);
      showToast(result.message || "Senarai kategori dikemas kini!", "success");
    } else {
      showToast((result && result.error) || "Gagal menyimpan senarai kategori", "error");
    }
  } catch (err) {
    console.error(err);
    showToast("Ralat sambungan semasa menyimpan kategori", "error");
  }
}

function populateExpenseStaffDropdown(filterQuery = "") {
  const select = document.getElementById("inputExpenseStaff");
  const countEl = document.getElementById("expenseStaffFilteredCount");
  if (!select) return;

  const currentVal = select.value;
  const query = (filterQuery || "").trim().toLowerCase();
  const sortedStaff = [...(state.staffList || [])].sort((a, b) => a.name.localeCompare(b.name));

  const filteredStaff = sortedStaff.filter(s => {
    if (!query) return true;
    const nameMatch = (s.name || "").toLowerCase().includes(query);
    const userMatch = (s.username || "").toLowerCase().includes(query);
    return nameMatch || userMatch;
  });

  if (countEl) {
    countEl.textContent = query
      ? `${filteredStaff.length} daripada ${sortedStaff.length}`
      : `${sortedStaff.length}`;
  }

  select.innerHTML = `
    <option value="">-- Pilih Ahli Staf (Pilihan ${filteredStaff.length}) --</option>
    ${filteredStaff.map(s => `
      <option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>
    `).join('')}
  `;

  if (currentVal && filteredStaff.some(s => s.name === currentVal)) {
    select.value = currentVal;
  }
}

// Load collection data from the API (Google Sheets behind it)
async function loadData() {
  try {
    const { ok, body: json } = await apiGet("api.php");
    if (ok) {
      state.data = json;
      state.storageType = "api";
      console.log("Loaded collection data from the API");
    } else {
      throw new Error("api.php not responding");
    }
  } catch (err) {
    console.error("API server fetch error:", err);
  }

  updateAllUI();
}

// Save data through the bulk API route
// Keys the server derives or owns; sending them back is wasted bandwidth and
// invites the client to overwrite server state with a stale copy.
const SERVER_DERIVED_KEYS = [
  "giver_coins",
  "contributions_backup",
  "contributions_backup_count",
  "events",
  "active_event_id",
  "total_collected",
  "contributor_count",
  "total_expenses",
  "totals",
  "section_visibility_saved_at",
  // Tables with their own row-level endpoints. Sending them back here would ask
  // the server to rewrite the whole table, renumbering ids the open UI still
  // holds and resetting created_at timestamps.
  "contributions",
  "expenses"
];

// Returns true only when the server confirmed the write, so callers can avoid
// reporting success for a save that never landed.
async function saveData() {
  try {
    const payload = { ...state.data };
    SERVER_DERIVED_KEYS.forEach(k => delete payload[k]);

    const { ok, body: result } = await apiPost("api.php", payload);
    if (!ok) {
      showToast(result.error || "Gagal menyimpan data ke pangkalan data", "error");
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed saving through the API:", err);
    showToast("Ralat sambungan: data tidak disimpan ke pelayan", "error");
    return false;
  }
}

/**
 * Totals for the dataset currently on screen.
 *
 * Prefers the server-computed `totals` block (build_public_payload ships it, and
 * api/page.js renders from the same server helper) so the SSR page and the client
 * cannot disagree. The local computation is the fallback for an archived-event
 * payload and for optimistic UI between a write and its refetch.
 */
function computeTotals() {
  const data = state.data || {};
  const contributions = data.contributions || [];

  if (data.totals && typeof data.totals === "object") {
    return data.totals;
  }

  const totalFromList = contributions.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
  // A non-admin payload carries the aggregate instead of the individual rows.
  const totalCollected = (data.total_collected !== undefined && contributions.length === 0)
    ? parseFloat(data.total_collected) || 0
    : totalFromList;

  let targetTotal = 0;
  let totalExpenses = 0;
  (data.items || []).forEach(i => {
    const qty = Math.max(1, parseInt(i.quantity, 10) || 1);
    const price = (parseFloat(i.target_price) || 0) * qty;
    targetTotal += price;
    if (["bought", "completed", "purchased", "dibeli"].includes((i.status || "").toLowerCase())) {
      totalExpenses += price;
    }
  });
  (data.expenses || []).forEach(e => {
    totalExpenses += parseFloat(e.amount) || 0;
  });

  const hasTarget = targetTotal > 0;
  return {
    total_collected: totalCollected,
    target_total: targetTotal,
    total_expenses: totalExpenses,
    baki: totalCollected - totalExpenses,
    remaining_needed: Math.max(0, targetTotal - totalCollected),
    extra_amount: Math.max(0, totalCollected - targetTotal),
    // Matches compute_pantry_totals() in db.php: one decimal, capped at 100.
    percent_complete: hasTarget ? Math.min(100, Math.round((totalCollected / targetTotal) * 1000) / 10) : 100,
    has_target: hasTarget,
    contributor_count: (data.contributor_count !== undefined && contributions.length === 0)
      ? parseInt(data.contributor_count, 10) || 0
      : contributions.length
  };
}

// Master UI Update & Calculation Function
function updateAllUI() {
  const currency = state.data.currency || "RM";

  const totals = computeTotals();
  const totalCollected = totals.total_collected;
  const totalTargetGoal = totals.target_total;
  const hasTargetGoal = totals.has_target;
  const overallPercent = totals.percent_complete;

  // 1. Update Header Title, Announcement & Currency
  const appTitleEl = document.getElementById("appTitle");
  if (appTitleEl && state.data.title) appTitleEl.textContent = formatPantryTitle(state.data.title);
  document.title = formatPantryTitle(state.data.title);
  document.querySelectorAll(".currency-label").forEach(el => el.textContent = currency);

  if (state.data.announcement) {
    const annTitleEl = document.getElementById("announcementTitle");
    const annMsgEl = document.getElementById("announcementMessage");
    if (annTitleEl && state.data.announcement.title) annTitleEl.textContent = state.data.announcement.title;
    if (annMsgEl && state.data.announcement.message) {
      const rawAnnMsg = state.data.announcement.message;
      const formattedAnnMsg = (typeof marked !== 'undefined' && typeof marked.parse === 'function')
        ? sanitizeHtml(marked.parse(rawAnnMsg))
        : `<p>${escapeHtml(rawAnnMsg)}</p>`;
      annMsgEl.innerHTML = formattedAnnMsg;
    }
  }

  if (state.data.showcase) {
    const showTitleEl = document.getElementById("showcaseTitle");
    const showDescEl = document.getElementById("showcaseDescription");
    const showImgEl = document.getElementById("showcaseImage");
    const showImgBox = document.getElementById("showcaseImageBox");
    const showcaseSec = document.getElementById("showcaseSection");
    const topGrid = document.querySelector(".top-info-grid");
    const iconVis = document.getElementById("iconShowcaseVisibility");

    const isVisible = state.data.showcase.visible !== false;

    if (showTitleEl && state.data.showcase.title) showTitleEl.textContent = state.data.showcase.title;
    if (showDescEl && state.data.showcase.description) {
      const rawDesc = state.data.showcase.description;
      const formattedDesc = (typeof marked !== 'undefined' && typeof marked.parse === 'function')
        ? sanitizeHtml(marked.parse(rawDesc))
        : `<p>${escapeHtml(rawDesc)}</p>`;
      showDescEl.innerHTML = formattedDesc;
    }

    if (showImgEl && showImgBox) {
      if (state.data.showcase.image) {
        showImgEl.src = state.data.showcase.image;
        showImgBox.style.display = "block";
      } else {
        showImgBox.style.display = "none";
      }
    }

    if (showcaseSec) {
      if (isVisible) {
        showcaseSec.style.display = "flex";
        showcaseSec.style.opacity = "1";
        if (topGrid) topGrid.style.gridTemplateColumns = "";
        if (iconVis) iconVis.className = "fa-solid fa-eye";
      } else {
        if (state.isAdmin) {
          showcaseSec.style.display = "flex";
          showcaseSec.style.opacity = "0.45";
          if (topGrid) topGrid.style.gridTemplateColumns = "";
          if (iconVis) iconVis.className = "fa-solid fa-eye-slash";
        } else {
          showcaseSec.style.display = "none";
          if (topGrid) topGrid.style.gridTemplateColumns = "1fr";
        }
      }
    }
  }

  const totalExpenses = totals.total_expenses;
  const bakiSemasa = totals.baki;

  // 2. Update Metric Stat Cards (Jumlah Kutipan Terkini, Jumlah Perbelanjaan Terkini, Baki)
  const totalCollectedEl = document.getElementById("statTotalCollected");
  if (totalCollectedEl) totalCollectedEl.textContent = `${currency} ${formatMoney(totalCollected)}`;

  const totalExpensesEl = document.getElementById("statTotalExpenses");
  if (totalExpensesEl) totalExpensesEl.textContent = `${currency} ${formatMoney(totalExpenses)}`;

  const bakiSemasaEl = document.getElementById("statBakiSemasa");
  if (bakiSemasaEl) bakiSemasaEl.textContent = `${currency} ${formatMoney(bakiSemasa)}`;

  const bakiCardEl = document.getElementById("statBakiCard");
  if (bakiCardEl) {
    if (bakiSemasa < 0) {
      bakiCardEl.classList.remove("gold");
      bakiCardEl.classList.add("surplus");
    } else {
      bakiCardEl.classList.remove("surplus");
      bakiCardEl.classList.add("gold");
    }
  }

  // Progress Box Visibility
  const progressBoxEl = document.getElementById("overallProgressBox");
  if (progressBoxEl) progressBoxEl.style.display = hasTargetGoal ? "" : "none";

  // 4. Admin UI Visibility Updates
  updateAdminUIState();

  // 5. Render Items Grid
  renderItemsGrid(currency);

  // 6. Render Public Expenses & Receipts List
  renderPublicExpenses(currency);

  // 7. Render Admin Giver Report (Private Admin Section)
  renderAdminGiverReport(currency);

  // 8. Render Admin Staff Directory Management
  renderAdminStaffManagement();

  // 9. Render Giver Coins Visual Wall (Bottom)
  renderGiverCoins();

  // 10. Apply Section Visibility Rules
  applySectionVisibility();
}

// Local "YYYY-MM" for today
function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Open/close one month in the expenses table without re-rendering it
function toggleExpenseMonth(btn) {
  const key = btn.dataset.month;
  const open = !state.openExpenseMonths.has(key);
  if (open) state.openExpenseMonths.add(key); else state.openExpenseMonths.delete(key);
  btn.setAttribute("aria-expanded", String(open));
  btn.closest("tbody").querySelectorAll("tr[data-month]").forEach(tr => {
    if (tr.dataset.month === key) tr.hidden = !open;
  });
}

const MALAY_MONTHS = ["Januari", "Februari", "Mac", "April", "Mei", "Jun",
  "Julai", "Ogos", "September", "Oktober", "November", "Disember"];

// "2026-10" -> "Oktober 2026"
function formatMonthLabel(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(key || "");
  if (!m) return "Tiada Tarikh";
  return `${MALAY_MONTHS[parseInt(m[2], 10) - 1] || m[2]} ${m[1]}`;
}

// Render Public Expenses & Receipts Table Section
function renderPublicExpenses(currency) {
  const container = document.getElementById("expensesGridContainer");
  if (!container) return;

  const expenses = state.data.expenses || [];

  if (expenses.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem 1rem; background: var(--bg-card); border: 1px solid var(--border-glass); border-radius: 16px; color: var(--text-muted);">
        <i class="fa-solid fa-receipt" style="font-size: 2.5rem; margin-bottom: 0.75rem; opacity: 0.4; color: #c084fc;"></i>
        <p style="margin: 0; font-size: 0.95rem;">Belum ada rekod perbelanjaan atau resit dimasukkan.</p>
        ${state.isAdmin ? `<button type="button" class="btn btn-sm btn-success" data-action="open-add-expense" style="margin-top: 1rem;"><i class="fa-solid fa-plus-circle"></i> Rekod Perbelanjaan Pertama</button>` : ''}
      </div>`;
    return;
  }

  const totalExpensesSum = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const colCount = state.isAdmin ? 6 : 5;

  // Newest first, grouped by month (dates are YYYY-MM-DD)
  const sorted = [...expenses].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")) || (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0));
  const years = [];
  for (const exp of sorted) {
    const key = /^\d{4}-\d{2}/.test(exp.date || "") ? exp.date.slice(0, 7) : "";
    const amount = parseFloat(exp.amount) || 0;
    let year = years[years.length - 1];
    if (!year || year.key !== key.slice(0, 4)) years.push(year = { key: key.slice(0, 4), months: [], sum: 0, count: 0 });
    let month = year.months[year.months.length - 1];
    if (!month || month.key !== key) year.months.push(month = { key, items: [], sum: 0 });
    month.items.push(exp);
    month.sum += amount;
    year.sum += amount;
    year.count++;
  }
  let rowNo = 0;

  const groupRow = (cls, label, count, sum) => `
    <tr class="${cls}">
      <td colspan="${colCount}">
        <div class="group-row-inner">
          <span>${escapeHtml(label)} <span class="group-row-count">${count} rekod</span></span>
          <span>${currency} ${formatMoney(sum)}</span>
        </div>
      </td>
    </tr>`;

  // Only the open months show their rows; the rest collapse to the header
  const monthRow = (group) => {
    const open = state.openExpenseMonths.has(group.key);
    return `
    <tr class="month-row">
      <td colspan="${colCount}">
        <button type="button" class="group-row-inner group-toggle" data-action="toggle-expense-month"
                data-month="${escapeHtml(group.key)}" aria-expanded="${open}">
          <span><i class="fa-solid fa-chevron-right group-chevron"></i> ${escapeHtml(formatMonthLabel(group.key))} <span class="group-row-count">${group.items.length} rekod</span></span>
          <span>${currency} ${formatMoney(group.sum)}</span>
        </button>
      </td>
    </tr>`;
  };

  container.innerHTML = `
    <div class="table-card" style="margin-top: 1rem;">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th class="col-idx">#</th>
              <th>Tarikh</th>
              <th>Perbelanjaan</th>
              <th class="col-num">Jumlah</th>
              <th class="col-center">Resit</th>
              ${state.isAdmin ? `<th class="col-actions">Tindakan</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${years.map(year => `
            ${groupRow("year-row", year.key ? `Tahun ${year.key}` : "Tiada Tarikh", year.count, year.sum)}
            ${year.months.map(group => `
            ${year.key ? monthRow(group) : ""}
            ${group.items.map(exp => {
              const idx = rowNo++;
              const amountVal = parseFloat(exp.amount) || 0;
              const cat = escapeHtml(exp.category || "Lain-lain");
              const title = escapeHtml(exp.title || "Perbelanjaan Pantry");
              const date = escapeHtml(exp.date || "-");
              const notes = escapeHtml(exp.notes || "");
              const staffName = exp.staff_name ? escapeHtml(exp.staff_name) : "";
              const receiptImg = exp.receipt_image ? escapeHtml(exp.receipt_image) : "";

              return `
                <tr data-month="${escapeHtml(group.key)}"${group.key && !state.openExpenseMonths.has(group.key) ? " hidden" : ""}>
                  <td class="col-idx">${idx + 1}</td>
                  <td class="col-date">${date}</td>
                  <td class="col-main">
                    ${title}
                    <span class="cell-sub"><span class="expense-cat-badge"><i class="fa-solid fa-tag"></i> ${cat}</span>${staffName ? ` Pembeli: ${staffName}` : ''}</span>
                    ${notes ? `<span class="cell-sub">${notes}</span>` : ''}
                  </td>
                  <td class="col-num" style="color: #c084fc;">${currency} ${formatMoney(amountVal)}</td>
                  <td class="col-center">
                    ${receiptImg ? `
                      <a href="${receiptImg}" target="_blank" class="receipt-thumb-link" title="Lihat Resit Penuh">
                        <img src="${receiptImg}" alt="Resit" class="receipt-thumb-img" loading="lazy" decoding="async">
                      </a>
                    ` : `<span style="color: var(--text-muted);">-</span>`}
                  </td>
                  ${state.isAdmin ? `
                    <td class="col-actions">
                      <button type="button" class="btn btn-secondary btn-icon" data-action="edit-expense" data-id="${exp.id}" title="Kemaskini">
                        <i class="fa-solid fa-pen-to-square"></i>
                      </button>
                      <button type="button" class="btn btn-danger-soft btn-icon" data-action="delete-expense" data-id="${exp.id}" title="Padam">
                        <i class="fa-solid fa-trash"></i>
                      </button>
                    </td>
                  ` : ''}
                </tr>
              `;
            }).join('')}`).join('')}`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td class="col-idx"></td>
              <td colspan="2" style="text-align: right;">Jumlah Perbelanjaan</td>
              <td class="col-num" style="color: #c084fc;">${currency} ${formatMoney(totalExpensesSum)}</td>
              <td colspan="${state.isAdmin ? 2 : 1}"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

// Global Edit Expense Function
window.openEditExpenseModal = function(id) {
  const expenses = state.data.expenses || [];
  const exp = expenses.find(e => parseInt(e.id) === parseInt(id));
  if (!exp) {
    showToast("Rekod perbelanjaan tidak dijumpai", "error");
    return;
  }

  const expIdEl = document.getElementById("inputExpenseId");
  const titleEl = document.getElementById("inputExpenseTitle");
  const amountEl = document.getElementById("inputExpenseAmount");
  const dateEl = document.getElementById("inputExpenseDate");
  const staffEl = document.getElementById("inputExpenseStaff");
  const imageEl = document.getElementById("inputExpenseImage");

  if (expIdEl) expIdEl.value = exp.id;
  if (titleEl) titleEl.value = exp.title || "";
  if (amountEl) amountEl.value = exp.amount || "";
  if (dateEl) dateEl.value = exp.date || new Date().toISOString().split("T")[0];
  populateExpenseCategorySelect(exp.category || "Lain-lain");
  const searchStaffEl = document.getElementById("searchExpenseStaffInput");
  if (searchStaffEl) searchStaffEl.value = "";
  populateExpenseStaffDropdown("");
  if (staffEl) staffEl.value = exp.staff_name || "";
  if (imageEl) imageEl.value = exp.receipt_image || "";

  const modal = document.getElementById("modalAddExpense");
  if (modal) {
    const titleObj = modal.querySelector(".modal-title");
    if (titleObj) titleObj.innerHTML = `<i class="fa-solid fa-pen-to-square" style="color: #c084fc;"></i> Kemaskini Rekod Perbelanjaan`;
  }

  openModal("modalAddExpense");
};

// Global Delete Expense Function
window.deleteExpense = async function(id) {
  if (!confirm("Adakah anda pasti mahu memadam rekod perbelanjaan ini?")) return;
  try {
    const { ok, body: result } = await apiPost("api.php?action=delete_expense", { expense_id: id });
    if (ok && result.success) {
      showToast("Rekod perbelanjaan berjaya dipadam!", "success");
      if (result.data) {
        state.data = result.data;
        updateAllUI();
      } else {
        loadData();
      }
    } else {
      showToast(result.error || "Gagal memadam perbelanjaan", "error");
    }
  } catch (err) {
    showToast("Ralat sambungan pelayan", "error");
  }
};

// Render Giver Coins Visual Wall (Bottom Section - Sorted by Highest Amount)
function renderGiverCoins() {
  const container = document.getElementById("coinsGridContainer");
  const section = document.getElementById("coinsShowcaseSection");
  if (!container) return;

  const currency = state.data.currency || "RM";

  let coinsList = [];
  if (state.data.giver_coins && Array.isArray(state.data.giver_coins) && state.data.giver_coins.length > 0) {
    coinsList = state.data.giver_coins.map(c => ({ amount: Number(c.amount) || 0 }));
  } else if (state.data.contributions && state.data.contributions.length > 0) {
    coinsList = state.data.contributions
      .filter(c => Number(c.amount) > 0)
      .map(c => ({ amount: Number(c.amount) || 0 }));
  }

  // Sort by highest contribution amount first
  coinsList.sort((a, b) => b.amount - a.amount);

  if (coinsList.length === 0) {
    if (section) section.style.display = "none";
    container.innerHTML = "";
    return;
  }

  if (section) section.style.display = "block";

  container.innerHTML = coinsList.map((g) => {
    const amountVal = Number(g.amount) || 0;
    return `
      <div class="giver-coin-chip" title="${currency} ${formatMoney(amountVal)}">
        <div class="giver-coin-icon">
          <i class="fa-solid fa-coins"></i>
        </div>
        <span class="giver-coin-amount">${currency} ${formatMoney(amountVal)}</span>
      </div>
    `;
  }).join('');
}

// Format Currency Helper
function formatMoney(num) {
  return (parseFloat(num) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Render Items Grid Cards (2 columns layout with images)
function renderItemsGrid(currency) {
  const container = document.getElementById("itemsGridContainer");
  if (!container) return;

  const itemsSection = document.getElementById("itemsSection");
  if (state.data.items.length === 0) {
    if (itemsSection) itemsSection.style.display = "none";
    return;
  }
  if (itemsSection) itemsSection.style.display = "block";

  // Sequential waterfall allocation draws from the same pooled total the stat
  // cards show, so an item card can never imply a different amount collected.
  let totalPoolRemaining = computeTotals().total_collected;

  container.innerHTML = state.data.items.map((item, index) => {
    const qty = parseInt(item.quantity) || 1;
    const targetPrice = (parseFloat(item.target_price) || 0) * qty;

    // Sequential Waterfall Allocation: fill current item first before spilling over to next item
    const itemCollected = Math.min(targetPrice, totalPoolRemaining);
    totalPoolRemaining = Math.max(0, totalPoolRemaining - itemCollected);

    const progressPercent = targetPrice > 0 ? Math.min(100, Math.round((itemCollected / targetPrice) * 100)) : 0;
    const itemRemaining = Math.max(0, targetPrice - itemCollected);

    let badgeClass = "";
    let badgeText = "";
    if (progressPercent >= 100) {
      badgeClass = "badge-reached sticker-dah-boleh-beli";
      badgeText = '<i class="fa-solid fa-cart-shopping"></i> DAH BOLEH BELI DAH!';
    } else if (progressPercent > 0) {
      badgeClass = "badge-progress";
      badgeText = "Dalam Proses";
    }

    const iconClass = item.icon || "fa-box";

    const rawDesc = item.description ? item.description.trim() : '';
    const formattedDesc = rawDesc ? ((typeof marked !== 'undefined' && typeof marked.parse === 'function')
      ? sanitizeHtml(marked.parse(rawDesc))
      : `<p>${escapeHtml(rawDesc)}</p>`) : '';

    const rawImages = (item.image || "")
      .split(/[\n,]+/)
      .map(s => s.trim().replace(/\\/g, '/'))
      .filter(Boolean);

    let imageMarkup = '';
    if (rawImages.length === 1) {
      imageMarkup = `
        <div class="item-card-image-box">
          <img src="${escapeHtml(rawImages[0])}" alt="${escapeHtml(item.name)}" class="item-card-image" loading="lazy" decoding="async" data-on-error="hide-parent">
        </div>`;
    } else if (rawImages.length > 1) {
      const slideItems = rawImages.map((imgUrl, i) => `
        <div class="item-card-slide" data-index="${i}">
          <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(item.name)} ${i + 1}" loading="lazy" decoding="async" data-on-error="hide-parent">
        </div>
      `).join('');

      const dots = rawImages.map((_, i) => `
        <span class="slider-dot ${i === 0 ? 'active' : ''}" data-action="go-slide" data-id="${escapeHtml(item.id)}" data-index="${i}"></span>
      `).join('');

      imageMarkup = `
        <div class="item-card-slider-box" id="slider-${escapeHtml(item.id)}">
          <div class="item-card-slider-slides" id="slides-${escapeHtml(item.id)}" data-slider-for="${escapeHtml(item.id)}">
            ${slideItems}
          </div>
          <button class="slider-arrow prev" type="button" data-action="slide-prev" data-id="${escapeHtml(item.id)}" title="Gambar Sebelum"><i class="fa-solid fa-chevron-left"></i></button>
          <button class="slider-arrow next" type="button" data-action="slide-next" data-id="${escapeHtml(item.id)}" title="Gambar Seterusnya"><i class="fa-solid fa-chevron-right"></i></button>
          <div class="slider-dots" id="dots-${escapeHtml(item.id)}">
            ${dots}
          </div>
        </div>`;
    }

    return `
      <div class="item-card ${progressPercent >= 100 ? 'target-achieved-card' : ''}">
        ${badgeText ? `<span class="item-badge ${badgeClass}">${badgeText}</span>` : ''}
        
        <div>
          ${progressPercent >= 100 ? `<div class="item-achieved-banner"><i class="fa-solid fa-circle-check"></i> SASARAN TELAH DICAPAI</div>` : ''}
          ${imageMarkup}

          <div class="item-header-group">
            <div class="item-icon-box">
              <i class="fa-solid ${iconClass}"></i>
            </div>
            <div>
              <h3 class="item-name">${escapeHtml(item.name)}</h3>
            </div>
          </div>

          ${formattedDesc ? `<div class="item-description markdown-content">${formattedDesc}</div>` : ''}
        </div>

        <div>
          <div class="item-progress-info">
            <span class="item-collected-amount">${currency} ${formatMoney(itemCollected)}</span>
            <span class="item-target-amount" style="font-weight: 700; color: var(--text-primary);">Sasaran: <strong style="font-weight: 800; color: #ffffff;">${currency} ${formatMoney(targetPrice)}</strong></span>
          </div>

          <div class="progress-track" style="height: 10px; margin-bottom: 0.5rem;">
            <div class="progress-fill" style="width: ${progressPercent}%; background: ${progressPercent >= 100 ? 'var(--gradient-emerald)' : 'var(--gradient-accent)'};"></div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 0.775rem; color: var(--text-muted);">
            <span>${progressPercent}% dibiayai</span>
            <span>${itemRemaining > 0 ? `${currency} ${formatMoney(itemRemaining)} masih diperlukan` : 'Sepenuhnya Dibiayai!'}</span>
          </div>

          ${state.isAdmin ? `
            <div class="item-card-actions">
              <button class="btn btn-secondary btn-icon" style="width: 34px; height: 34px; font-size: 0.8rem; flex-shrink: 0;" title="Ke Atas" data-action="move-item-up" data-id="${escapeHtml(item.id)}" ${index === 0 ? 'disabled' : ''}>
                <i class="fa-solid fa-chevron-up"></i>
              </button>
              <button class="btn btn-secondary btn-icon" style="width: 34px; height: 34px; font-size: 0.8rem; flex-shrink: 0;" title="Ke Bawah" data-action="move-item-down" data-id="${escapeHtml(item.id)}" ${index === state.data.items.length - 1 ? 'disabled' : ''}>
                <i class="fa-solid fa-chevron-down"></i>
              </button>
              <button class="btn btn-secondary btn-icon" style="flex: 1; height: 34px; font-size: 0.8rem;" data-action="edit-item" data-id="${escapeHtml(item.id)}">
                <i class="fa-solid fa-pen"></i> Kemaskini
              </button>
              <button class="btn btn-danger-soft btn-icon" style="flex: 1; height: 34px; font-size: 0.8rem;" data-action="delete-item" data-id="${escapeHtml(item.id)}">
                <i class="fa-solid fa-trash"></i> Padam
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Render Admin Giver Report (Private Admin Section - Individual Transaction Log)
function renderAdminGiverReport(currency) {
  const section = document.getElementById("adminGiverReportSection");
  const tbody = document.getElementById("adminGiverReportTableBody");
  if (!section || !tbody) return;

  if (!state.isAdmin) {
    // Hiding is not enough - purge the rendered giver names so they cannot be
    // recovered from the DOM after signing out on a shared machine.
    section.style.display = "none";
    tbody.innerHTML = "";
    return;
  }
  section.style.display = "block";

  // Build raw list of individual contribution transactions
  const rawList = (state.data.contributions || []).map(c => {
    return {
      id: c.id,
      name: c.name || c.contributor || c.staff_name || c.username || "Penyumbang",
      username: c.username || "",
      amount: parseFloat(c.amount) || 0,
      date: c.date || (c.created_at ? c.created_at.substring(0, 16) : "-"),
      note: c.note || ""
    };
  });

  // Unique contributors count for stat badge
  const uniqueGivers = new Set(rawList.map(t => t.name.toLowerCase().trim()));
  const countPaid = document.getElementById("countPaidGiversReport");
  if (countPaid) countPaid.textContent = uniqueGivers.size;

  const query = state.giverSearchQuery.toLowerCase().trim();
  const filtered = rawList.filter(item => {
    return item.name.toLowerCase().includes(query) ||
           item.username.toLowerCase().includes(query);
  });

  const visibleCount = document.getElementById("visibleGiversCount");
  if (visibleCount) visibleCount.textContent = filtered.length;

  updateRestoreBackupButton();

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="col-empty">
          Tiada rekod transaksi dijumpai.
        </td>
      </tr>`;
    updateRestoreBackupButton();
    return;
  }

  const sortOrder = state.giverSortOrder || "newest";

  // Update header sort icon and selector dropdown value
  const sortIcon = document.getElementById("sortIconGiverDate");
  if (sortIcon) {
    sortIcon.className = sortOrder === "oldest"
      ? "fa-solid fa-arrow-up-short-wide"
      : "fa-solid fa-arrow-down-short-wide";
  }
  const dateSortSelect = document.getElementById("giverDateSortSelect");
  if (dateSortSelect && dateSortSelect.value !== sortOrder) {
    dateSortSelect.value = sortOrder;
  }

  // Display transactions sorted by date (newest vs oldest)
  const displayList = [...filtered].sort((a, b) => {
    const parseTime = (dateStr) => {
      if (!dateStr || dateStr === "-") return 0;
      const t = new Date(dateStr.replace(/-/g, "/")).getTime();
      return isNaN(t) ? 0 : t;
    };
    const timeA = parseTime(a.date);
    const timeB = parseTime(b.date);

    if (timeA !== timeB) {
      return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
    }
    const idA = parseInt(a.id, 10) || 0;
    const idB = parseInt(b.id, 10) || 0;
    return sortOrder === "oldest" ? idA - idB : idB - idA;
  });

  tbody.innerHTML = displayList.map((item, index) => {
    return `
      <tr>
        <td class="col-idx">${index + 1}</td>
        <td class="col-main">
          ${escapeHtml(item.name)}
          ${item.note ? `<span class="cell-sub">${escapeHtml(item.note)}</span>` : ''}
        </td>
        <td class="col-num" style="color: #6ee7b7;">${currency} ${formatMoney(item.amount)}</td>
        <td class="col-date">${formatDateTimeDisplay(item.date)}</td>
        <td class="col-actions">
          <button type="button" class="btn btn-danger-soft btn-icon" data-action="delete-contribution"
                  data-id="${escapeHtml(String(item.id))}" data-name="${escapeHtml(item.name)}"
                  title="Padam rekod sumbangan ini">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Delete one contribution. The README has advertised this since the start but
// there was no control for it and no endpoint behind it.
window.deleteContribution = async function(id, name) {
  if (!confirm(`Padam rekod sumbangan daripada "${name}"?\n\nTindakan ini tidak boleh dibatalkan.`)) return;

  const { ok, body: result } = await apiPost("api.php?action=delete_contribution", { contribution_id: id });
  if (!ok || !result.success) {
    showToast(result.error || "Gagal memadamkan rekod sumbangan", "error");
    return;
  }

  if (result.data) {
    state.data = result.data;
  } else {
    await loadData();
  }
  updateAllUI();
  showToast("Rekod sumbangan berjaya dipadam", "success");
};

// Restore the ledger from contributions_backup. This used to happen silently on
// every page load; it is now an explicit, visible admin action.
window.restoreContributionsFromBackup = async function() {
  const count = state.data.contributions_backup_count || 0;
  if (!confirm(`Pulihkan ${count} rekod sumbangan daripada sandaran?`)) return;

  const { ok, body: result } = await apiPost("api.php?action=restore_contributions");
  if (!ok || !result.success) {
    showToast(result.error || "Gagal memulihkan rekod sumbangan", "error");
    return;
  }

  if (result.data) {
    state.data = result.data;
  } else {
    await loadData();
  }
  updateAllUI();
  showToast(result.message || "Rekod sumbangan dipulihkan", "success");
};

// Open WhatsApp with a short summary of the latest totals plus the link to the
// published report page. Only public figures go in the message (the same ones
// the public report shows), never any giver name.
function shareReportToWhatsapp(url) {
  if (!url) return;
  const currency = state.data.currency || "RM";
  const lines = [`*${formatPantryTitle(state.data.title || "Pantry")}*`, "Laporan Terkini Kutipan Dana", ""];

  const t = computeTotals();
  lines.push(`\u{1F4B0} Jumlah Kutipan: ${currency} ${formatMoney(t.total_collected)}`);
  lines.push(`\u{1F6D2} Jumlah Perbelanjaan: ${currency} ${formatMoney(t.total_expenses)}`);
  lines.push(`\u{1F3E6} Baki: ${currency} ${formatMoney(t.baki)}`);
  if (t.has_target) lines.push(`\u{1F3AF} Sasaran: ${currency} ${formatMoney(t.target_total)} (${t.percent_complete}%)`);
  lines.push("");
  lines.push("\u{1F4C4} Lihat laporan penuh:", url);

  // api.whatsapp.com directly: the wa.me redirect mangles 4-byte emoji into "?".
  const waUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(lines.join("\n"));
  window.open(waUrl, "_blank", "noopener");
}

// The restore control only makes sense when the ledger is empty AND the backup
// table still holds rows, so it is shown on exactly that condition.
function updateRestoreBackupButton() {
  const btn = document.getElementById("btnRestoreContributions");
  if (!btn) return;

  const backupCount = parseInt(state.data.contributions_backup_count, 10) || 0;
  const ledgerEmpty = (state.data.contributions || []).length === 0;
  const canRestore = state.isAdmin && ledgerEmpty && backupCount > 0;

  btn.style.display = canRestore ? "inline-flex" : "none";
  const countEl = document.getElementById("restoreBackupCount");
  if (countEl) countEl.textContent = backupCount;
}

/**
 * Reflect the admin state on the page.
 *
 * This used to hand-set style.display on ~18 individual elements, duplicating
 * the server-rendered gates in api/page.js - and the two used different display
 * values ("inline-flex" here vs "" there), so a control could end up laid out
 * differently depending on whether it was painted by the server or by JS. Now a single
 * class on <body> drives the CSS rule, matching exactly what api/page.js stamps.
 */
function updateAdminUIState() {
  document.body.classList.toggle("is-admin", state.isAdmin);

  const badge = document.getElementById("adminBadge");
  if (badge) badge.title = `Pentadbir Aktif (${state.adminName})`;

  const btnToggleAdmin = document.getElementById("btnToggleAdmin");
  if (btnToggleAdmin) {
    btnToggleAdmin.title = state.isAdmin ? "Log Keluar Pentadbir" : "Log Masuk Pentadbir";
  }
  const adminBtnIcon = document.getElementById("adminBtnIcon");
  if (adminBtnIcon) {
    adminBtnIcon.className = state.isAdmin ? "fa-solid fa-right-from-bracket" : "fa-solid fa-lock";
  }
}

// The canonical section list, shared by the resolver and the settings modal.
const DEFAULT_SECTION_VISIBILITY = {
  announcement: true,
  showcase: true,
  metrics: true,
  progress: true,
  items: true,
  expenses: true,
  coins: true,
  admin_report: true,
  admin_staff: true
};
const SECTION_VISIBILITY_KEY = "pantry_section_visibility";

/**
 * Resolve which sections are visible.
 *
 * The local override used to be merged LAST and unconditionally, so once a
 * browser had one it could never see a change an admin made elsewhere. Both
 * copies now carry a timestamp and the newer one wins.
 */
function resolveSectionVisibility() {
  let localVis = null;
  let localSavedAt = 0;
  try {
    const raw = localStorage.getItem(SECTION_VISIBILITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.values) {
        localVis = parsed.values;
        localSavedAt = parseInt(parsed.savedAt, 10) || 0;
      } else {
        // Legacy un-timestamped entry from before overrides were stamped. We
        // cannot tell whether it predates the stored settings, and assuming it
        // wins let a months-old local copy hide sections permanently - there
        // was no way to get them back short of clearing site data. Discard it
        // and let the server decide.
        localStorage.removeItem(SECTION_VISIBILITY_KEY);
        localVis = null;
      }
    }
  } catch (e) {
    // Private mode or blocked storage - fall back to the server value.
  }

  const serverVis = state.data.section_visibility || {};
  const serverSavedAt = parseInt(state.data.section_visibility_saved_at, 10) || 0;

  // Strictly newer, not newer-or-equal: on a tie the server is authoritative,
  // so a stale override can never pin a section hidden.
  const localWins = localVis && localSavedAt > serverSavedAt;
  return Object.assign(
    {},
    DEFAULT_SECTION_VISIBILITY,
    serverVis,
    localWins ? localVis : {}
  );
}

function storeLocalSectionVisibility(values) {
  try {
    localStorage.setItem(SECTION_VISIBILITY_KEY, JSON.stringify({
      values,
      savedAt: Math.floor(Date.now() / 1000)
    }));
  } catch (e) {
    console.warn("Could not persist section visibility locally:", e);
  }
}

// Master Section Visibility Application Function
function applySectionVisibility() {
  const secVis = resolveSectionVisibility();

  const annSec = document.getElementById("announcementSection");
  const showSec = document.getElementById("showcaseSection");
  const topGrid = document.querySelector(".top-info-grid");
  const metSec = document.getElementById("metricsSection");
  const progBox = document.getElementById("overallProgressBox");
  const itemsSec = document.getElementById("itemsSection");
  const expSec = document.getElementById("expensesPublicSection");
  const coinsSec = document.getElementById("coinsShowcaseSection");
  const adminRepSec = document.getElementById("adminGiverReportSection");
  const adminStaffSec = document.getElementById("adminStaffSection");

  const isAnnVis = secVis.announcement !== false;
  const isShowVis = secVis.showcase !== false;

  if (annSec) annSec.style.display = isAnnVis ? "" : "none";
  if (showSec) {
    if (!isShowVis) {
      if (state.isAdmin) {
        showSec.style.display = "flex";
        showSec.style.opacity = "0.45";
      } else {
        showSec.style.display = "none";
      }
    } else {
      showSec.style.display = "flex";
      showSec.style.opacity = "1";
    }
  }

  if (topGrid) {
    if (!isAnnVis && (!isShowVis && !state.isAdmin)) {
      topGrid.style.display = "none";
    } else {
      topGrid.style.display = "grid";
      if (!isAnnVis || (!isShowVis && !state.isAdmin)) {
        topGrid.style.gridTemplateColumns = "1fr";
      } else {
        topGrid.style.gridTemplateColumns = "";
      }
    }
  }

  if (metSec) metSec.style.display = secVis.metrics !== false ? "grid" : "none";

  const sectionTotals = computeTotals();
  if (progBox) progBox.style.display = (secVis.progress !== false && sectionTotals.has_target) ? "block" : "none";

  const hasItems = (state.data.items || []).length > 0;
  if (itemsSec) itemsSec.style.display = (secVis.items !== false && hasItems) ? "block" : "none";

  if (expSec) expSec.style.display = secVis.expenses !== false ? "block" : "none";

  const hasContribs = sectionTotals.total_collected > 0 || (state.data.contributions || []).length > 0;
  if (coinsSec) coinsSec.style.display = (secVis.coins !== false && hasContribs) ? "block" : "none";

  // The admin check lives in the .admin-only CSS rule (which uses !important, so
  // it still wins over these inline values). Here we only apply the section
  // toggle, rather than re-deciding admin visibility in a second place.
  if (adminRepSec) adminRepSec.style.display = secVis.admin_report !== false ? "block" : "none";
  if (adminStaffSec) adminStaffSec.style.display = secVis.admin_staff !== false ? "block" : "none";
}

// Populate Section Visibility Modal Checkboxes
function populateSectionVisibilityModal() {
  const currentVis = resolveSectionVisibility();

  Object.keys(DEFAULT_SECTION_VISIBILITY).forEach(k => {
    const el = document.getElementById(`secToggle_${k}`);
    if (el) {
      el.checked = currentVis[k] !== false;
    }
  });
}

// Delegated handler for controls rendered into innerHTML.
//
// Re-rendered markup cannot carry bound listeners, and building
// onclick="fn('${id}')" strings interpolates stored data straight into
// executable attributes. Buttons declare data-action/data-id instead and are
// dispatched from a single listener on document.
const DELEGATED_ACTIONS = {
  "delete-contribution": el => deleteContribution(el.dataset.id, el.dataset.name || ""),
  "restore-contributions": () => restoreContributionsFromBackup(),
  "share-report-whatsapp": el => shareReportToWhatsapp(el.dataset.url),
  "edit-expense": el => openEditExpenseModal(el.dataset.id),
  "delete-expense": el => deleteExpense(el.dataset.id),
  "edit-item": el => openEditItemModal(el.dataset.id),
  "delete-item": el => deleteItem(el.dataset.id),
  "move-item-up": el => moveItemUp(el.dataset.id),
  "move-item-down": el => moveItemDown(el.dataset.id),
  "edit-staff": el => openEditStaffModal(el.dataset.id),
  "delete-staff": el => confirmDeleteStaff(el.dataset.id),
  "open-add-expense": () => openAddExpenseModal(),
  "manage-expense-categories": () => manageExpenseCategories(),
  "toggle-expense-month": el => toggleExpenseMonth(el),
  "edit-event": el => openEditEventModal(parseInt(el.dataset.id, 10)),
  "remove-media": el => removeMediaImage(parseInt(el.dataset.index, 10)),
  "slide-prev": el => slideItemImage(el.dataset.id, -1),
  "slide-next": el => slideItemImage(el.dataset.id, 1),
  "go-slide": el => goToItemSlide(el.dataset.id, parseInt(el.dataset.index, 10))
};

// 1x1 transparent GIF - a local stand-in for a broken thumbnail, so a failed
// image does not reach out to a third-party placeholder service.
const BROKEN_IMAGE_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";

function setupDelegatedActions() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const handler = DELEGATED_ACTIONS[el.dataset.action];
    if (!handler) return;
    e.preventDefault();
    handler(el);
  });

  // Inline onerror="" / onscroll="" attributes are blocked by the CSP (script-src
  // carries no 'unsafe-inline'), so these are delegated too. Error and scroll do
  // not bubble, hence the capture phase.
  document.addEventListener("error", (e) => {
    const el = e.target;
    if (!el || el.tagName !== "IMG" || !el.dataset.onError) return;
    if (el.dataset.onError === "hide-parent" && el.parentElement) {
      el.parentElement.style.display = "none";
    } else if (el.dataset.onError === "placeholder" && el.src !== BROKEN_IMAGE_PLACEHOLDER) {
      el.src = BROKEN_IMAGE_PLACEHOLDER;
      el.style.opacity = "0.35";
    }
  }, true);

  document.addEventListener("scroll", (e) => {
    const el = e.target;
    if (el && el.dataset && el.dataset.sliderFor) {
      updateItemSliderDots(el.dataset.sliderFor);
    }
  }, true);
}

// Event Listeners Setup
function setupEventListeners() {
  setupDelegatedActions();

  const btnRestore = document.getElementById("btnRestoreContributions");
  if (btnRestore) {
    btnRestore.addEventListener("click", () => restoreContributionsFromBackup());
  }

  // Section Visibility Modal Button
  const btnOpenSecModal = document.getElementById("btnOpenSectionVisibilityModal");
  if (btnOpenSecModal) {
    btnOpenSecModal.addEventListener("click", () => {
      populateSectionVisibilityModal();
      openModal("modalSectionVisibility");
    });
  }

  const btnSecSelectAll = document.getElementById("btnSecToggleSelectAll");
  if (btnSecSelectAll) {
    btnSecSelectAll.addEventListener("click", () => {
      document.querySelectorAll("#modalSectionVisibility .toggle-checkbox").forEach(cb => cb.checked = true);
    });
  }

  const btnSecDeselectAll = document.getElementById("btnSecToggleDeselectAll");
  if (btnSecDeselectAll) {
    btnSecDeselectAll.addEventListener("click", () => {
      document.querySelectorAll("#modalSectionVisibility .toggle-checkbox").forEach(cb => cb.checked = false);
    });
  }

  const btnSaveSecVis = document.getElementById("btnSaveSectionVisibility");
  if (btnSaveSecVis) {
    btnSaveSecVis.addEventListener("click", async () => {
      if (!state.data.section_visibility) state.data.section_visibility = {};

      Object.keys(DEFAULT_SECTION_VISIBILITY).forEach(k => {
        const el = document.getElementById(`secToggle_${k}`);
        if (el) {
          state.data.section_visibility[k] = el.checked;
        }
      });

      storeLocalSectionVisibility(state.data.section_visibility);

      let savedToServer = true;
      if (state.isAdmin) {
        savedToServer = await saveData();
        if (savedToServer) {
          // Keep the local stamp at/above the server's so this browser does not
          // immediately consider its own just-saved choice stale.
          state.data.section_visibility_saved_at = Math.floor(Date.now() / 1000);
          storeLocalSectionVisibility(state.data.section_visibility);
        }
      }

      updateAllUI();
      closeModal("modalSectionVisibility");
      if (savedToServer) {
        showToast("Tetapan paparan seksyen berjaya dikemaskini!", "success");
      } else {
        showToast("Tetapan disimpan pada pelayar ini sahaja.", "warning");
      }
    });
  }

  // Dark & Light Theme Switcher Button
  const btnToggleTheme = document.getElementById("btnToggleTheme");
  if (btnToggleTheme) {
    btnToggleTheme.addEventListener("click", toggleTheme);
  }

  // Toggle Admin Access Button -> Logout if active, or open Admin Login Modal
  document.getElementById("btnToggleAdmin").addEventListener("click", async () => {
    if (state.isAdmin) {
      try {
        // Logout mints a fresh CSRF token; keep it, or the next login from
        // this page would be refused as an expired session.
        const { body: result } = await apiPost("api.php?action=logout");
        if (result && result.csrf_token) state.csrfToken = result.csrf_token;
      } catch (e) {
        console.warn("Logout request failed:", e);
      }
      state.isAdmin = false;
      state.staffList = [];

      // Replace the privileged dataset with the public one so no giver names
      // linger in memory or in hidden DOM after signing out.
      await loadData();
      updateAllUI();

      showToast("Telah log keluar daripada mod Pentadbir", "info");
    } else {
      openModal("modalAdminLogin");
    }
  });

  // Admin Badge click to logout
  const adminBadge = document.getElementById("adminBadge");
  if (adminBadge) {
    adminBadge.style.cursor = "pointer";
    adminBadge.addEventListener("click", () => {
      if (state.isAdmin) {
        document.getElementById("btnToggleAdmin").click();
      }
    });
  }

  // Google sign-in is a plain link to /auth/google (a full-page redirect that
  // lands back on "/?login=<result>"); the checkbox only sets its remember flag.
  const rememberEl = document.getElementById("inputRememberMe");
  const googleLoginLink = document.getElementById("btnGoogleLogin");
  if (rememberEl && googleLoginLink) {
    rememberEl.addEventListener("change", () => {
      googleLoginLink.href = rememberEl.checked ? "/auth/google?remember=1" : "/auth/google";
    });
  }

  // Edit Announcement Button
  const btnEditAnn = document.getElementById("btnEditAnnouncement");
  if (btnEditAnn) {
    btnEditAnn.addEventListener("click", () => {
      const ann = state.data.announcement || {};
      document.getElementById("inputAnnouncementTitle").value = ann.title || "";
      document.getElementById("inputAnnouncementMessage").value = ann.message || "";
      openModal("modalEditAnnouncement");
    });
  }

  // Edit Announcement Form Submit
  const formEditAnn = document.getElementById("formEditAnnouncement");
  if (formEditAnn) {
    formEditAnn.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("inputAnnouncementTitle").value.trim();
      const message = document.getElementById("inputAnnouncementMessage").value.trim();

      if (!title || !message) {
        showToast("Sila masukkan tajuk dan mesej pengumuman", "error");
        return;
      }

      state.data.announcement = { title, message };
      if (!await saveData()) return;
      updateAllUI();
      closeModal("modalEditAnnouncement");
      showToast("Pengumuman berjaya dikemaskini!", "success");
    });
  }

  // Toggle Showcase Visibility Button
  const btnToggleVis = document.getElementById("btnToggleShowcaseVisibility");
  if (btnToggleVis) {
    btnToggleVis.addEventListener("click", async () => {
      if (!state.data.showcase) state.data.showcase = {};
      const isCurrVisible = state.data.showcase.visible !== false;
      state.data.showcase.visible = !isCurrVisible;
      if (!await saveData()) {
        state.data.showcase.visible = isCurrVisible; // roll back the optimistic toggle
        updateAllUI();
        return;
      }
      updateAllUI();
      showToast(state.data.showcase.visible ? "Lajur kanan (Info QR Code) kini dipaparkan!" : "Lajur kanan (Info QR Code) kini disembunyikan daripada orang awam.", "info");
    });
  }

  // Edit Showcase Button
  const btnEditShowcase = document.getElementById("btnEditShowcase");
  if (btnEditShowcase) {
    btnEditShowcase.addEventListener("click", () => {
      const sc = state.data.showcase || {};
      document.getElementById("inputShowcaseTitle").value = sc.title || "";
      document.getElementById("inputShowcaseImageUrl").value = sc.image || "";
      document.getElementById("inputShowcaseDescription").value = sc.description || "";
      const chkVis = document.getElementById("inputShowcaseVisible");
      if (chkVis) chkVis.checked = sc.visible !== false;

      const previewBox = document.getElementById("showcaseImagePreviewBox");
      const previewImg = document.getElementById("showcaseImagePreview");
      if (sc.image && previewBox && previewImg) {
        previewImg.src = sc.image;
        previewBox.style.display = "block";
      } else if (previewBox) {
        previewBox.style.display = "none";
      }

      openModal("modalEditShowcase");
    });
  }

  // Showcase Image File Upload Change
  const showcaseFileInput = document.getElementById("showcaseImageFile");
  if (showcaseFileInput) {
    showcaseFileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("image", file);
      showToast("Memuat naik gambar...", "info");

      try {
        const { ok, body: result } = await apiPost("api.php?action=upload_image", formData);

        if (ok && result.image_url) {
          document.getElementById("inputShowcaseImageUrl").value = result.image_url;
          const previewBox = document.getElementById("showcaseImagePreviewBox");
          const previewImg = document.getElementById("showcaseImagePreview");
          if (previewBox && previewImg) {
            previewImg.src = result.image_url;
            previewBox.style.display = "block";
          }
          showToast("Gambar berjaya dimuat naik!", "success");
        } else {
          showToast(result.error || "Gagal memuat naik gambar", "error");
        }
      } catch (err) {
        console.error("Upload error:", err);
        showToast("Ralat memuat naik fail", "error");
      }
    });
  }

  // Showcase Image URL input preview
  const showcaseUrlInput = document.getElementById("inputShowcaseImageUrl");
  if (showcaseUrlInput) {
    showcaseUrlInput.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      const previewBox = document.getElementById("showcaseImagePreviewBox");
      const previewImg = document.getElementById("showcaseImagePreview");
      if (val && previewBox && previewImg) {
        previewImg.src = val;
        previewBox.style.display = "block";
      } else if (previewBox) {
        previewBox.style.display = "none";
      }
    });
  }

  // Edit Showcase Form Submit
  const formEditShowcase = document.getElementById("formEditShowcase");
  if (formEditShowcase) {
    formEditShowcase.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("inputShowcaseTitle").value.trim();
      const image = document.getElementById("inputShowcaseImageUrl").value.trim();
      const description = document.getElementById("inputShowcaseDescription").value.trim();
      const visible = document.getElementById("inputShowcaseVisible").checked;

      if (!title || !description) {
        showToast("Sila masukkan tajuk dan keterangan Info QR Code", "error");
        return;
      }

      state.data.showcase = { title, image, description, visible };
      if (!await saveData()) return;
      updateAllUI();
      closeModal("modalEditShowcase");
      showToast("Info QR Code berjaya dikemaskini!", "success");
    });
  }

  // Open Add Amount Modal Buttons
  document.getElementById("btnOpenAddAmount").addEventListener("click", () => openModal("modalAddAmount"));
  document.getElementById("btnAdminAddAmount").addEventListener("click", () => openModal("modalAddAmount"));

  // Open Add Item Button
  document.getElementById("btnAdminAddItem").addEventListener("click", () => {
    document.getElementById("formAddItem").reset();
    document.getElementById("editItemId").value = "";
    document.getElementById("itemModalHeading").textContent = "Tambah Barangan Baharu";
    renderMediaManagerGrid();
    openModal("modalAddItem");
  });

  // Handle Image File Upload Change (Supports Multiple Files)
  const fileInput = document.getElementById("itemImageFile");
  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      showToast(`Memuat naik ${files.length} gambar...`, "info");
      const uploadedUrls = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append("image", file);
        try {
          const { ok, body: result } = await apiPost("api.php?action=upload_image", formData);
          if (ok && result.image_url) {
            uploadedUrls.push(result.image_url);
          }
        } catch (err) {
          console.error("Upload error:", err);
        }
      }

      if (uploadedUrls.length > 0) {
        const currentVal = document.getElementById("itemImageUrl").value.trim();
        const newVal = currentVal ? `${currentVal}, ${uploadedUrls.join(", ")}` : uploadedUrls.join(", ");
        document.getElementById("itemImageUrl").value = newVal;
        renderMediaManagerGrid();
        showToast(`${uploadedUrls.length} gambar berjaya dimuat naik!`, "success");
      } else {
        showToast("Gagal memuat naik gambar", "error");
      }
    });
  }

  // Handle Image URL input preview & Media Manager refresh
  const urlInput = document.getElementById("itemImageUrl");
  if (urlInput) {
    urlInput.addEventListener("input", () => renderMediaManagerGrid());
  }

  // Export Giver List to CSV Button
  const btnExportCsv = document.getElementById("btnExportGiversCsv");
  if (btnExportCsv) {
    btnExportCsv.addEventListener("click", () => exportGiversCsv());
  }

  // Global Open Add Expense Modal Helper
  window.openAddExpenseModal = function() {
    const form = document.getElementById("formAddExpense");
    if (form) form.reset();
    const expIdEl = document.getElementById("inputExpenseId");
    if (expIdEl) expIdEl.value = "";
    const dateEl = document.getElementById("inputExpenseDate");
    if (dateEl) dateEl.value = new Date().toISOString().split("T")[0];
    populateExpenseCategorySelect("Lain-lain");
    const searchStaffEl = document.getElementById("searchExpenseStaffInput");
    if (searchStaffEl) searchStaffEl.value = "";
    populateExpenseStaffDropdown("");
    const staffEl = document.getElementById("inputExpenseStaff");
    if (staffEl) staffEl.value = "";

    const modal = document.getElementById("modalAddExpense");
    if (modal) {
      const titleObj = modal.querySelector(".modal-title");
      if (titleObj) titleObj.innerHTML = `<i class="fa-solid fa-cart-plus" style="color: #c084fc;"></i> Rekod Perbelanjaan Baharu`;
    }

    openModal("modalAddExpense");
  };

  // Open Add Expense Modal Button
  const btnAdminAddExpense = document.getElementById("btnAdminAddExpense");
  if (btnAdminAddExpense) {
    btnAdminAddExpense.addEventListener("click", () => {
      window.openAddExpenseModal();
    });
  }

  // Staff Directory Search Filter Listener
  const adminStaffSearchInput = document.getElementById("adminStaffSearchInput");
  if (adminStaffSearchInput) {
    adminStaffSearchInput.addEventListener("input", renderAdminStaffManagement);
  }

  // Open Add Staff Modal Button
  const btnOpenAddStaffModal = document.getElementById("btnOpenAddStaffModal");
  if (btnOpenAddStaffModal) {
    btnOpenAddStaffModal.addEventListener("click", () => {
      window.openAddStaffModal();
    });
  }

  // Handle Add/Edit Staff Form Submit
  const formAddEditStaff = document.getElementById("formAddEditStaff");
  if (formAddEditStaff) {
    formAddEditStaff.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("staffEditId").value.trim();
      const name = document.getElementById("inputStaffName").value.trim();

      if (!name) {
        showToast("Sila masukkan nama staf", "error");
        return;
      }

      const action = id ? "update_staff" : "add_staff";
      const payload = id ? { id: parseInt(id), name: name } : { name: name };

      try {
        const { ok, body: data } = await apiPost(`api.php?action=${action}`, payload);
        if (ok && data.success) {
          showToast(id ? `Staf "${name}" berjaya dikemaskini` : `Staf "${name}" berjaya ditambah`, "success");
          closeModal("modalAddEditStaff");
          await loadStaffList();
          renderAdminStaffManagement();
        } else {
          showToast(data.error || "Gagal menyimpan maklumat staf", "error");
        }
      } catch (err) {
        console.error("Save staff error:", err);
        showToast("Ralat pelayan semasa menyimpan staf", "error");
      }
    });
  }

  // Handle Add/Edit Expense Form Submit
  const formAddExpense = document.getElementById("formAddExpense");
  if (formAddExpense) {
    formAddExpense.addEventListener("submit", async (e) => {
      e.preventDefault();
      const expenseId = document.getElementById("inputExpenseId") ? document.getElementById("inputExpenseId").value.trim() : "";
      const title = document.getElementById("inputExpenseTitle").value.trim();
      const amount = parseFloat(document.getElementById("inputExpenseAmount").value);
      const date = document.getElementById("inputExpenseDate").value;
      const category = document.getElementById("inputExpenseCategory").value;
      const staffName = document.getElementById("inputExpenseStaff") ? document.getElementById("inputExpenseStaff").value.trim() : "";
      const receiptImage = document.getElementById("inputExpenseImage").value.trim();

      if (!title || isNaN(amount) || amount <= 0) {
        showToast("Sila masukkan tajuk dan jumlah perbelanjaan (> 0) yang sah", "error");
        return;
      }

      const isEdit = Boolean(expenseId);
      const actionUrl = isEdit ? "api.php?action=edit_expense" : "api.php?action=add_expense";
      // The form no longer has a notes field; an edit carries the existing
      // note through so older records do not lose it.
      const existing = isEdit
        ? (state.data.expenses || []).find(x => parseInt(x.id) === parseInt(expenseId))
        : null;
      const notes = existing ? (existing.notes || "") : "";
      const payload = {
        title,
        amount,
        date,
        category,
        staff_name: staffName,
        notes,
        receipt_image: receiptImage
      };
      if (isEdit) {
        payload.expense_id = parseInt(expenseId);
      }

      try {
        const { ok, body: result } = await apiPost(actionUrl, payload);
        if (ok && result.success) {
          showToast(isEdit ? "Rekod perbelanjaan berjaya dikemas kini!" : "Rekod perbelanjaan berjaya disimpan & dipaparkan secara awam!", "success");
          closeModal("modalAddExpense");
          if (result.data) {
            state.data = result.data;
            updateAllUI();
          } else {
            loadData();
          }
        } else {
          showToast(result.error || "Gagal menyimpan perbelanjaan", "error");
        }
      } catch (err) {
        showToast("Ralat sambungan pelayan", "error");
      }
    });
  }

  // Handle Expense Receipt Upload Button & Input
  const btnUploadReceipt = document.getElementById("btnUploadExpenseReceipt");
  const fileInputReceipt = document.getElementById("fileInputExpenseReceipt");

  if (btnUploadReceipt && fileInputReceipt) {
    btnUploadReceipt.addEventListener("click", () => fileInputReceipt.click());
    fileInputReceipt.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      showToast("Memuat naik gambar resit...", "info");
      const formData = new FormData();
      formData.append("image", file);
      try {
        const { ok, body: result } = await apiPost("api.php?action=upload_image", formData);
        if (ok && result.image_url) {
          document.getElementById("inputExpenseImage").value = result.image_url;
          showToast("Gambar resit berjaya dimuat naik!", "success");
        } else {
          showToast(result.error || "Gagal memuat naik gambar resit", "error");
        }
      } catch (err) {
        showToast("Ralat muat naik gambar", "error");
      }
    });
  }

  // Giver Search Input Listener
  const giverSearch = document.getElementById("giverSearchInput");
  if (giverSearch) {
    giverSearch.addEventListener("input", (e) => {
      state.giverSearchQuery = e.target.value;
      renderAdminGiverReport(state.data.currency || "RM");
    });
  }

  // Giver Date Sort Dropdown Listener
  const giverDateSortSelect = document.getElementById("giverDateSortSelect");
  if (giverDateSortSelect) {
    giverDateSortSelect.value = state.giverSortOrder || "newest";
    giverDateSortSelect.addEventListener("change", (e) => {
      state.giverSortOrder = e.target.value;
      renderAdminGiverReport(state.data.currency || "RM");
    });
  }

  // Giver Table Header Date Sort Click Listener
  const thGiverDate = document.getElementById("thGiverDate");
  if (thGiverDate) {
    thGiverDate.addEventListener("click", () => {
      state.giverSortOrder = state.giverSortOrder === "newest" ? "oldest" : "newest";
      renderAdminGiverReport(state.data.currency || "RM");
    });
  }

  // Live UUM IT Staff Search Listener in Add Amount Modal
  const searchStaffInput = document.getElementById("searchStaffInput");
  if (searchStaffInput) {
    searchStaffInput.addEventListener("input", (e) => {
      populateStaffDropdown(e.target.value);
    });
  }

  // Live UUM IT Staff Search Listener in Expense Modal
  const searchExpenseStaffInput = document.getElementById("searchExpenseStaffInput");
  if (searchExpenseStaffInput) {
    searchExpenseStaffInput.addEventListener("input", (e) => {
      populateExpenseStaffDropdown(e.target.value);
    });
  }

  // Add Collection Amount Form Submit
  const customGiverInput = document.getElementById("inputCustomGiverName");
  const staffSelectEl = document.getElementById("selectStaffName");
  if (customGiverInput && staffSelectEl) {
    customGiverInput.addEventListener("input", () => {
      if (customGiverInput.value.trim()) staffSelectEl.value = "";
    });
    staffSelectEl.addEventListener("change", () => {
      if (staffSelectEl.value) customGiverInput.value = "";
    });
  }

  document.getElementById("formAddAmount").addEventListener("submit", async (e) => {
    e.preventDefault();

    const staffName = staffSelectEl ? staffSelectEl.value : "";
    const customName = customGiverInput ? customGiverInput.value.trim() : "";
    const finalGiverName = customName || staffName;

    if (!finalGiverName) {
      showToast("Sila pilih ahli staf atau masukkan nama penyumbang!", "error");
      return;
    }

    const amount = parseFloat(document.getElementById("inputCollectionAmount").value);
    if (isNaN(amount) || amount <= 0) {
      showToast("Sila masukkan jumlah kutipan yang sah!", "error");
      return;
    }

    const dateInput = document.getElementById("inputCollectionDate");
    let date = (dateInput && dateInput.value) ? dateInput.value.replace('T', ' ') : '';
    if (!date) {
      const now = new Date();
      date = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().replace('T', ' ').slice(0, 16);
    }

    const selectedStaff = state.staffList.find(s => s.name === finalGiverName);
    const username = (selectedStaff && selectedStaff.username) ? selectedStaff.username : finalGiverName.toLowerCase().replace(/[^a-z0-9]/g, '');

    // One row, one INSERT. This used to splice the record into the local array
    // and POST the entire ledger back, which rewrote every contribution row.
    const { ok, body: result } = await apiPost("api.php?action=add_contribution", {
      name: finalGiverName,
      username: username || "guest",
      amount: amount,
      date: date,
      status: "paid"
    });

    if (!ok || !result.success) {
      showToast(result.error || "Gagal merekodkan sumbangan", "error");
      return;
    }

    if (result.data) {
      state.data = result.data;
    } else {
      await loadData();
    }
    updateAllUI();

    closeModal("modalAddAmount");
    document.getElementById("formAddAmount").reset();
    setDefaultDate();

    const currency = state.data.currency || "RM";
    showToast(`Merekodkan sumbangan ${currency} ${formatMoney(amount)} daripada ${finalGiverName}!`, "success");
  });

  // Save Item Form Submit
  document.getElementById("formAddItem").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("editItemId").value;
    const name = document.getElementById("itemName").value.trim();
    const target_price = parseFloat(document.getElementById("itemTargetPrice").value);
    const quantityEl = document.getElementById("itemQuantity");
    const quantity = Math.max(1, parseInt(quantityEl ? quantityEl.value : "1", 10) || 1);
    const categoryEl = document.getElementById("itemCategory");
    const category = categoryEl ? categoryEl.value.trim() : "";
    const image = document.getElementById("itemImageUrl") ? document.getElementById("itemImageUrl").value.trim() : "";
    const icon = document.getElementById("itemIcon").value.trim() || "fa-box";
    const description = document.getElementById("itemDescription").value.trim();

    if (!name || isNaN(target_price) || target_price <= 0) {
      showToast("Sila masukkan nama barangan dan harga sasaran yang sah", "error");
      return;
    }

    const snapshot = state.data.items.map(i => ({ ...i }));

    if (editId) {
      const itemIndex = state.data.items.findIndex(i => i.id === editId);
      if (itemIndex !== -1) {
        state.data.items[itemIndex] = {
          ...state.data.items[itemIndex],
          name, target_price, quantity, category, image, icon, description
        };
      }
    } else {
      state.data.items.push({
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name, target_price, quantity, category, image, icon, description,
        status: "seeking"
      });
    }

    if (!await saveData()) {
      state.data.items = snapshot; // the server rejected it - undo the local edit
      updateAllUI();
      return;
    }
    updateAllUI();
    closeModal("modalAddItem");
    showToast(`Barangan "${name}" berjaya disimpan!`, "success");
  });

  // Modal Close Actions
  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => {
      const modalId = btn.getAttribute("data-close");
      closeModal(modalId);
    });
  });

  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // WhatsApp Export Trigger Button
  const btnExportWaProgress = document.getElementById("btnExportWhatsappProgress");
  if (btnExportWaProgress) {
    btnExportWaProgress.addEventListener("click", openWhatsappExportModal);
  }

  // WhatsApp Modal Action Buttons
  const btnDownloadWaCard = document.getElementById("btnDownloadWhatsappCard");
  if (btnDownloadWaCard) {
    btnDownloadWaCard.addEventListener("click", downloadWhatsappPosterImage);
  }
  const btnCopyWaCard = document.getElementById("btnCopyWhatsappCard");
  if (btnCopyWaCard) {
    btnCopyWaCard.addEventListener("click", copyWhatsappPosterImage);
  }

  // Manage Events Modal Trigger Button
  const btnManageEvents = document.getElementById("btnManageEvents");
  if (btnManageEvents) {
    btnManageEvents.addEventListener("click", () => {
      renderEventsListModal();
      openModal("modalManageEvents");
    });
  }

  // Edit Event Form Submit
  const formEditEvent = document.getElementById("formEditEvent");
  if (formEditEvent) {
    formEditEvent.addEventListener("submit", async (e) => {
      e.preventDefault();
      const event_id = parseInt(document.getElementById("inputEditEventId").value || "0");
      const title = document.getElementById("inputEditEventTitle").value.trim();
      const description = document.getElementById("inputEditEventDesc").value.trim();

      if (!title || event_id <= 0) {
        showToast("Sila masukkan tajuk acara!", "error");
        return;
      }

      try {
        showToast("Mengemas kini maklumat acara...", "info");
        const { ok, body: result } = await apiPost("api.php?action=edit_event", { event_id, title, description });
        if (ok && result.success) {
          closeModal("modalEditEvent");
          if (result.data) {
            state.data = result.data;
            updateAllUI();
          }
          showToast("Maklumat acara berjaya dikemas kini!", "success");
        } else {
          showToast(result.error || "Gagal mengemas kini maklumat acara", "error");
        }
      } catch (err) {
        console.error("Edit event error:", err);
        showToast("Ralat sistem semasa mengemas kini maklumat acara", "error");
      }
    });
  }
}

// Modal View Controls
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("active");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("active");
}

// Multi-Image Slider Controls for Item Cards
window.slideItemImage = function(itemId, direction) {
  const container = document.getElementById(`slides-${itemId}`);
  if (!container) return;
  const slideWidth = container.clientWidth;
  container.scrollBy({ left: direction * slideWidth, behavior: 'smooth' });
};

window.goToItemSlide = function(itemId, index) {
  const container = document.getElementById(`slides-${itemId}`);
  if (!container) return;
  const slideWidth = container.clientWidth;
  container.scrollTo({ left: index * slideWidth, behavior: 'smooth' });
};

window.updateItemSliderDots = function(itemId) {
  const container = document.getElementById(`slides-${itemId}`);
  const dotsContainer = document.getElementById(`dots-${itemId}`);
  if (!container || !dotsContainer) return;
  
  const slideWidth = container.clientWidth;
  if (!slideWidth) return;
  const activeIdx = Math.round(container.scrollLeft / slideWidth);
  const dots = dotsContainer.querySelectorAll('.slider-dot');
  dots.forEach((dot, idx) => {
    if (idx === activeIdx) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
};

// Render Item Media Management Thumbnails inside Add/Edit Item modal
window.renderMediaManagerGrid = function() {
  const urlInput = document.getElementById("itemImageUrl");
  const container = document.getElementById("itemMediaThumbnailsGrid");
  const countLabel = document.getElementById("itemMediaCountLabel");
  if (!urlInput || !container) return;

  const rawVal = urlInput.value.trim();
  const urls = rawVal ? rawVal.split(/[\n,]+/).map(u => u.trim().replace(/\\/g, '/')).filter(Boolean) : [];

  if (countLabel) {
    countLabel.textContent = `${urls.length} gambar`;
  }

  if (urls.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 1.25rem; color: var(--text-muted); font-size: 0.8rem;">
        <i class="fa-solid fa-photo-film" style="font-size: 1.5rem; display: block; margin-bottom: 0.35rem; opacity: 0.4;"></i>
        Tiada gambar dimuat naik. Muat naik fail gambar di atas.
      </div>`;
    return;
  }

  container.innerHTML = urls.map((url, idx) => `
    <div class="media-thumb-card" title="Gambar #${idx + 1}">
      <img src="${escapeHtml(url)}" alt="Media ${idx + 1}" loading="lazy" decoding="async" data-on-error="placeholder">
      <span class="media-thumb-badge">#${idx + 1}</span>
      <div class="media-thumb-actions">
        <button type="button" class="btn-thumb-remove" data-action="remove-media" data-index="${idx}" title="Padam Gambar Ini">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
  `).join('');
};

window.removeMediaImage = function(index) {
  const urlInput = document.getElementById("itemImageUrl");
  if (!urlInput) return;

  const rawVal = urlInput.value.trim();
  const urls = rawVal ? rawVal.split(/[\n,]+/).map(u => u.trim().replace(/\\/g, '/')).filter(Boolean) : [];

  if (index >= 0 && index < urls.length) {
    urls.splice(index, 1);
    urlInput.value = urls.join(", ");
    renderMediaManagerGrid();
    showToast("Gambar dikeluarkan daripada senarai media", "info");
  }
};

// Edit Item Helper
window.openEditItemModal = function(itemId) {
  const item = state.data.items.find(i => i.id === itemId);
  if (!item) return;

  document.getElementById("editItemId").value = item.id;
  document.getElementById("itemName").value = item.name;
  document.getElementById("itemTargetPrice").value = item.target_price;

  const qtyEl = document.getElementById("itemQuantity");
  if (qtyEl) qtyEl.value = Math.max(1, parseInt(item.quantity, 10) || 1);

  const catEl = document.getElementById("itemCategory");
  if (catEl) catEl.value = item.category || "";

  const urlInput = document.getElementById("itemImageUrl");
  if (urlInput) urlInput.value = item.image || "";

  document.getElementById("itemIcon").value = item.icon || "fa-box";
  document.getElementById("itemDescription").value = item.description || "";

  document.getElementById("itemModalHeading").textContent = "Edit Barangan";
  renderMediaManagerGrid();
  openModal("modalAddItem");
};

// Render Events List in Manage Events Modal
function renderEventsListModal() {
  const container = document.getElementById("eventsListContainer");
  if (!container) return;

  const events = state.data.events || [];
  if (events.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <i class="fa-solid fa-box-archive" style="font-size: 2.5rem; opacity: 0.4; margin-bottom: 0.5rem;"></i>
        <p>Tiada rekod acara tersimpan lagi.</p>
      </div>`;
    return;
  }

  const currency = state.data.currency || "RM";

  container.innerHTML = events.map(ev => {
    const isActive = ev.status === 'active' || ev.id === state.data.active_event_id;

    return `
      <div class="event-card-item ${isActive ? 'active-event' : ''}">
        <div class="event-info-main">
          <div class="event-header-row" style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
            <span class="event-title-text">${escapeHtml(ev.title)}</span>
            <span class="event-status-badge ${isActive ? 'active' : 'completed'}">
              ${isActive ? '<i class="fa-solid fa-play"></i> Aktif' : '<i class="fa-solid fa-check-circle"></i> Selesai'}
            </span>
          </div>
          ${ev.description ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.35rem;">${escapeHtml(ev.description)}</div>` : ''}
          <div class="event-meta-details">
            <span><i class="fa-solid fa-sack-dollar" style="color: #6ee7b7;"></i> ${currency} ${formatMoney(ev.total_collected)}</span>
            <span><i class="fa-solid fa-bullseye" style="color: var(--accent-secondary);"></i> ${currency} ${formatMoney(ev.target_total)}</span>
            <span><i class="fa-solid fa-calendar-days"></i> ${ev.created_at ? ev.created_at.split(' ')[0] : ''}</span>
          </div>
        </div>
        <div style="display: flex; gap: 0.35rem; flex-direction: column; align-items: flex-end;">
          ${state.isAdmin ? `
            <button type="button" class="btn btn-sm btn-outline-info" data-action="edit-event" data-id="${ev.id}" style="font-size: 0.75rem; padding: 0.2rem 0.5rem; color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);">
              <i class="fa-solid fa-pen-to-square"></i> Sunting
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Open Edit Event Modal - Admin Only
window.openEditEventModal = function(eventId) {
  const events = state.data.events || [];
  const ev = events.find(e => e.id === eventId);
  if (!ev) return;

  const inputId = document.getElementById("inputEditEventId");
  const inputTitle = document.getElementById("inputEditEventTitle");
  const inputDesc = document.getElementById("inputEditEventDesc");

  if (inputId) inputId.value = ev.id;
  if (inputTitle) inputTitle.value = ev.title || "";
  if (inputDesc) inputDesc.value = ev.description || "";

  openModal("modalEditEvent");
};

// Move Item Up (manual sorting)
window.moveItemUp = async function(itemId) {
  const index = state.data.items.findIndex(item => item.id === itemId);
  if (index > 0) {
    const temp = state.data.items[index];
    state.data.items[index] = state.data.items[index - 1];
    state.data.items[index - 1] = temp;
    if (!await saveData()) return;
    updateAllUI();
    showToast("Barangan dialihkan ke atas", "success");
  }
};

// Move Item Down (manual sorting)
window.moveItemDown = async function(itemId) {
  const index = state.data.items.findIndex(item => item.id === itemId);
  if (index !== -1 && index < state.data.items.length - 1) {
    const temp = state.data.items[index];
    state.data.items[index] = state.data.items[index + 1];
    state.data.items[index + 1] = temp;
    if (!await saveData()) return;
    updateAllUI();
    showToast("Barangan dialihkan ke bawah", "success");
  }
};

// Delete Item Helper
window.deleteItem = async function(itemId) {
  const item = state.data.items.find(i => i.id === itemId);
  if (!item) return;

  if (confirm(`Adakah anda pasti mahu memadamkan barangan "${item.name}"?`)) {
    state.data.items = state.data.items.filter(i => i.id !== itemId);
    if (!await saveData()) return;
    updateAllUI();
    showToast(`Barangan "${item.name}" telah dipadamkan`, "info");
  }
};

// Toast Notification Helper
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type === 'success' ? 'toast-success' : (type === 'error' ? 'toast-error' : '')}`;

  let icon = "fa-info-circle";
  if (type === "success") icon = "fa-circle-check";
  if (type === "error") icon = "fa-triangle-exclamation";

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Lazy loader for heavy libraries (pinned copies under vendor/js).
// html2canvas (~194KB) is only reachable from admin-only flows, so it is fetched
// on demand instead of blocking every public page load.
const EXTERNAL_SCRIPTS = {
  html2canvas: "vendor/js/html2canvas.min.js" // 1.4.1
};
const scriptPromises = {};

function loadExternalScript(key) {
  if (scriptPromises[key]) return scriptPromises[key];

  scriptPromises[key] = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = EXTERNAL_SCRIPTS[key];
    el.async = true;
    el.onload = resolve;
    el.onerror = () => {
      delete scriptPromises[key]; // allow a retry on the next attempt
      reject(new Error(`Failed to load ${key}`));
    };
    document.head.appendChild(el);
  });
  return scriptPromises[key];
}

// Resolve to true once the library is usable, false (with a toast) if it cannot load.
async function ensureLibrary(key, globalName, failMessage) {
  if (typeof window[globalName] !== "undefined") return true;
  try {
    await loadExternalScript(key);
    return typeof window[globalName] !== "undefined";
  } catch (err) {
    console.error(err);
    showToast(failMessage, "error");
    return false;
  }
}

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Sanitize the HTML produced by marked before it is inserted into the page.
//
// Prefers DOMPurify (loaded by the page). The regex fallback below only runs if
// that script fails to load - it is a blacklist and misses plenty
// (<iframe src="data:...">, entity-encoded javascript:, <form action>, ...), so
// it is a last resort rather than the main defence.
const MARKDOWN_ALLOWED_TAGS = [
  "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "del", "mark", "small",
  "code", "pre", "blockquote", "span", "div",
  "ul", "ol", "li", "a", "img",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "th", "td"
];
const MARKDOWN_ALLOWED_ATTR = ["href", "title", "alt", "src", "target", "rel", "class"];

function sanitizeHtml(html) {
  if (typeof html !== "string") return html;

  if (typeof DOMPurify !== "undefined" && typeof DOMPurify.sanitize === "function") {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: MARKDOWN_ALLOWED_TAGS,
      ALLOWED_ATTR: MARKDOWN_ALLOWED_ATTR,
      // Only these URL schemes may appear in href/src.
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|uploads\/|\/|#|[^a-z]|[a-z+.-]+(?![a-z+.\-:]))/i,
      FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input"],
      FORBID_ATTR: ["style", "srcset", "formaction", "xlink:href"]
    });
  }

  console.warn("DOMPurify unavailable - falling back to the limited regex sanitizer.");
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<\/?(?:iframe|object|embed|form|input|style|link|meta|base)\b[^>]*>/gi, "")
    .replace(/on\w+\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi, "")
    .replace(/(href|src|action|formaction)\s*=\s*(['"]\s*(?:javascript|data|vbscript):[^'"]*['"]|(?:javascript|data|vbscript):[^\s>]+)/gi, "");
}

// Export All Contribution Transactions to CSV
function exportGiversCsv() {
  const currency = state.data.currency || "RM";
  const rawList = state.data.contributions || [];

  if (rawList.length === 0) {
    showToast("Tiada rekod transaksi untuk dieksport.", "warning");
    return;
  }

  const sortOrder = state.giverSortOrder || "newest";

  // Generate CSV Content with UTF-8 BOM for Excel support
  let csvContent = "\uFEFF";
  csvContent += `No,Nama Staf,ID Pengguna,Jumlah Disumbang (${currency}),Tarikh Sumbangan\n`;

  // Sort list according to active sortOrder
  const sortedForCsv = [...rawList].sort((a, b) => {
    const parseTime = (dateStr) => {
      const d = dateStr || "";
      if (!d || d === "-") return 0;
      const t = new Date(d.replace(/-/g, "/")).getTime();
      return isNaN(t) ? 0 : t;
    };
    const timeA = parseTime(a.date || a.created_at);
    const timeB = parseTime(b.date || b.created_at);

    if (timeA !== timeB) {
      return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
    }
    const idA = parseInt(a.id, 10) || 0;
    const idB = parseInt(b.id, 10) || 0;
    return sortOrder === "oldest" ? idA - idB : idB - idA;
  });

  // Write each individual transaction record
  sortedForCsv.forEach((c, idx) => {
    const nameStr = `"${(c.name || c.contributor || c.staff_name || "").replace(/"/g, '""')}"`;
    const userStr = `"${(c.username || "").replace(/"/g, '""')}"`;
    const amountStr = (parseFloat(c.amount) || 0).toFixed(2);
    const dateStr = `"${formatDateTimeDisplay(c.date || c.created_at || "")}"`;
    csvContent += `${idx + 1},${nameStr},${userStr},${amountStr},${dateStr}\n`;
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  link.setAttribute("href", url);
  link.setAttribute("download", `rekod_transaksi_sumbangan_${today}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast(`Berjaya mengeksport ${rawList.length} rekod transaksi ke fail CSV!`, "success");
}

// ==========================================================================
// WhatsApp Summary & Poster Image Export Module
// ==========================================================================

function openWhatsappExportModal() {
  if (!state.isAdmin) {
    showToast("Ciri eksport ke WhatsApp ini terhad kepada Pentadbir sahaja.", "warning");
    return;
  }
  renderWhatsappPosterCard();
  openModal("modalExportWhatsapp");
}

function renderWhatsappPosterCard() {
  const currency = state.data.currency || "RM";

  // Same shared totals as the dashboard, so the exported poster can never show
  // a different figure from the page it was generated from.
  const totals = computeTotals();
  const totalCollected = totals.total_collected;
  const totalExpenses = totals.total_expenses;
  const bakiSemasa = totals.baki;
  const totalTargetGoal = totals.target_total;
  const overallPercent = totals.has_target ? Math.round(totals.percent_complete) : 0;

  // Populate Poster DOM elements
  const posterAppTitle = document.getElementById("posterAppTitle");
  if (posterAppTitle) posterAppTitle.textContent = formatPantryTitle(state.data.title);

  const posterAppSubtitle = document.getElementById("posterAppSubtitle");
  if (posterAppSubtitle) {
    posterAppSubtitle.textContent = (state.data.description && state.data.description.trim() !== "")
      ? state.data.description
      : "Sumbangan & Perbelanjaan Pantry";
  }

  const posterTotalCollected = document.getElementById("posterTotalCollected");
  if (posterTotalCollected) posterTotalCollected.textContent = `${currency} ${formatMoney(totalCollected)}`;

  const posterTotalExpenses = document.getElementById("posterTotalExpenses");
  if (posterTotalExpenses) posterTotalExpenses.textContent = `${currency} ${formatMoney(totalExpenses)}`;

  const posterBakiSemasa = document.getElementById("posterBakiSemasa");
  if (posterBakiSemasa) posterBakiSemasa.textContent = `${currency} ${formatMoney(bakiSemasa)}`;

  const posterBakiCard = document.getElementById("posterBakiCard");
  if (posterBakiCard) {
    if (bakiSemasa < 0) {
      posterBakiCard.classList.remove("gold");
      posterBakiCard.classList.add("surplus");
    } else {
      posterBakiCard.classList.remove("surplus");
      posterBakiCard.classList.add("gold");
    }
  }

  const posterPercentText = document.getElementById("posterPercentText");
  if (posterPercentText) posterPercentText.textContent = "Sumbangan Diterima";

  const posterProgressPercentNum = document.getElementById("posterProgressPercentNum");
  if (posterProgressPercentNum) posterProgressPercentNum.textContent = `${overallPercent}%`;

  const posterProgressBar = document.getElementById("posterProgressBar");
  if (posterProgressBar) posterProgressBar.style.width = `${overallPercent}%`;

  const posterStatusBadge = document.getElementById("posterStatusBadge");
  if (posterStatusBadge) {
    if (overallPercent >= 100 && totalTargetGoal > 0) {
      posterStatusBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>Dah Boleh Beli!</span>`;
      posterStatusBadge.style.background = "rgba(16, 185, 129, 0.2)";
      posterStatusBadge.style.color = "#34d399";
    } else {
      posterStatusBadge.innerHTML = `<i class="fa-solid fa-chart-line"></i> <span>Kemajuan Kutipan</span>`;
      posterStatusBadge.style.background = "rgba(37, 211, 102, 0.15)";
      posterStatusBadge.style.color = "#25D366";
    }
  }

  const hasItems = state.data.items && state.data.items.length > 0;

  const posterProgressSection = document.getElementById("posterProgressSection");
  if (posterProgressSection) {
    posterProgressSection.style.display = hasItems ? "" : "none";
  }

  const posterItemsSection = document.getElementById("posterItemsSection");
  if (posterItemsSection) {
    posterItemsSection.style.display = hasItems ? "" : "none";
  }

  // Populate Poster Items Breakdown List
  const itemsListEl = document.getElementById("posterItemsList");
  if (itemsListEl && hasItems) {
    let poolRemaining = totalCollected;

    itemsListEl.innerHTML = state.data.items.map(item => {
      const qty = parseInt(item.quantity) || 1;
      const targetPrice = (parseFloat(item.target_price) || 0) * qty;
      const iconClass = item.icon || "fa-box";

      const itemCollected = Math.min(targetPrice, poolRemaining);
      poolRemaining = Math.max(0, poolRemaining - itemCollected);
      const itemPercent = targetPrice > 0 ? Math.min(100, Math.round((itemCollected / targetPrice) * 100)) : 0;
      const isFunded = itemPercent >= 100;

      const statusBadge = isFunded
        ? `<span class="poster-item-status status-done"><i class="fa-solid fa-check"></i> Selesai</span>`
        : `<span class="poster-item-status status-pending"><i class="fa-solid fa-hourglass-half"></i> Dalam Kutipan (${itemPercent}%)</span>`;

      return `
        <div class="poster-item-row">
          <div class="poster-item-name">
            <i class="fa-solid ${iconClass}" style="color: ${isFunded ? '#34d399' : '#818cf8'}; width: 16px;"></i>
            <span>${escapeHtml(item.name)} ${qty > 1 ? `<small style="color: #94a3b8;">(x${qty})</small>` : ''}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <span class="poster-item-price">${currency} ${formatMoney(targetPrice)}</span>
            ${statusBadge}
          </div>
        </div>
      `;
    }).join('');
  }

  // QR Code / Showcase snippet
  const posterQrSection = document.getElementById("posterQrSection");
  if (posterQrSection) {
    const isShowcaseVisible = state.data.showcase && state.data.showcase.visible !== false;
    if (isShowcaseVisible && state.data.showcase.image) {
      document.getElementById("posterQrImg").src = state.data.showcase.image;
      document.getElementById("posterQrTitle").innerHTML = `QR Code &bull; Ahmad Zabil Albar`;
      document.getElementById("posterQrDesc").innerHTML = `Mohon maklumkan kepada saya setelah selesai transaksi.<div style="color: #6ee7b7; font-weight: 700; margin-top: 0.25rem;">Terima Kasih</div>`;
      posterQrSection.style.display = "flex";
    } else {
      posterQrSection.style.display = "none";
    }
  }

  const posterFooterNote = document.getElementById("posterFooterNote");
  if (posterFooterNote) {
    const note = (state.data.poster_footer || "").trim() || formatPantryTitle(state.data.title);
    posterFooterNote.textContent = note;
  }

  // Poster Timestamp
  const posterTimestamp = document.getElementById("posterTimestamp");
  if (posterTimestamp) {
    const now = new Date();
    const months = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];
    const d = now.getDate();
    const m = months[now.getMonth()];
    const y = now.getFullYear();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedHours = hours.toString().padStart(2, '0');
    posterTimestamp.textContent = `Tarikh: ${d} ${m} ${y}, ${formattedHours}:${minutes} ${ampm}`;
  }
}

async function renderPosterCanvas() {
  const cardEl = document.getElementById("whatsappCardPreview");
  if (!cardEl) return null;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "560px";
  container.style.height = "560px";
  container.style.zIndex = "-9999";
  container.style.overflow = "hidden";
  container.style.transform = "none";
  container.style.zoom = "1";

  const clone = cardEl.cloneNode(true);
  clone.style.width = "560px";
  clone.style.height = "560px";
  clone.style.transform = "none";
  clone.style.zoom = "1";
  clone.style.margin = "0";
  clone.style.boxSizing = "border-box";

  container.appendChild(clone);
  document.body.appendChild(container);

  try {
    if (typeof html2canvas === "undefined") {
      await loadExternalScript("html2canvas");
    }
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#090d16",
      logging: false,
      width: 560,
      height: 560
    });
    return canvas;
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

async function downloadWhatsappPosterImage() {
  const cardEl = document.getElementById("whatsappCardPreview");
  const btnDownload = document.getElementById("btnDownloadWhatsappCard");
  if (!cardEl) return;

  const ready = await ensureLibrary("html2canvas", "html2canvas", "Gagal memuatkan pustaka penjana gambar. Sila semak sambungan rangkaian.");
  if (!ready) return;

  const originalText = btnDownload ? btnDownload.innerHTML : "";
  if (btnDownload) {
    btnDownload.disabled = true;
    btnDownload.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menjana Gambar...`;
  }

  showToast("Menjana gambar poster tinggi resolusi...", "info");

  try {
    const canvas = await renderPosterCanvas();
    if (!canvas) throw new Error("Canvas rendering returned null");

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];
    link.download = `Pantry_Ringkasan_Kutipan_${today}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Gambar poster PNG berjaya dimuat turun!", "success");
  } catch (err) {
    console.error("Error exporting poster canvas:", err);
    showToast("Gagal menjana gambar poster. Sila cuba lagi.", "error");
  } finally {
    if (btnDownload) {
      btnDownload.disabled = false;
      btnDownload.innerHTML = originalText;
    }
  }
}

async function copyWhatsappPosterImage() {
  const cardEl = document.getElementById("whatsappCardPreview");
  const btnCopy = document.getElementById("btnCopyWhatsappCard");
  if (!cardEl) return;

  const ready = await ensureLibrary("html2canvas", "html2canvas", "Gagal memuatkan pustaka penjana gambar. Sila semak sambungan rangkaian.");
  if (!ready) return;

  const originalText = btnCopy ? btnCopy.innerHTML : "";
  if (btnCopy) {
    btnCopy.disabled = true;
    btnCopy.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyalin...`;
  }

  showToast("Menjana gambar poster untuk disalin...", "info");

  try {
    const canvas = await renderPosterCanvas();
    if (!canvas) throw new Error("Canvas rendering returned null");

    if (!navigator.clipboard || !window.ClipboardItem) {
      showToast("Papan klip tidak disokong pada pelayar ini. Sila gunakan 'Muat Turun Gambar'.", "warning");
      if (btnCopy) {
        btnCopy.disabled = false;
        btnCopy.innerHTML = originalText;
      }
      return;
    }

    canvas.toBlob(async (blob) => {
      if (!blob) {
        showToast("Gagal menjana gambar poster.", "error");
        if (btnCopy) {
          btnCopy.disabled = false;
          btnCopy.innerHTML = originalText;
        }
        return;
      }
      try {
        const item = new ClipboardItem({ "image/png": blob });
        await navigator.clipboard.write([item]);
        showToast("Gambar poster berjaya disalin ke papan klip!", "success");
      } catch (err) {
        console.error("Clipboard write error:", err);
        showToast("Gagal menyalin gambar ke papan klip. Sila gunakan 'Muat Turun Gambar'.", "error");
      } finally {
        if (btnCopy) {
          btnCopy.disabled = false;
          btnCopy.innerHTML = originalText;
        }
      }
    }, "image/png");
  } catch (err) {
    console.error("Error copying poster canvas:", err);
    showToast("Gagal menjana gambar poster. Sila cuba lagi.", "error");
    if (btnCopy) {
      btnCopy.disabled = false;
      btnCopy.innerHTML = originalText;
    }
  }
}

// Window functions for global onclick handlers in Staff Management table
window.openAddStaffModal = function() {
  const editIdInput = document.getElementById("staffEditId");
  const nameInput = document.getElementById("inputStaffName");
  if (editIdInput) editIdInput.value = "";
  if (nameInput) nameInput.value = "";
  const titleEl = document.getElementById("modalStaffTitle");
  if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-user-plus" style="color: var(--accent-primary);"></i> Tambah Staf Baharu`;
  openModal("modalAddEditStaff");
};

window.openEditStaffModal = function(id) {
  const staff = (state.staffList || []).find(s => s.id == id);
  if (!staff) return;
  const editIdInput = document.getElementById("staffEditId");
  const nameInput = document.getElementById("inputStaffName");
  if (editIdInput) editIdInput.value = staff.id;
  if (nameInput) nameInput.value = staff.name;
  const titleEl = document.getElementById("modalStaffTitle");
  if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-user-pen" style="color: var(--accent-primary);"></i> Edit Maklumat Staf`;
  openModal("modalAddEditStaff");
};

window.confirmDeleteStaff = async function(id) {
  const staff = (state.staffList || []).find(s => s.id == id);
  const name = staff ? staff.name : "";
  if (!confirm(`Adakah anda pasti ingin memadamkan staf "${name}" daripada pangkalan data?`)) return;
  try {
    const { ok, body: data } = await apiPost("api.php?action=delete_staff", { id: id });
    if (ok && data.success) {
      showToast(`Staf "${name}" berjaya dipadamkan`, "success");
      await loadStaffList();
      renderAdminStaffManagement();
    } else {
      showToast(data.error || "Gagal memadamkan staf", "error");
    }
  } catch (err) {
    console.error("Delete staff error:", err);
    showToast("Ralat pelayan semasa memadamkan staf", "error");
  }
};

// Render Admin Staff Directory Management Table
function renderAdminStaffManagement() {
  const tbody = document.getElementById("adminStaffTableBody");
  const visibleCountEl = document.getElementById("adminStaffVisibleCount");
  const totalCountEl = document.getElementById("adminStaffTotalCount");
  const totalSubCountEl = document.getElementById("adminStaffTotalCountSub");
  const searchInput = document.getElementById("adminStaffSearchInput");

  if (!tbody) return;

  if (!state.isAdmin) {
    tbody.innerHTML = "";
    return;
  }

  const staffList = state.staffList || [];
  if (totalCountEl) totalCountEl.textContent = staffList.length;
  if (totalSubCountEl) totalSubCountEl.textContent = staffList.length;

  const query = searchInput ? (searchInput.value || "").trim().toLowerCase() : "";
  const sorted = [...staffList].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const filtered = sorted.filter(s => !query || (s.name || "").toLowerCase().includes(query));

  if (visibleCountEl) visibleCountEl.textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="col-empty">
          ${query ? 'Tiada staf ditemui mengikut carian anda.' : 'Tiada rekod staf dalam pangkalan data.'}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((s, idx) => `
    <tr>
      <td class="col-idx">${idx + 1}</td>
      <td class="col-main">${escapeHtml(s.name)}</td>
      <td class="col-actions">
        <button type="button" class="btn btn-secondary btn-icon" data-action="edit-staff" data-id="${s.id || 0}" title="Edit Staf">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button type="button" class="btn btn-danger-soft btn-icon" data-action="delete-staff" data-id="${s.id || 0}" title="Padam Staf">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    </tr>
  `).join('');
}


