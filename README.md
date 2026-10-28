# Pantry 2 — Vercel + Google Sheets

Live: <https://pantry-aras2.vercel.app/> (report: <https://pantry-aras2.vercel.app/laporan>)

The staff pantry fund tracker, moved off XAMPP/MySQL:

| Part | Where it runs |
|---|---|
| Pages and API | Vercel serverless functions (Node 22) |
| Data | One Google Sheet (one tab per former MySQL table) |
| Uploaded images | Vercel Blob |
| Source code | GitHub (Vercel deploys every push to `main`) |
| Secrets | Vercel environment variables (never in the repo) |

The UI (`public/app.js`, `public/styles.css`) is the same as the PHP app. Only
the server side was rewritten.

---

## Setup guide

You need about 30 minutes. Do the steps in this order.

### 1. Google Cloud: service account

The app signs in to Google as a *service account*, a robot user that only has
access to the one sheet you share with it.

1. Open <https://console.cloud.google.com/> and sign in.
2. Top bar → project picker → **New Project** → name it `pantry2` → **Create**.
   Make sure the new project is selected.
3. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.
4. **APIs & Services → Credentials → Create credentials → Service account**.
   - Name: `pantry2-app` → **Create and continue**.
   - Skip the optional role and user steps → **Done**.
5. Click the new service account → **Keys** tab → **Add key → Create new key →
   JSON → Create**. A `.json` file downloads.
   - Treat this file like a password. Don't commit it, don't email it, and
     delete it from Downloads once step 4 is done.
6. Copy the service account's email (`pantry2-app@<project>.iam.gserviceaccount.com`).
   You need it in the next step.

> If your Google Workspace (e.g. `uum.edu.my`) blocks service-account key
> creation, use a personal Gmail account for the Cloud project and the sheet.

### 1b. Google Cloud: sign-in client

Admins log in with **Sign in with Google**. There are no passwords. Only the
emails in `ADMIN_EMAILS` in `lib/auth.js` (`ahmadzabilalbar@gmail.com`)
are let in. Every other Google account is turned away.

In the same Cloud project:

1. **APIs & Services → OAuth consent screen** (Google Auth Platform) →
   **Get started**.
   - App name: `Pantry Aras 2`; support email: your Gmail.
   - Audience: **External**; contact email: your Gmail → **Create**.
2. **Audience → Test users → Add users** → `ahmadzabilalbar@gmail.com`.
   - Testing mode is fine: only the listed test users can sign in.
   - The app asks only for `openid email profile`, so no Google review is
     needed if you ever publish it.
3. **Clients → Create client → Web application**, name `pantry2-web`.
   **Authorized redirect URIs**:
   - `https://pantry-aras2.vercel.app/auth/google/callback`
   - `http://localhost:3000/auth/google/callback` (for `npm run dev`)

   Add another `https://<domain>/auth/google/callback` for any custom domain.
4. **Create**, then copy the **Client ID** and **Client secret**.

### 2. Google Sheet

1. Create a blank sheet at <https://sheets.new>. Name it, e.g., `Pantry Data`.
2. **Share** → paste the service-account email → role **Editor** → untick
   "Notify people" → **Share**.
3. Copy the sheet id from the URL:
   `https://docs.google.com/spreadsheets/d/`**`1AbC...xyz`**`/edit`.
4. Don't share the sheet with anyone else unless they should see every
   contributor's name and amount. The sheet holds the private ledger.

### 3. Local setup

```bash
cd C:/xampp/htdocs/pantry2
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Value |
|---|---|
| `GOOGLE_SHEET_ID` | the id from step 2.3 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the whole content of the downloaded JSON key, on one line |
| `GOOGLE_OAUTH_CLIENT_ID` | the Client ID from step 1b.4 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | the Client secret from step 1b.4 |
| `SESSION_SECRET` | output of `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `BLOB_READ_WRITE_TOKEN` | fill in after step 5 (only needed locally for the image import) |

Then create the tabs in the sheet:

```bash
npm run sheet:init
```

The sheet should now have the tabs `settings`, `announcement`, `showcase`,
`items`, `contributions`, `contributions_backup`, `events`, `expenses` and
`staff`, each with a header row.

### 4. GitHub

The repository can be <https://github.com/ahmadzabilalbar/pantry2>. **Make it
private.** It holds no secrets, but there's no reason to publish the admin
email or the code.

```bash
cd C:/xampp/htdocs/pantry2
git init -b main
git add .
git status            # check: no .env.local, no migration/, no node_modules/
git commit -m "Pantry 2: Vercel + Google Sheets"
git remote add origin https://github.com/ahmadzabilalbar/pantry2.git
git push -u origin main
```

`.gitignore` already excludes `.env*`, `migration/` and `node_modules/`.

### 5. Vercel

1. Sign in at <https://vercel.com> **with GitHub**.
2. **Add New… → Project** → import `ahmadzabilalbar/pantry2`. Allow Vercel
   access to that repository when GitHub asks.
3. Configure:
   - Framework Preset: **Other**
   - Root Directory: `./`
   - Build and Output Settings: leave the defaults. `vercel.json` sets
     `outputDirectory: public`.
4. **Environment Variables**: add `GOOGLE_SHEET_ID`,
   `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET` and `SESSION_SECRET` with the same values as
   `.env.local`.
5. **Deploy**.
6. After the first deploy: **Storage → Create → Blob** → name it
   `pantry2-images` → **Connect** to the project (all environments). This adds
   `BLOB_READ_WRITE_TOKEN` automatically. Copy the token into `.env.local` too.
7. **Deployments → ⋯ → Redeploy** so the new variable takes effect.
8. Optional: **Settings → Domains** to add your own domain.

Open the `*.vercel.app` URL, click the lock icon, then **Log Masuk dengan
Google**.

From now on, `git push` to `main` deploys to production automatically, and
pushes to other branches get their own preview URL.

### 6. Move the data from the old MySQL app (once)

On the XAMPP machine, with MySQL running:

```bash
cd C:/xampp/htdocs/pantry2
mkdir -p migration
php tools/export_mysql.php C:/xampp/htdocs/pantry > migration/export.json
npm run sheet:import -- migration/export.json C:/xampp/htdocs/pantry
```

The import:
- copies every table into its tab, keeping ids and `created_at`;
- uploads every `uploads/...` image to Vercel Blob and rewrites the paths to
  Blob URLs;
- refuses to overwrite tabs that already have data (pass `--force` to override).

Check the dashboard on Vercel, then **delete `migration/export.json`**. It
contains every staff name and the full ledger.

---

## Day-to-day

| Task | How |
|---|---|
| Try the UI locally without Google | `npm run preview` → <http://localhost:3000> (Google sign-in is faked and logs you straight in as admin; data is fake and in memory) |
| Run against the real sheet locally | `npx vercel link` once, then `npm run dev` (reads `.env.local`) |
| Tests | `npm test`: syntax check plus an end-to-end test of every API route against a fake Sheets API |
| Add or remove an admin | edit `ADMIN_EMAILS` in `lib/auth.js`, add the email as a test user (step 1b.2), push. A removed email's sessions end at once |
| Sign every device out | change `SESSION_SECRET` in Vercel and redeploy |
| Back up | Google Sheets keeps version history (File → Version history). For an offline copy: File → Download → `.xlsx`. Blob images: Vercel → Storage → Blob → browse/download |

**Editing the sheet by hand** is allowed: fixing a typo in a name, or adding
your own notes column. Columns are matched by header name. Keep these intact:
- the header row;
- the existing column names;
- the `id` values.

Don't type formulas into data cells.

---

## How it fits together

```
browser ──► Vercel edge
             ├─ /, /laporan          ─► api/page.js    (server-rendered page / report)
             ├─ /api.php?action=...  ─► api/pantry.js  (JSON API, same routes as before)
             ├─ /auth/google[/callback] ─► api/auth.js (Google sign-in redirects)
             └─ /app.js, /styles.css, /vendor/…  (static, public/)
                    │
                    ├─ lib/store.js   data layer (ports of db.php)
                    ├─ lib/sheets.js  Google Sheets REST client (no SDK)
                    ├─ lib/auth.js    signed-cookie sessions, Google sign-in, CSRF, CSP
                    └─ @vercel/blob   image uploads
```

### Limits to know

- **Sheets read quota** is about 60 reads per minute for the whole app. Public
  page views are served from a 15-second in-memory cache, and stale data is
  served if Google says "slow down". Admin views always read fresh.
- **Speed.** A save takes about 1–2 s (one read plus one write to Google). The
  first request after idle adds a cold start of about 1 s.
- **Concurrent edits.** Sheets has no transactions. If two admins change the
  *same* small table (settings/items) within the same second, the later save
  wins. Contributions and expenses are row-level and safe.
- **Uploads** are compressed in the browser: at most 1000 px on the long edge,
  WebP at quality 0.6 (JPEG 0.65 as a fallback). That's typically 30–150 KB,
  and receipt text and QR codes stay legible. The server refuses anything over
  4 MB or not a real JPEG/PNG/GIF/WebP.
- **Logout** replaces this browser's cookie. Because sessions are stateless, a
  *copied* cookie stays valid until it expires (12 h, or 30 days with "Ingat
  saya"). Changing `SESSION_SECRET`, or removing the email from
  `ADMIN_EMAILS`, ends all of them.
- **Vercel Hobby** (free) is for non-commercial use, which suits an internal
  staff fund.

See `AGENTS.md` for the rules any change must follow.
