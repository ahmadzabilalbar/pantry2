/**
 * Dashboard markup (port of index.php). Generated once from the PHP template;
 * edit it directly from now on. Every interpolated value is either escaped with
 * h()/nl2br(), a precomputed number, or JSON from jsonForScript().
 */
import { h } from "./http.js";

const nl2br = s => h(s).replace(/\r?\n/g, "<br />\n");

export function renderIndexHtml(v) {
  return `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${h(v.displayTitle)}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🤝</text></svg>">
  
  <!-- Fonts, icons and libraries are served from vendor/ (pinned copies of
       Outfit/Plus Jakarta Sans, Font Awesome 6.5.1, marked 12.0.2 and
       DOMPurify 3.1.6). Nothing loads from a third party, so the page works on
       the LAN without internet and the CSP can allow scripts from 'self' only.
       DOMPurify sanitises the HTML marked produces - see sanitizeHtml(). -->
  <link rel="stylesheet" href="vendor/fonts/fonts.css">
  <link rel="stylesheet" href="vendor/fontawesome/css/all.min.css">
  <script src="vendor/js/marked.min.js" defer></script>
  <script src="vendor/js/purify.min.js" defer></script>

  <!-- html2canvas (WhatsApp poster export) is an admin-only feature and is
       lazy-loaded on demand by app.js, so it no longer costs every visitor
       ~194KB of script on first paint. -->

  <!-- Early Theme Initialization to Prevent FOUC -->
  <script nonce="${h(v.nonce)}">
    (function() {
      try {
        var savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
      } catch (e) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    })();
  </script>

  <!-- Custom Styles -->
  <link rel="stylesheet" href="styles.css?v=${v.version}">
</head>
<body class="${v.isAdmin ? 'is-admin' : ''}">

  <div class="app-container">
    
    <!-- Top Navigation / Header -->
    <header class="top-nav">
      <div class="brand">
        <div class="brand-icon">
          <i class="fa-solid fa-hand-holding-dollar"></i>
        </div>
        <div>
          <h1 class="brand-title" id="appTitle">${h(v.displayTitle)}</h1>
        </div>
      </div>

      <div class="nav-actions">
        <button class="btn btn-secondary btn-icon" id="btnOpenSectionVisibilityModal" title="Tetapan Paparan Seksyen (Papar / Sembunyi Seksyen)">
          <i class="fa-solid fa-sliders"></i>
        </button>
        <button type="button" class="btn btn-whatsapp btn-icon" id="btnShareReportWhatsapp" data-action="share-report-whatsapp" data-url="${h(v.reportUrl)}" title="Kongsi Laporan Terkini &amp; Pautan Halaman ke WhatsApp">
          <i class="fa-solid fa-share-nodes"></i>
        </button>
        <button class="btn btn-secondary btn-icon" id="btnToggleTheme" title="Tukar Tema (Gelap / Terang)">
          <i class="fa-solid fa-moon" id="themeBtnIcon"></i>
        </button>
        <span class="admin-badge active btn-icon admin-only" id="adminBadge" title="Pentadbir Aktif (Ahmad Zabil Albar)">
          <i class="fa-solid fa-user-shield"></i>
        </span>
        <button class="btn btn-secondary btn-icon admin-only" id="btnManageEvents" title="Butiran Acara Kutipan">
          <i class="fa-solid fa-layer-group"></i>
        </button>
        <button class="btn btn-success btn-icon admin-only" id="btnOpenAddAmount" title="Tambah Jumlah Sumbangan">
          <i class="fa-solid fa-plus"></i>
        </button>
        <button class="btn btn-secondary btn-icon" id="btnToggleAdmin" title="${v.isAdmin ? 'Log Keluar Pentadbir' : 'Log Masuk Pentadbir'}">
          <i class="fa-solid ${v.isAdmin ? 'fa-right-from-bracket' : 'fa-lock'}" id="adminBtnIcon"></i>
        </button>
      </div>
    </header>

    <!-- Announcement & Featured Showcase Grid Section -->
    <section class="top-info-grid">
      <!-- Announcement Banner -->
      <div class="announcement-banner" id="announcementSection" style="${v.secVis.announcement !== false ? '' : 'display: none !important;'}">
        <div class="announcement-header">
          <div class="announcement-badge">
            <i class="fa-solid fa-bullhorn"></i> Pengumuman
          </div>
          <button type="button" class="btn btn-secondary btn-icon admin-only" id="btnEditAnnouncement" style="width: 30px; height: 30px; font-size: 0.75rem;" title="Kemaskini Pengumuman">
            <i class="fa-solid fa-pen"></i>
          </button>
        </div>
        <div class="announcement-body">
          <h3 class="announcement-title" id="announcementTitle">${h(v.announcement.title)}</h3>
          <div class="announcement-message markdown-content" id="announcementMessage">
            ${nl2br(v.announcement.message)}
          </div>
        </div>
      </div>

      <!-- Featured Image & Info Showcase -->
      <div class="showcase-banner" id="showcaseSection" style="${v.secVis.showcase !== false ? '' : 'display: none !important;'}">
        <div class="announcement-header">
          <div class="announcement-badge" style="color: #6ee7b7; background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.35);">
            <i class="fa-solid fa-qrcode"></i> Info QR Code
          </div>
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            <button type="button" class="btn btn-secondary btn-icon admin-only" id="btnToggleShowcaseVisibility" style="width: 30px; height: 30px; font-size: 0.75rem;" title="Papar / Sembunyi Lajur Kanan">
              <i class="fa-solid fa-eye" id="iconShowcaseVisibility"></i>
            </button>
            <button type="button" class="btn btn-secondary btn-icon admin-only" id="btnEditShowcase" style="width: 30px; height: 30px; font-size: 0.75rem;" title="Kemaskini Info QR Code">
              <i class="fa-solid fa-pen"></i>
            </button>
          </div>
        </div>
        <div class="showcase-content">
          <div class="showcase-image-box" id="showcaseImageBox" style="${v.showcase.image ? '' : 'display: none;'}">
            <img src="${h(v.showcase.image)}" alt="Info Gambar" id="showcaseImage" class="showcase-image">
          </div>
          <div class="showcase-details">
            <h3 class="announcement-title" id="showcaseTitle">${h(v.showcase.title)}</h3>
            <div class="announcement-message markdown-content" id="showcaseDescription">
              ${nl2br(v.showcase.description)}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Top Key Metrics Cards -->
    <section class="metrics-grid" id="metricsSection" style="${v.secVis.metrics !== false ? '' : 'display: none !important;'}">
      
      <!-- 1. Jumlah Kutipan Terkini Card -->
      <div class="stat-card emerald" id="statTotalCollectedCard">
        <div class="stat-card-header">
          <span class="stat-label">Jumlah Kutipan Terkini</span>
          <div class="stat-icon-wrapper">
            <i class="fa-solid fa-sack-dollar"></i>
          </div>
        </div>
        <div class="stat-value" id="statTotalCollected">${v.money(v.totals.total_collected)}</div>
        <div class="stat-subtext">
          <span class="trend-pill" id="statPercentPill">Kutipan</span>
          <span>Jumlah sumbangan diterima</span>
        </div>
      </div>

      <!-- 2. Jumlah Perbelanjaan Terkini Card -->
      <div class="stat-card purple" id="statTotalExpensesCard">
        <div class="stat-card-header">
          <span class="stat-label">Jumlah Perbelanjaan Terkini</span>
          <div class="stat-icon-wrapper" style="color: #c084fc; background: rgba(192, 132, 252, 0.15);">
            <i class="fa-solid fa-cart-shopping"></i>
          </div>
        </div>
        <div class="stat-value" id="statTotalExpenses" style="color: #e9d5ff;">${v.money(v.totals.total_expenses)}</div>
        <div class="stat-subtext">
          <span class="trend-pill" style="background: rgba(192, 132, 252, 0.15); color: #c084fc; border-color: rgba(192, 132, 252, 0.3);">Perbelanjaan</span>
          <span>Jumlah barangan &amp; kos dibeli</span>
        </div>
      </div>

      <!-- 3. Baki Card -->
      <div class="stat-card ${v.totals.baki >= 0 ? 'gold' : 'surplus'}" id="statBakiCard">
        <div class="stat-card-header">
          <span class="stat-label" id="statBakiLabel">Baki</span>
          <div class="stat-icon-wrapper" id="statBakiIcon">
            <i class="fa-solid fa-wallet"></i>
          </div>
        </div>
        <div class="stat-value" id="statBakiSemasa">${v.money(v.totals.baki)}</div>
        <div class="stat-subtext" id="statBakiSubtext">
          <span class="trend-pill" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border-color: rgba(245, 158, 11, 0.3);">Baki Tabung</span>
          <span>Baki dana sedia ada</span>
        </div>
      </div>

    </section>

    <!-- Overall Progress Banner -->
    <section class="overall-progress-box" id="overallProgressBox" style="${v.secVis.progress !== false && v.totals.has_target ? '' : 'display: none !important;'}">
      <div class="progress-header">
        <div class="progress-title-group">
          <h2>Status Kemajuan Kutipan</h2>
          <p>Status semasa tabung sumbangan pantry</p>
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
          <div class="progress-stats-num" id="progressStatsText">
            ${v.progressText}
          </div>
          <button class="btn btn-whatsapp admin-only" id="btnExportWhatsappProgress" style="font-size: 0.8rem; padding: 0.4rem 0.85rem;" title="Eksport Ke WhatsApp">
            <i class="fa-brands fa-whatsapp"></i> Eksport
          </button>
        </div>
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="overallProgressBar" style="width: ${v.totals.percent_complete}%;"></div>
      </div>
    </section>

    <!-- Items to Buy Grid Section (Hidden when no target items to buy) -->
    <section class="items-section" id="itemsSection" style="${v.secVis.items !== false && v.itemCount > 0 ? '' : 'display: none !important;'}">
      <div class="section-header">
        <div class="section-title">
          <i class="fa-solid fa-boxes-stacked"></i> Senarai Barangan Untuk Dibeli
        </div>
        <div>
          <button class="btn btn-success admin-only" id="btnAdminAddAmount">
            <i class="fa-solid fa-plus-circle"></i> Tambah Jumlah
          </button>
          <button class="btn btn-secondary admin-only" id="btnAdminAddItem" style="margin-left: 0.5rem;">
            <i class="fa-solid fa-cart-plus"></i> Barang Baharu
          </button>
        </div>
      </div>

      <div class="items-grid" id="itemsGridContainer">
        <!-- Rendered dynamically via JavaScript & synced with server -->
      </div>
    </section>

    <!-- Public Expenses & Receipt Records Section (Always Publicly Visible) -->
    <section class="expenses-section" id="expensesPublicSection" style="${v.secVis.expenses !== false ? '' : 'display: none !important;'} margin-top: 2.5rem;">
      <div class="section-header">
        <div class="section-title">
          <i class="fa-solid fa-receipt" style="color: #c084fc;"></i> Rekod Perbelanjaan &amp; Resit Pantry
        </div>
        <div>
          <button class="btn btn-success admin-only" id="btnAdminAddExpense">
            <i class="fa-solid fa-cart-plus"></i> Tambah Perbelanjaan
          </button>
        </div>
      </div>

      <div id="expensesGridContainer">
        <!-- Rendered dynamically as a responsive data table via JavaScript -->
      </div>
    </section>

    <!-- Giver Coins Visual Showcase Section (Bottom) -->
    <section class="coins-showcase-section" id="coinsShowcaseSection" style="${v.secVis.coins !== false && (v.totals.total_collected > 0 || v.contributionCount > 0) ? '' : 'display: none !important;'} margin-top: 2rem; margin-bottom: 2rem;">
      <div class="coins-grid-container" id="coinsGridContainer">
        <!-- Rendered dynamically as coin tokens via JavaScript -->
      </div>
    </section>

    <!-- Admin Giver Report Section (Only visible in Admin Mode) -->
    <section class="table-section admin-only" id="adminGiverReportSection" style="${v.secVis.admin_report !== false ? '' : 'display: none !important;'} margin-top: 2.5rem;">
      <div class="section-header">
        <div class="section-title">
          <i class="fa-solid fa-user-shield" style="color: var(--color-success);"></i> Laporan Penyumbang (<span id="countPaidGiversReport">0</span> Penyumbang)
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
          <!-- Shown by app.js only when the ledger is empty and a backup exists.
               Restoring used to happen implicitly on every page load. -->
          <button type="button" class="btn btn-secondary" id="btnRestoreContributions" style="display: none;" title="Pulihkan rekod sumbangan daripada jadual sandaran">
            <i class="fa-solid fa-clock-rotate-left"></i> Pulihkan Sandaran (<span id="restoreBackupCount">0</span>)
          </button>
          <button type="button" class="btn btn-secondary" id="btnExportGiversCsv"><i class="fa-solid fa-file-csv"></i> Eksport CSV</button>
        </div>
      </div>

      <div class="table-card">
        <div class="table-toolbar" style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; justify-content: space-between;">
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; flex: 1; max-width: 600px;">
            <div class="search-box" style="flex: 1; min-width: 200px;">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" class="search-input" id="giverSearchInput" placeholder="Cari nama staf atau ID pengguna...">
            </div>
            <div class="sort-box" style="display: flex; align-items: center; gap: 0.4rem;">
              <label for="giverDateSortSelect" style="font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap; display: flex; align-items: center; gap: 0.3rem;">
                <i class="fa-solid fa-sort"></i> Susunan:
              </label>
              <select id="giverDateSortSelect" class="form-control" style="padding: 0.55rem 0.75rem; font-size: 0.825rem; border-radius: var(--radius-md); background: rgba(255, 255, 255, 0.05); color: var(--text-primary); border: 1px solid var(--border-glass); cursor: pointer; outline: none; width: auto;">
                <option value="newest" style="background: var(--bg-card); color: var(--text-primary);">Terbaharu (Baru &rarr; Lama)</option>
                <option value="oldest" style="background: var(--bg-card); color: var(--text-primary);">Terlama (Lama &rarr; Baru)</option>
              </select>
            </div>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); white-space: nowrap;">
            Menunjukkan <strong id="visibleGiversCount" style="color: var(--text-primary);">0</strong> rekod transaksi
          </div>
        </div>

        <div class="table-container" style="max-height: 420px; overflow-y: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nama Staf</th>
                <th>Jumlah Disumbang</th>
                <th id="thGiverDate" style="cursor: pointer; user-select: none;" title="Klik untuk tukar susunan tarikh">
                  Tarikh Sumbangan <i id="sortIconGiverDate" class="fa-solid fa-arrow-down-short-wide" style="font-size: 0.75rem; margin-left: 0.25rem; color: var(--accent-primary);"></i>
                </th>
                <th style="width: 80px; text-align: center;">Tindakan</th>
              </tr>
            </thead>
            <tbody id="adminGiverReportTableBody">
              <!-- Rendered dynamically -->
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Admin Staff Directory Management Section (Only visible in Admin Mode) -->
    <section class="table-section admin-only" id="adminStaffSection" style="${v.secVis.admin_staff !== false ? '' : 'display: none !important;'} margin-top: 2.5rem;">
      <div class="section-header">
        <div class="section-title">
          <i class="fa-solid fa-users-gear" style="color: var(--accent-primary);"></i> Pengurusan Staf (<span id="adminStaffTotalCount">0</span> Staf)
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
          <button type="button" class="btn btn-primary" id="btnOpenAddStaffModal"><i class="fa-solid fa-user-plus"></i> Tambah Staf Baharu</button>
        </div>
      </div>

      <div class="table-card">
        <div class="table-toolbar" style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; justify-content: space-between;">
          <div class="search-box" style="flex: 1; max-width: 400px;">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" class="search-input" id="adminStaffSearchInput" placeholder="Cari nama staf...">
          </div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); white-space: nowrap;">
            Menunjukkan <strong id="adminStaffVisibleCount" style="color: var(--text-primary);">0</strong> daripada <strong id="adminStaffTotalCountSub" style="color: var(--accent-primary);">0</strong> staf
          </div>
        </div>

        <div class="table-container" style="max-height: 480px; overflow-y: auto;">
          <table class="data-table staff-table">
            <thead>
              <tr>
                <th class="staff-idx">#</th>
                <th>Nama Staf</th>
                <th style="text-align: right;">Tindakan</th>
              </tr>
            </thead>
            <tbody id="adminStaffTableBody">
              <!-- Rendered dynamically via JavaScript -->
            </tbody>
          </table>
        </div>
      </div>
    </section>

  </div>

  <!-- ==================== MODALS ==================== -->

  <!-- Modal: Admin Login (local accounts) -->
  <div class="modal-overlay" id="modalAdminLogin">
    <div class="modal-card" style="max-width: 440px;">
      <div class="modal-header">
        <div class="modal-title"><i class="fa-solid fa-user-shield" style="color: var(--accent-primary);"></i> Log Masuk Pentadbir</div>
        <button class="modal-close" data-close="modalAdminLogin"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="formAdminLogin">
        <div class="modal-body">
          <div class="form-group">
            <input type="text" id="inputStaffUsername" class="form-control" placeholder="Nama Pengguna" autocomplete="username" required autofocus>
          </div>
          <div class="form-group">
            <input type="password" id="inputStaffPassword" class="form-control" placeholder="Kata Laluan" autocomplete="current-password" required>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label for="inputRememberMe" style="display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem; color: var(--text-muted);">
              <input type="checkbox" id="inputRememberMe">
              Ingat saya selama 30 hari
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close="modalAdminLogin">Batal</button>
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-right-to-bracket"></i> Log Masuk</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal: Edit Announcement (Admin) -->
  <div class="modal-overlay" id="modalEditAnnouncement">
    <div class="modal-card" style="max-width: 480px;">
      <div class="modal-header">
        <div class="modal-title"><i class="fa-solid fa-bullhorn" style="color: var(--accent-primary);"></i> Kemaskini Pengumuman</div>
        <button class="modal-close" data-close="modalEditAnnouncement"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="formEditAnnouncement">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label" for="inputAnnouncementTitle">Tajuk Pengumuman *</label>
            <input type="text" id="inputAnnouncementTitle" class="form-control" placeholder="cth. Kutipan Barangan Dapur Mula Dibuka!" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="inputAnnouncementMessage">Mesej Pengumuman (Format Markdown Disokong) *</label>
            <textarea id="inputAnnouncementMessage" class="form-control" rows="4" placeholder="Tulis mesej pengumuman... (Disokong **tebal**, *senget*, - senarai, [pautan](url))" required></textarea>
            <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem;">Format Markdown dibenarkan (cth. <code>**tebal**</code>, <code>- item senarai</code>)</div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close="modalEditAnnouncement">Batal</button>
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Simpan Pengumuman</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal: Edit Showcase Info (Admin) -->
  <div class="modal-overlay" id="modalEditShowcase">
    <div class="modal-card" style="max-width: 480px;">
      <div class="modal-header">
        <div class="modal-title"><i class="fa-solid fa-qrcode" style="color: var(--color-success);"></i> Kemaskini Info QR Code</div>
        <button class="modal-close" data-close="modalEditShowcase"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="formEditShowcase">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label" for="inputShowcaseTitle">Tajuk Info *</label>
            <textarea id="inputShowcaseTitle" class="form-control" rows="2" placeholder="cth. QR Code - Ahmad Zabil Albar" required></textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="showcaseImageFile"><i class="fa-solid fa-upload"></i> Muat Naik Gambar QR Code</label>
            <input type="file" id="showcaseImageFile" class="form-control" accept="image/*">
          </div>
          <div class="form-group">
            <label class="form-label" for="inputShowcaseImageUrl">Atau URL Gambar QR Code</label>
            <input type="text" id="inputShowcaseImageUrl" class="form-control" placeholder="https://... atau uploads/qrcode.jpg">
          </div>
          <div id="showcaseImagePreviewBox" style="display: none; margin-bottom: 1rem; text-align: center; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: var(--radius-md);">
            <img id="showcaseImagePreview" src="" alt="Pratonton" style="max-height: 120px; border-radius: 8px; object-fit: cover;">
          </div>
          <div class="form-group" style="display: flex; align-items: center; gap: 0.65rem; background: rgba(255,255,255,0.03); padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-glass); margin-bottom: 1rem;">
            <input type="checkbox" id="inputShowcaseVisible" style="width: 18px; height: 18px; cursor: pointer;">
            <label for="inputShowcaseVisible" style="font-size: 0.9rem; font-weight: 600; cursor: pointer; margin: 0; color: var(--text-primary);">
              Paparkan Lajur Kanan (Info QR Code)
            </label>
          </div>
          <div class="form-group">
            <label class="form-label" for="inputShowcaseDescription">Keterangan (Format Markdown Disokong) *</label>
            <textarea id="inputShowcaseDescription" class="form-control" rows="4" placeholder="Keterangan..." required></textarea>
            <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem;">Format Markdown dibenarkan (cth. <code>**tebal**</code>, <code>- item senarai</code>)</div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close="modalEditShowcase">Batal</button>
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Simpan Info</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal: Add Collection Amount -->
  <div class="modal-overlay" id="modalAddAmount">
    <div class="modal-card" style="max-width: 480px;">
      <div class="modal-header">
        <div class="modal-title"><i class="fa-solid fa-circle-plus" style="color: var(--color-success);"></i> Tambah Jumlah Kutipan</div>
        <button class="modal-close" data-close="modalAddAmount"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="formAddAmount">
        <div class="modal-body">
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div class="form-group">
              <label class="form-label" for="searchStaffInput">
                <i class="fa-solid fa-magnifying-glass" style="color: var(--accent-primary);"></i> Cari Staf UUM IT
              </label>
              <div class="search-box">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="searchStaffInput" class="search-input" placeholder="Cari nama atau ID..." autocomplete="off">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="selectStaffName">
                Pilih Ahli Staf (<span id="staffFilteredCount" style="color: var(--accent-primary); font-weight: 800;">0</span>)
              </label>
              <select id="selectStaffName" class="form-control">
                <option value="">-- Pilih Ahli Staf UUM IT --</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="inputCustomGiverName">Atau Masukkan Nama Lain (Penyumbang Luar / Bukan Staf)</label>
            <input type="text" id="inputCustomGiverName" class="form-control" placeholder="cth. Ahmad Bin Ali, Hamba Allah, Tetamu Luar...">
            <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem;">Gunakan ini jika penyumbang tidak tersenarai dalam direktori staf.</div>
          </div>

          <div class="form-group">
            <label class="form-label" for="inputCollectionAmount">Jumlah Kutipan (<span class="currency-label">RM</span>) *</label>
            <input type="number" id="inputCollectionAmount" class="form-control" placeholder="0.00" step="0.01" min="0.01" required>
          </div>

          <div class="form-group">
            <label class="form-label" for="inputCollectionDate">Tarikh & Masa Sumbangan *</label>
            <input type="datetime-local" id="inputCollectionDate" class="form-control" required>
          </div>

        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close="modalAddAmount">Batal</button>
          <button type="submit" class="btn btn-success"><i class="fa-solid fa-check"></i> Tambah ke Jumlah</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal: Add / Edit Item (Admin) -->
  <div class="modal-overlay" id="modalAddItem">
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title"><i class="fa-solid fa-box-open" style="color: var(--accent-secondary);"></i> <span id="itemModalHeading">Tambah Barangan Baharu</span></div>
        <button class="modal-close" data-close="modalAddItem"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="formAddItem">
        <input type="hidden" id="editItemId" value="">
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="itemName">Nama Barangan *</label>
              <input type="text" id="itemName" class="form-control" placeholder="cth. Kerusi Pejabat Ergonomik" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="itemTargetPrice">Harga Seunit (<span class="currency-label">RM</span>) *</label>
              <input type="number" id="itemTargetPrice" class="form-control" placeholder="500.00" step="0.01" min="1" required>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <!-- Quantity multiplies the target price in every total, but the form
                   never exposed it, so it was stuck at 1 for anything added here. -->
              <label class="form-label" for="itemQuantity">Kuantiti *</label>
              <input type="number" id="itemQuantity" class="form-control" placeholder="1" step="1" min="1" value="1" required>
            </div>
            <div class="form-group">
              <!-- This field was read by app.js but never existed in the markup, so
                   every edit silently reset the item's category to "Umum". -->
              <label class="form-label" for="itemCategory">Kategori</label>
              <input type="text" id="itemCategory" class="form-control" placeholder="cth. Peralatan Dapur">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="itemImageFile"><i class="fa-solid fa-upload"></i> Muat Naik Gambar Barangan (Boleh pilih beberapa gambar)</label>
            <input type="file" id="itemImageFile" class="form-control" accept="image/*" multiple>
          </div>

          <div class="form-group">
            <label class="form-label" for="itemImageUrl">Atau URL Gambar (Pisahkan dengan koma jika lebih daripada 1)</label>
            <input type="text" id="itemImageUrl" class="form-control" placeholder="uploads/img1.jpg, uploads/img2.jpg">
          </div>

          <div class="form-group" id="itemMediaManagerGroup" style="margin-bottom: 1.25rem;">
            <label class="form-label" style="display: flex; justify-content: space-between; align-items: center;">
              <span><i class="fa-solid fa-photo-film"></i> Pengurusan Media Barangan</span>
              <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400;" id="itemMediaCountLabel">0 gambar</span>
            </label>
            <div id="itemMediaThumbnailsGrid" class="media-thumbnails-grid">
              <!-- Dynamically rendered media thumbnails with delete controls -->
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="itemIcon">Kelas Ikon FontAwesome</label>
            <input type="text" id="itemIcon" class="form-control" placeholder="cth. fa-chair, fa-mug-hot, fa-tv" value="fa-box">
          </div>

          <div class="form-group">
            <label class="form-label" for="itemDescription">Keterangan (Format Markdown Disokong)</label>
            <textarea id="itemDescription" class="form-control" rows="3" placeholder="Butiran barangan... (Disokong **tebal**, *senget*, - senarai)"></textarea>
            <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem;">Format Markdown dibenarkan (cth. <code>**tebal**</code>, <code>- item senarai</code>)</div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close="modalAddItem">Batal</button>
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Simpan Barangan</button>
        </div>
      </form>
    </div>
  </div>



  <!-- Modal: Export Summary as Image for WhatsApp -->
  <div class="modal-overlay" id="modalExportWhatsapp">
    <div class="modal-card" style="max-width: 680px; width: 95%; max-height: 90vh; overflow-y: auto;">
      <div class="modal-header">
        <div class="modal-title">
          <i class="fa-brands fa-whatsapp" style="color: #25D366; font-size: 1.3rem;"></i> Eksport Ringkasan Kutipan (WhatsApp)
        </div>
        <button class="modal-close" data-close="modalExportWhatsapp"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="display: flex; flex-direction: column; gap: 1.25rem;">
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">
          Pratonton kad grafik ringkasan terkini. Anda boleh memuat turun gambar poster (PNG) ini untuk dikongsi ke WhatsApp.
        </p>

        <!-- Live Poster Preview Box -->
        <div class="whatsapp-poster-wrapper">
          <div class="whatsapp-poster-scaler">
            <div class="whatsapp-poster-card" id="whatsappCardPreview">
            <!-- Header -->
            <div class="poster-header">
              <div class="poster-brand">
                <div class="poster-logo"><i class="fa-solid fa-hand-holding-dollar"></i></div>
                <div>
                  <h2 class="poster-title" id="posterAppTitle">${h(v.displayTitle)}</h2>
                  <div class="poster-subtitle" id="posterAppSubtitle">Sumbangan &amp; Perbelanjaan Pantry</div>
                </div>
              </div>
              <div class="poster-badge" id="posterStatusBadge">
                <i class="fa-solid fa-chart-line"></i> <span>Kemajuan Kutipan</span>
              </div>
            </div>

            <!-- Main Stat Grid -->
            <div class="poster-metrics-grid" id="posterMetricsGrid">
              <div class="poster-stat-box emerald">
                <div class="poster-stat-label">Jumlah Kutipan</div>
                <div class="poster-stat-val" id="posterTotalCollected">${v.money(v.totals.total_collected)}</div>
                <div class="poster-stat-sub" id="posterPercentText">Sumbangan Diterima</div>
              </div>

              <div class="poster-stat-box purple" id="posterTotalExpensesBox">
                <div class="poster-stat-label">Jumlah Perbelanjaan</div>
                <div class="poster-stat-val" id="posterTotalExpenses">${v.money(v.totals.total_expenses)}</div>
                <div class="poster-stat-sub" style="color: #c084fc;">Perbelanjaan &amp; barang</div>
              </div>

              <div class="poster-stat-box ${v.totals.baki >= 0 ? 'gold' : 'surplus'}" id="posterBakiCard">
                <div class="poster-stat-label" id="posterBakiLabel">Baki Tabung</div>
                <div class="poster-stat-val" id="posterBakiSemasa">${v.money(v.totals.baki)}</div>
                <div class="poster-stat-sub" id="posterBakiSubtext">Baki dana sedia ada</div>
              </div>
            </div>

            <!-- Progress Bar -->
            <div class="poster-progress-section" id="posterProgressSection">
              <div class="poster-progress-header">
                <span>Status Kemajuan Keseluruhan</span>
                <span id="posterProgressPercentNum">0%</span>
              </div>
              <div class="poster-progress-track">
                <div class="poster-progress-fill" id="posterProgressBar" style="width: 0%;"></div>
              </div>
            </div>

            <!-- Items List Breakdown -->
            <div class="poster-items-section" id="posterItemsSection">
              <div class="poster-section-heading">
                <i class="fa-solid fa-boxes-stacked"></i> Senarai Barangan Sasaran
              </div>
              <div class="poster-items-grid" id="posterItemsList">
                <!-- Rendered dynamically -->
              </div>
            </div>

            <!-- QR Code Payment Info Snippet (if available) -->
            <div class="poster-qr-section" id="posterQrSection" style="display: none;">
              <div class="poster-qr-image-box">
                <img id="posterQrImg" src="" alt="QR Payment">
              </div>
              <div class="poster-qr-info">
                <div class="poster-qr-title" id="posterQrTitle">QR Code &bull; Ahmad Zabil Albar</div>
                <div class="poster-qr-desc" id="posterQrDesc">
                  Mohon maklumkan kepada saya setelah selesai transaksi.
                  <div style="color: #6ee7b7; font-weight: 700; margin-top: 0.25rem;">Terima Kasih</div>
                </div>
              </div>
            </div>

            <!-- Poster Footer Watermark.
                 This used to link to the remote host the app was deployed to.
                 The app is local-only now, so that URL is dead and a poster
                 shared on WhatsApp would carry a broken link. Shows the
                 collection name instead; set poster_footer in \`settings\` to
                 print something else (e.g. a URL) here. -->
            <div class="poster-footer">
              <div id="posterFooterNote" style="color: #94a3b8; font-weight: 600;">
                <i class="fa-solid fa-hand-holding-dollar" style="margin-right: 4px;"></i>${h(v.posterFooter)}
              </div>
              <div id="posterTimestamp">2026-08-18</div>
            </div>
          </div>
        </div>
      </div>
      </div>

      <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <button type="button" class="btn btn-secondary" data-close="modalExportWhatsapp">Tutup</button>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary" id="btnCopyWhatsappCard" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #e2e8f0;">
            <i class="fa-regular fa-copy"></i> Salin Gambar
          </button>
          <button type="button" class="btn btn-primary" id="btnDownloadWhatsappCard" style="background: var(--gradient-emerald); border: none;">
            <i class="fa-solid fa-download"></i> Muat Turun Gambar (PNG)
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Urus & Senarai Acara / Senaman Kutipan -->
  <div class="modal-overlay" id="modalManageEvents">
    <div class="modal-card" style="max-width: 680px;">
      <div class="modal-header">
        <div class="modal-title"><i class="fa-solid fa-layer-group" style="color: var(--accent-primary);"></i> Acara & Rekod Kutipan</div>
        <button class="modal-close" data-close="modalManageEvents"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body">
        <p style="margin: 0 0 1rem; font-size: 0.875rem; color: var(--text-secondary);">
          Butiran acara kutipan. Tekan <strong>Sunting</strong> untuk menukar tajuk atau keterangan.
        </p>

        <div class="events-list-container" id="eventsListContainer" style="max-height: 380px; overflow-y: auto;">
          <!-- Rendered dynamically -->
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-close="modalManageEvents">Tutup</button>
      </div>
    </div>
  </div>

  <!-- Modal: Sunting Maklumat Acara (Admin) -->
  <div class="modal-overlay" id="modalEditEvent">
    <div class="modal-card" style="max-width: 500px;">
      <div class="modal-header">
        <div class="modal-title"><i class="fa-solid fa-pen-to-square" style="color: var(--accent-primary);"></i> Sunting Maklumat Acara</div>
        <button class="modal-close" data-close="modalEditEvent"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="formEditEvent">
        <input type="hidden" id="inputEditEventId">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label" for="inputEditEventTitle">Tajuk Acara / Senaman Kutipan *</label>
            <input type="text" id="inputEditEventTitle" class="form-control" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="inputEditEventDesc">Keterangan / Catatan Acara</label>
            <textarea id="inputEditEventDesc" class="form-control" rows="3" placeholder="Tulis catatan ringkas tentang acara ini..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close="modalEditEvent">Batal</button>
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal: Tambah Rekod Perbelanjaan (Admin) -->
  <div class="modal-overlay" id="modalAddExpense">
    <div class="modal-card" style="max-width: 520px;">
      <div class="modal-header">
        <div class="modal-title"><i class="fa-solid fa-cart-plus" style="color: #c084fc;"></i> Rekod Perbelanjaan Baharu</div>
        <button class="modal-close" data-close="modalAddExpense"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="formAddExpense">
        <input type="hidden" id="inputExpenseId" value="">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label" for="inputExpenseTitle">Tajuk / Barang Dibeli *</label>
            <input type="text" id="inputExpenseTitle" class="form-control" placeholder="cth. Pembelian Refill Sabun Dapur &amp; Tisu" required>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div class="form-group">
              <label class="form-label" for="inputExpenseAmount">Jumlah (RM) *</label>
              <input type="number" step="0.01" min="0.01" id="inputExpenseAmount" class="form-control" placeholder="0.00" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="inputExpenseDate">Tarikh Perbelanjaan *</label>
              <input type="date" id="inputExpenseDate" class="form-control" value="${v.today}" required>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="inputExpenseCategory">Kategori Perbelanjaan
              <button type="button" class="btn btn-secondary" data-action="manage-expense-categories" style="padding: 0.1rem 0.5rem; font-size: 0.7rem; margin-left: 0.4rem;" title="Urus senarai kategori">
                <i class="fa-solid fa-gear"></i> Urus
              </button>
            </label>
            <select id="inputExpenseCategory" class="form-control">
${v.categoryOptions}
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div class="form-group">
              <label class="form-label" for="searchExpenseStaffInput">
                <i class="fa-solid fa-magnifying-glass" style="color: #c084fc;"></i> Cari Staf Pembeli
              </label>
              <div class="search-box">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="searchExpenseStaffInput" class="search-input" placeholder="Cari nama atau ID..." autocomplete="off">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="inputExpenseStaff">
                Pilih Staf Pembeli (<span id="expenseStaffFilteredCount" style="color: #c084fc; font-weight: 800;">0</span>)
              </label>
              <select id="inputExpenseStaff" class="form-control">
                <option value="">-- Pilih Ahli Staf (Pilihan) --</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Gambar Resit / Bukti Pembelian (Pilihan)</label>
            <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
              <input type="text" id="inputExpenseImage" class="form-control" placeholder="uploads/... atau URL gambar resit" style="flex: 1; min-width: 180px;">
              <button type="button" class="btn btn-secondary" id="btnUploadExpenseReceipt" style="white-space: nowrap;">
                <i class="fa-solid fa-upload"></i> Muat Naik
              </button>
              <input type="file" id="fileInputExpenseReceipt" accept="image/*" style="display: none;">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close="modalAddExpense">Batal</button>
          <button type="submit" class="btn btn-success"><i class="fa-solid fa-check"></i> Simpan Perbelanjaan</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal: Tambah / Edit Staf (Admin Only) -->
  <div class="modal-overlay" id="modalAddEditStaff">
    <div class="modal-card" style="max-width: 480px;">
      <div class="modal-header">
        <div class="modal-title" id="modalStaffTitle"><i class="fa-solid fa-user-pen" style="color: var(--accent-primary);"></i> Tambah Staf Baharu</div>
        <button class="modal-close" data-close="modalAddEditStaff"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="formAddEditStaff">
        <input type="hidden" id="staffEditId" value="">
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 1.2rem;">
          <div>
            <label class="form-label" for="inputStaffName">Nama Staf *</label>
            <input type="text" id="inputStaffName" class="form-control" placeholder="Contoh: AHMAD ZABIL ALBAR" required autocomplete="off">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close="modalAddEditStaff">Batal</button>
          <button type="submit" class="btn btn-success" id="btnSaveStaff"><i class="fa-solid fa-check"></i> Simpan Staf</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal: Tetapan Paparan Seksyen (Show/Hide Sections) -->
  <div class="modal-overlay" id="modalSectionVisibility">
    <div class="modal-card" style="max-width: 520px;">
      <div class="modal-header">
        <div class="modal-title"><i class="fa-solid fa-sliders" style="color: var(--accent-primary);"></i> Tetapan Paparan Seksyen</div>
        <button class="modal-close" data-close="modalSectionVisibility"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="display: flex; flex-direction: column; gap: 1rem;">
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
          Tandakan atau nyah-tandakan seksyen yang ingin dipaparkan pada halaman utama.
        </p>

        <div class="section-toggle-list" style="display: flex; flex-direction: column; gap: 0.6rem; max-height: 380px; overflow-y: auto; padding-right: 0.25rem;">
          <label class="section-toggle-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s ease;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <i class="fa-solid fa-bullhorn" style="color: var(--accent-primary); width: 20px; text-align: center;"></i>
              <div>
                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Pengumuman Utama</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Banner mesej &amp; pengumuman terkini</div>
              </div>
            </div>
            <input type="checkbox" id="secToggle_announcement" class="toggle-checkbox" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-primary);">
          </label>

          <label class="section-toggle-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s ease;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <i class="fa-solid fa-qrcode" style="color: #6ee7b7; width: 20px; text-align: center;"></i>
              <div>
                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Info Showcase / QR Code</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Gambar &amp; maklumat QR pembayaran</div>
              </div>
            </div>
            <input type="checkbox" id="secToggle_showcase" class="toggle-checkbox" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-primary);">
          </label>

          <label class="section-toggle-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s ease;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <i class="fa-solid fa-chart-simple" style="color: #38bdf8; width: 20px; text-align: center;"></i>
              <div>
                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Kad Metrik Utama</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Ringkasan Kutipan, Perbelanjaan &amp; Baki</div>
              </div>
            </div>
            <input type="checkbox" id="secToggle_metrics" class="toggle-checkbox" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-primary);">
          </label>

          <label class="section-toggle-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s ease;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <i class="fa-solid fa-bars-progress" style="color: #f59e0b; width: 20px; text-align: center;"></i>
              <div>
                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Status Kemajuan Kutipan</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Bar kemajuan sasaran dana (%)</div>
              </div>
            </div>
            <input type="checkbox" id="secToggle_progress" class="toggle-checkbox" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-primary);">
          </label>

          <label class="section-toggle-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s ease;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <i class="fa-solid fa-boxes-stacked" style="color: #a855f7; width: 20px; text-align: center;"></i>
              <div>
                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Senarai Barangan Dibeli</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Kad sasaran peralatan &amp; peranti</div>
              </div>
            </div>
            <input type="checkbox" id="secToggle_items" class="toggle-checkbox" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-primary);">
          </label>

          <label class="section-toggle-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s ease;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <i class="fa-solid fa-receipt" style="color: #c084fc; width: 20px; text-align: center;"></i>
              <div>
                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Rekod Perbelanjaan &amp; Resit</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Jadual transaksi pembelian &amp; resit</div>
              </div>
            </div>
            <input type="checkbox" id="secToggle_expenses" class="toggle-checkbox" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-primary);">
          </label>

          <label class="section-toggle-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s ease;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <i class="fa-solid fa-coins" style="color: #fbbf24; width: 20px; text-align: center;"></i>
              <div>
                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Visual Syiling Penyumbang</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Lencana token animasi penyumbang</div>
              </div>
            </div>
            <input type="checkbox" id="secToggle_coins" class="toggle-checkbox" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-primary);">
          </label>

          <label class="section-toggle-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s ease;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <i class="fa-solid fa-user-shield" style="color: var(--color-success); width: 20px; text-align: center;"></i>
              <div>
                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Laporan Penyumbang (Pentadbir)</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Jadual penuh giver &amp; transaksi</div>
              </div>
            </div>
            <input type="checkbox" id="secToggle_admin_report" class="toggle-checkbox" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-primary);">
          </label>

          <label class="section-toggle-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s ease;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <i class="fa-solid fa-users-gear" style="color: var(--accent-primary); width: 20px; text-align: center;"></i>
              <div>
                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Pengurusan Staf (Pentadbir)</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Direktori &amp; kawalan keahlian staf</div>
              </div>
            </div>
            <input type="checkbox" id="secToggle_admin_staff" class="toggle-checkbox" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-primary);">
          </label>
        </div>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; gap: 0.5rem;">
          <button type="button" class="btn btn-sm btn-secondary" id="btnSecToggleSelectAll">Tunjuk Semua</button>
          <button type="button" class="btn btn-sm btn-secondary" id="btnSecToggleDeselectAll">Sembunyi Semua</button>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" data-close="modalSectionVisibility">Batal</button>
          <button type="button" class="btn btn-primary" id="btnSaveSectionVisibility"><i class="fa-solid fa-check"></i> Simpan Tetapan</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Toast Notification Container -->
  <div class="toast-container" id="toastContainer"></div>

  <!-- Pre-rendered bootstrap payload (zero API roundtrips on startup).
       $initialData is passed through the same privacy filter as api.php, so a
       non-admin visitor never receives the individual contribution log. -->
  <script nonce="${h(v.nonce)}">
    window.INITIAL_STAFF = ${v.staffJson};
    window.INITIAL_DATA  = ${v.dataJson};
    window.INITIAL_AUTH  = ${v.authJson};
  </script>

  <!-- Application Logic JavaScript -->
  <script src="app.js?v=${v.version}" defer></script>

</body>
</html>
`;
}
