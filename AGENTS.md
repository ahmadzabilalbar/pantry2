# AGENTS.md — Repository Rules

Architecture, security rules and constraints for anyone (human or AI) working
on **Pantry 2**, the Vercel + Google Sheets version of the staff pantry fund
tracker. Setup is in `README.md`.

---

## Architecture

1. **Entry points** (routed by `vercel.json`)
   - `api/page.js` serves `/`. It server-renders the metrics and admin state
     for a fast first paint, and inlines the privacy-filtered dataset as
     `window.INITIAL_DATA`, so a normal load makes zero API calls. The markup
     is in `lib/indexPage.js`.
   - There is no separate report page. `/laporan` (the old printable
     report) is a permanent redirect to `/` in `vercel.json`, so links
     already shared keep working. The WhatsApp share button links to `/`.
   - `api/pantry.js` is the JSON API at `/api.php?action=...` (the old URL, so
     `app.js` didn't change). It handles session checks, logout, uploads and
     every write.
   - `api/auth.js` is Google sign-in: `/auth/google` redirects to Google, and
     `/auth/google/callback` comes back to `/?login=<result>`. The flow
     itself is in `lib/auth.js`.
   - Static files live in `public/`. Do not add static `.html` pages for
     application routing.

2. **Styling**: `public/styles.css`, vanilla CSS with the existing design
   tokens. No frameworks unless asked. Fonts, icons and libraries are
   self-hosted in `public/vendor/`. The CSP allows `'self'` only (plus the
   Blob image host), so do not add CDN links.

3. **Frontend** (`public/app.js`): ES6+ vanilla JS with no build step.
   - **All writes go through `apiPost()`**, which attaches the CSRF token.
   - **No inline event handlers.** Use `data-action` + `DELEGATED_ACTIONS`.
   - Escape every interpolated value with `escapeHtml()`. Run Markdown
     through `sanitizeHtml()`.
   - Image uploads go through `apiPost()` with a FormData `image`.
     `compressImageForUpload()` shrinks them (1000 px, WebP 0.6) and sends
     the raw bytes.

4. **Data**: one Google Sheet, one tab per table. The column list is
   `TABLES` in `lib/store.js`, and `tools/init-sheet.mjs` creates it.
   - Columns are mapped **by header name**. To add a column, add it to
     `TABLES` and add its header to the live sheet: run `npm run sheet:init`
     for new tabs, or type the header by hand.
   - Values are written as typed cells / `RAW`, never `USER_ENTERED`, so user
     text can never become a formula. Keep it that way.
   - Ids are `newId()` integers: time-based, below 2^53. There is no
     auto-increment.
   - Reads go through `loadTables()`: one `batchGet` for every tab. Public
     reads use a 15 s per-instance cache, because the Sheets quota (~60
     reads/min) is shared by every visitor. Admin reads and reads before a
     write use `fresh: true`. Do not add per-row or per-tab reads in a loop.
   - Images live in Vercel Blob (`uploads/item_<time>_<rand>.<ext>`).

---

## Security rules

1. **Nothing secret in the repository.** Every secret is a Vercel environment
   variable: the service-account key, the Google OAuth client id/secret,
   `SESSION_SECRET` and the Blob token. Locally they live in
   `.env.local`, which is git-ignored. `migration/` (real staff data) is
   git-ignored too.

2. **`lib/auth.js` is the single source of truth** for sessions, the admin
   rule, Google sign-in, session lifetime, CSRF and the CSP. Never
   re-implement any of these inline.
   - Admin is granted by **exact** email match against `ADMIN_EMAILS`
     (`ahmadzabilalbar@gmail.com`), compared lower-cased. Never match on a
     substring. Only those emails can sign in at all.
   - Sessions are an HMAC-signed cookie. Lifetime is idle 1 h / absolute 12 h,
     or 30 days with "Ingat saya". Removing the email from `ADMIN_EMAILS` or
     a new `SESSION_SECRET` ends them.

3. **Every POST is guarded twice**: `verifyCsrf()` first, then
   `isAdminSession()`. `logout` is exempt from the admin check only, never
   from CSRF.

4. **Logins** are Google sign-in only (OAuth authorization code + PKCE). There
   are no passwords. `finishGoogleLogin()` requires:
   - a matching one-time `state` from the signed `pantry_oauth` cookie;
   - an ID token from Google's token endpoint with the right `iss`, `aud`
     and `exp`;
   - `email_verified`;
   - an email in `ADMIN_EMAILS`.

   Never add a password login, and never trust an email the browser sends.

5. **Privacy split.** `buildPublicPayload()` in `lib/store.js` is the **only**
   place that decides what is public. For non-admins it:
   - anonymises `giver_coins`;
   - empties `contributions` and `events`;
   - cuts expense `staff_name` to the given name (`publicGivenName()`);
   - drops the backup count.

   **Any new field that carries giver identity must be stripped there too.**
   The staff directory (`get_staff`, `INITIAL_STAFF`) is admin-only.

6. **Uploads** are identified by their bytes (`sniffImage()`), not the client's
   name or type, capped at 4 MB, and stored under a random name.

7. **The Google Sheet is private data.** Share it only with the service account
   and people who may see the full ledger.

---

## Data-writing rules

These carry over fixes from the MySQL version. Do not undo them.

- **Never rewrite a whole tab to save one row.** The bulk `POST /api.php`
  route handles settings, announcement, showcase and items only. Items are
  upserted by id and `created_at` is carried over.
- **`contributions` and `expenses` are row-level**: append, update or delete
  one row (`addContribution`, `deleteContribution`, `addExpense`,
  `updateExpense`, `deleteExpense`). `SERVER_DERIVED_KEYS` in `app.js` strips
  both from the bulk payload; keep them there.
- **A contribution and its backup row are written in one `batchUpdate`**, so
  the two tabs cannot drift.
- **A GET must never write.** Restoring the ledger is the explicit admin
  action `restore_contributions`.
- **There is one collection event.** Only its title and description are
  edited (`edit_event`, which also updates the `title` setting).
- **Totals have one definition:** `computeTotals()` in `lib/store.js`, shipped
  as `totals` and mirrored by `computeTotals()` in `app.js`.
- **Admin visibility has one switch:** the `is-admin` class on `<body>` plus the
  `.admin-only` CSS rule.

---

## Before finishing a task

- `npm test`: syntax check of every JS file, plus the end-to-end test
  (`tools/test.mjs`) of every route against the fake Sheets API. Add a case
  there for any new route or rule.
- `npm run preview` and look at it in a browser for UI changes.
- Keep `README.md` and this file current.
- The UI language is **Malay**. User-facing strings and toasts should match.
