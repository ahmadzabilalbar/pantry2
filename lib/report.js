/**
 * Public printable report at /laporan (port of report_view.php).
 *
 * PUBLIC: always fed buildPublicPayload(data, false), so the ledger is already
 * stripped. The only per-giver data shown is the anonymised giver_coins
 * amounts, as on the public coin wall. Never add giver names here.
 */
import { h } from "./http.js";
import { computeTotals, formatPantryTitle } from "./store.js";

const fmtMoney = (currency, amount) =>
  `${currency} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Same display shape as formatDateTimeDisplay() in app.js: d/m/yyyy [HH:mm]
function fmtDate(value) {
  const s = String(value ?? "").replace("T", " ").trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const time = m[4] !== undefined ? ` ${m[4].padStart(2, "0")}:${m[5]}` : "";
    return `${+m[3]}/${+m[2]}/${m[1]}${time}`;
  }
  return s === "" ? "-" : s;
}

const nl2br = s => h(s).replace(/\r?\n/g, "<br />\n");
// Same light Markdown the card uses for its usual "**Terima Kasih**".
const lightMd = s => nl2br(String(s ?? "").trim()).replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");

function generatedAt() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/**
 * @param {object} data public payload (buildPublicPayload(..., false))
 * @param {{showHidden?: boolean, nonce: string, version: string, url: string}} opts
 */
export function renderReport(data, opts) {
  const currency = data.currency || "RM";
  const money = v => fmtMoney(currency, v);
  const totals = data.totals || computeTotals(data);
  const title = formatPantryTitle(data.title);
  const expenses = data.expenses || [];
  const secVis = data.section_visibility || {};
  const showHidden = Boolean(opts.showHidden);

  const showExpenses = showHidden || secVis.expenses !== false;

  const coins = (data.giver_coins || []).map(c => Number(c.amount) || 0).filter(a => a > 0).sort((a, b) => b - a);
  const showCoins = coins.length > 0 && (showHidden || secVis.coins !== false);

  const showcase = data.showcase || {};
  const showQr = (showHidden || (secVis.showcase !== false && showcase.visible))
    && (String(showcase.image || "").trim() !== "" || String(showcase.title || "").trim() !== "");
  const qrImage = showQr ? String(showcase.image || "").trim() : "";

  const ann = data.announcement || {};
  const annTitle = String(ann.title || "").trim();
  const annMsg = String(ann.message || "").trim();
  const showAnn = (annTitle !== "" || annMsg !== "") && (showHidden || secVis.announcement !== false);

  // Same wording as shareReportToWhatsapp() in app.js; keep the two in step.
  const shareLines = [
    `*${title}*`,
    "Laporan Terkini Kutipan Dana",
    "",
    `\u{1F4B0} Jumlah Kutipan: ${money(totals.total_collected)}`,
    `\u{1F6D2} Jumlah Perbelanjaan: ${money(totals.total_expenses)}`,
    `\u{1F3E6} Baki: ${money(totals.baki)}`
  ];
  if (totals.has_target) shareLines.push(`\u{1F3AF} Sasaran: ${money(totals.target_total)} (${totals.percent_complete}%)`);
  shareLines.push("", "\u{1F4C4} Lihat laporan penuh:", opts.url);
  // api.whatsapp.com directly: the wa.me redirect mangles non-ASCII text.
  const shareHref = "https://api.whatsapp.com/send?text=" + encodeURIComponent(shareLines.join("\n"));

  const ogDesc = `Kutipan ${money(totals.total_collected)} · Perbelanjaan ${money(totals.total_expenses)} · Baki ${money(totals.baki)}`;
  const expenseSum = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const expenseRows = expenses.length
    ? expenses.map((e, i) => `
            <tr>
              <td class="muted">${i + 1}</td>
              <td>${h(fmtDate(e.date))}</td>
              <td>${h(e.title)}</td>
              <td class="muted">${h(e.category || "-")}</td>
              <td class="muted">${h(e.staff_name || "-")}</td>
              <td class="num">${h(money(e.amount))}</td>
            </tr>`).join("")
    : `
            <tr><td colspan="6" class="empty">Tiada rekod perbelanjaan.</td></tr>`;

  const targetKpi = totals.has_target ? `
    <div class="kpi">
      <div class="label">Sasaran</div>
      <div class="value">${h(money(totals.target_total))}</div>
      <div class="note">
        ${h(Number(totals.percent_complete).toFixed(1))}% dicapai &middot;
        ${totals.extra_amount > 0 ? "Lebihan " + h(money(totals.extra_amount)) : "Baki diperlukan " + h(money(totals.remaining_needed))}
      </div>
      <div class="progress"><span style="width: ${Math.min(100, Math.max(0, Number(totals.percent_complete) || 0))}%"></span></div>
    </div>` : "";

  const expensesSection = showExpenses ? `
  <section>
    <h2><i class="fa-solid fa-receipt"></i> Perbelanjaan <span class="count">(${expenses.length})</span></h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>#</th><th>Tarikh</th><th>Perkara</th><th>Kategori</th><th>Dibeli Oleh</th><th class="num">Jumlah</th></tr>
        </thead>
        <tbody>${expenseRows}
        </tbody>${expenses.length ? `
        <tfoot>
          <tr><td colspan="5">Jumlah</td><td class="num">${h(money(expenseSum))}</td></tr>
        </tfoot>` : ""}
      </table>
    </div>
  </section>` : "";

  const coinsSection = showCoins ? `
  <section>
    <h2><i class="fa-solid fa-coins"></i> Sumbangan <span class="count">(${coins.length})</span></h2>
    <div class="coins-grid-container">${coins.map(a => `
      <div class="giver-coin-chip">
        <div class="giver-coin-icon"><i class="fa-solid fa-coins"></i></div>
        <span class="giver-coin-amount">${h(money(a))}</span>
      </div>`).join("")}
    </div>
  </section>` : "";

  const qrSection = showQr ? `
  <section>
    <h2><i class="fa-solid fa-qrcode"></i> Info QR Code</h2>${showAnn ? `
    <div class="report-ann">${annTitle !== "" ? `<div class="ann-title">${h(annTitle)}</div>` : ""}${annMsg !== "" ? `<div class="ann-msg">${lightMd(annMsg)}</div>` : ""}
    </div>` : ""}
    <div class="report-qr">${qrImage !== "" ? `
      <div class="qr-box"><img src="${h(qrImage)}" alt="QR Code"></div>` : ""}
      <div>
        <div class="qr-title">${nl2br(String(showcase.title || "").trim())}</div>
        <div class="qr-desc">${lightMd(showcase.description)}</div>
      </div>
    </div>
  </section>` : "";

  return `<!DOCTYPE html>
<html lang="ms" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Laporan &middot; ${h(title)}</title>
  <meta name="description" content="${h(ogDesc)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${h(title)}">
  <meta property="og:title" content="${h(title)} — Laporan">
  <meta property="og:description" content="${h(ogDesc)}">
  <meta property="og:url" content="${h(opts.url)}">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📊</text></svg>">
  <link rel="stylesheet" href="vendor/fonts/fonts.css">
  <link rel="stylesheet" href="vendor/fontawesome/css/all.min.css">
  <script nonce="${h(opts.nonce)}">
    try { document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'dark'); } catch (e) {}
  </script>
  <link rel="stylesheet" href="styles.css?v=${h(opts.version)}">
  <link rel="stylesheet" href="report.css?v=${h(opts.version)}">
</head>
<body class="report-page">
<main class="report">

  <header class="report-head">
    <div>
      <h1>${h(title)} &mdash; Laporan</h1>
    </div>
    <div class="report-actions no-print">
      <a href="/"><i class="fa-solid fa-arrow-left"></i> Kembali</a>
      <a class="whatsapp" href="${h(shareHref)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Kongsi WhatsApp</a>
      <button type="button" class="primary" id="btnPrintReport"><i class="fa-solid fa-print"></i> Cetak / Simpan PDF</button>
    </div>
  </header>

  <!-- Summary: every figure comes from computeTotals() -->
  <div class="kpis">
    <div class="kpi good">
      <div class="label">Jumlah Kutipan</div>
      <div class="value">${h(money(totals.total_collected))}</div>
      <div class="note">${Number(totals.contributor_count) || 0} sumbangan diterima</div>
    </div>
    <div class="kpi bad">
      <div class="label">Jumlah Perbelanjaan</div>
      <div class="value">${h(money(totals.total_expenses))}</div>
      <div class="note">${expenses.length} rekod perbelanjaan</div>
    </div>
    <div class="kpi ${totals.baki < 0 ? "bad" : ""}">
      <div class="label">Baki Semasa</div>
      <div class="value">${h(money(totals.baki))}</div>
      <div class="note">Kutipan tolak perbelanjaan</div>
    </div>${targetKpi}
  </div>
${expensesSection}
${coinsSection}
${qrSection}

  <p class="report-foot">Laporan dijana secara automatik oleh ${h(title)} &middot; ${h(generatedAt())}</p>
</main>

<script nonce="${h(opts.nonce)}">
  document.getElementById('btnPrintReport').addEventListener('click', function () { window.print(); });
</script>
</body>
</html>`;
}
