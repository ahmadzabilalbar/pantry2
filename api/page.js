/**
 * The dashboard (/) - port of index.php. It is also the page the WhatsApp share
 * links to; the old /laporan report redirects here (vercel.json).
 *
 * Server-renders the metrics and admin state for a fast first paint and
 * inlines the privacy-filtered dataset as window.INITIAL_DATA, so a normal
 * load makes zero API calls.
 */
import {
  loadSession, commitSession, isAdminSession, authInfo, newNonce, setPageSecurityHeaders
} from "../lib/auth.js";
import { sendHtml, jsonForScript, h, origin } from "../lib/http.js";
import * as store from "../lib/store.js";
import { renderIndexHtml } from "../lib/indexPage.js";

// Cache buster for app.js / styles.css: changes on every deployment.
const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev").slice(0, 12);

function progressText(totals, money) {
  const base = `${totals.percent_complete}% Selesai (${money(totals.total_collected)} / ${money(totals.target_total)})`;
  if (totals.percent_complete < 100) return base;
  let out = `${base}
              <span class="sticker-dah-boleh-beli" style="margin-left: 0.5rem; font-size: 0.75rem; vertical-align: middle;">
                <i class="fa-solid fa-circle-check"></i> DAH BOLEH BELI DAH!
              </span>`;
  if (totals.extra_amount > 0) {
    out += `
                <span class="sticker-extra" style="margin-left: 0.35rem; font-size: 0.75rem; vertical-align: middle; background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); padding: 0.2rem 0.5rem; border-radius: 9999px;">
                  <i class="fa-solid fa-gift"></i> Lebihan ${money(totals.extra_amount)}
                </span>`;
  }
  return out;
}

export default async function handler(req, res) {
  const nonce = newNonce();
  setPageSecurityHeaders(res, nonce);

  let sess;
  try {
    sess = loadSession(req);
    commitSession(req, res, sess);
  } catch (e) {
    // Almost always a missing environment variable (SESSION_SECRET) on a new
    // deployment: say so instead of Vercel's bare FUNCTION_INVOCATION_FAILED.
    console.error("page: session setup failed:", e.message);
    return sendHtml(res, 500, `<!DOCTYPE html><html lang="ms"><meta charset="UTF-8"><title>Konfigurasi belum lengkap</title>
<body style="font-family: system-ui, sans-serif; max-width: 34rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5;">
<h1>Konfigurasi pelayan belum lengkap</h1>
<p>Pemboleh ubah persekitaran (environment variables) aplikasi belum ditetapkan di Vercel. Lihat langkah 5 dalam README.md, kemudian deploy semula.</p>
</body></html>`);
  }
  const isAdmin = isAdminSession(sess);

  let data = store.FALLBACK_DATA;
  let staff = [];
  try {
    const tables = await store.loadTables({ fresh: isAdmin });
    data = store.getPantryData(tables);
    // The staff directory is admin-only; anonymous pages never receive it.
    if (isAdmin) staff = store.staffList(tables);
  } catch (e) {
    // Render the shell anyway; app.js retries over the API.
    console.error("page: data load failed:", e.message);
  }

  const payload = store.buildPublicPayload(data, isAdmin);
  const totals = payload.totals;
  const currency = data.currency || "RM";
  const money = v => h(`${currency} ${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const categories = data.expense_categories || ["Lain-lain"];

  const html = renderIndexHtml({
    nonce,
    version: VERSION,
    isAdmin,
    displayTitle: store.formatPantryTitle(data.title),
    announcement: {
      title: data.announcement?.title ?? "",
      message: data.announcement?.message ?? ""
    },
    showcase: {
      title: data.showcase?.title ?? "",
      image: data.showcase?.image ?? "",
      description: data.showcase?.description ?? ""
    },
    secVis: data.section_visibility || {},
    totals,
    money,
    progressText: progressText(totals, money),
    itemCount: (data.items || []).length,
    contributionCount: (data.contributions || []).length,
    today: store.todayLocal(),
    posterFooter: data.poster_footer || store.formatPantryTitle(data.title),
    shareUrl: `${origin(req)}/`,
    categoryOptions: categories
      .map(c => `              <option value="${h(c)}"${c === "Lain-lain" ? " selected" : ""}>${h(c)}</option>`)
      .join("\n"),
    staffJson: jsonForScript(staff),
    dataJson: jsonForScript(payload),
    authJson: jsonForScript(authInfo(sess))
  });
  return sendHtml(res, 200, html);
}
