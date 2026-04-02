# Deployment & branches

## Branches

| Branch       | Role |
|-------------|------|
| **`main`**  | Production. Pushes here deploy the live site (Vercel frontend + API traffic). **Merge here only when you want a production release.** |
| **`staging`** | Integration / pre-production. Push work-in-progress here; use **Preview** deploys on Vercel without updating the production URL. |

### Suggested workflow

1. **Daily work:** branch from `staging` (or commit directly to `staging` for small changes).
   ```bash
   git checkout staging
   git pull origin staging
   git checkout -b feature/my-change   # optional
   ```
2. **Push often to `staging`** — triggers preview builds, not production.
   ```bash
   git push origin staging
   ```
3. **When ready for production:** open a PR **`staging` → `main`** (or merge locally), then merge. That merge to `main` kicks off the **production** deployment.

```bash
git checkout main && git pull origin main
git merge staging
git push origin main
```

## What deploys where

- **Frontend (Vercel):** Connected to this repo. Production = **`main`**. Other branches (e.g. **`staging`**) get **Preview** deployments (unique URLs in the Vercel dashboard).
- **API (Render):** `deepcast.onrender.com` — confirm in the Render dashboard which branch/commit triggers deploys; many teams deploy **`main`** only.

## Manual production redeploy

If you need to redeploy **without** new commits:

- **Vercel:** Project → **Deployments** → ⋮ on latest production deployment → **Redeploy**.
- **Render:** Service → **Manual Deploy** → deploy latest commit.

## Environment variables

### Do not use a `.env` file in production

The **`.env` file is for local development only**. It is ignored by Git (`.gitignore`) and excluded from Vercel uploads (`.vercelignore`). **Never** commit `.env` or copy it onto production servers.

On **Render** (and any API host), define the same names in **Environment** in the dashboard. The Node process reads `process.env` from the platform; you do not need a `.env` file on disk when those variables are set.

---

### Do you need env vars on Vercel?

**Usually no.** In this setup:

- The **browser** loads the React app from Vercel.
- Requests to **`/api/...`** are **rewritten** to the API on Render (`vercel.json`), so **Resend, Mux, and Supabase service-role keys run only on Render**, not in the Vercel build.

You **do not** need to duplicate `RESEND_*`, `MUX_*`, or `SUPABASE_SERVICE_ROLE_KEY` on Vercel for the current architecture.

**Add variables on Vercel only if** you later expose values to the **client bundle** (e.g. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` after refactoring `src/lib/supabase.js`), or if a build step needs a secret. Never put the **service role** key in Vercel client-side env.

---

### Render (API) — required for production

Set these on your **Web Service** (e.g. `deepcast.onrender.com`): **Environment** → add variables → **Save** → **Manual Deploy** (or wait for auto-deploy) so the service restarts.

| Variable | Required | Notes |
|----------|----------|--------|
| `SUPABASE_URL` | Yes | Same project URL as in Supabase dashboard. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only; bypasses RLS — keep secret. Prefer **not** using the anon key here. |
| `RESEND_API_KEY` | Yes | From [Resend API Keys](https://resend.com/api-keys). |
| `RESEND_FROM_EMAIL` | Yes | Must be on your **verified** domain, e.g. `Deepcast <invites@deepcast.art>`. |
| `MUX_TOKEN_ID` | Yes* | *Required for uploads / Mux routes. |
| `MUX_TOKEN_SECRET` | Yes* | *Same. |
| `APP_URL` | Recommended | Public site URL, e.g. `https://www.deepcast.art` — used for invite links when the request doesn’t supply a better origin. |
| `PORT` | No | Render sets this automatically. |

Local development uses a root **`.env`** (or `server/.env` if you configure it) with the same names; **never commit** real keys.

---

### Resend (invite emails)

- **`RESEND_FROM_EMAIL`** must use an address on a **[verified domain](https://resend.com/docs/dashboard/domains/introduction)** in Resend (e.g. `Deepcast <invites@deepcast.art>`).
- **Sandbox:** Using Resend’s shared test domain (`onboarding@resend.dev`) often limits delivery to your signup email. Use your own verified domain for real recipients.

The API checks Resend’s `{ error }` response. If delivery fails, logs and API responses should include Resend’s message (e.g. domain not verified, invalid recipient).

---

### Troubleshooting: “nothing works” / emails not sending

1. **`RESEND_FROM_EMAIL` must match a verified domain**  
   If Resend says `yourdomain.com domain is not verified`, your `.env` still has a **placeholder** (e.g. `invites@yourdomain.com`). Change it to an address on the domain you verified in Resend (e.g. `Deepcast <invites@deepcast.art>`). See **`.env.example`** in the repo.

2. **Restart the API after changing `.env`**  
   `npm run dev` starts both Vite and the server. Stop the terminal (Ctrl+C) and run `npm run dev` again so `dotenv` reloads.

3. **Confirm the browser hits your local API**  
   The Vite dev server proxies `/api` to `http://localhost:3001` (`vite.config.js`). The Express server must be listening (same `npm run dev`). If you only run `vite`, invites will fail (no API).

4. **Production (Render)**  
   The same variables must be set in the **Render** dashboard. Updating only local `.env` does not change production.

5. **Read the red error on the form**  
   After a failed send, the invite form should show something like `Email failed to send: …` with Resend’s message. The browser **Network** tab → failed `invites/send` request → **Response** also shows `details`.

---

### Gmail: “suspicious” mail or images not loading

Invite emails are sent as **HTML + plain text** (multipart) with **`Reply-To`** set to the inviter’s address when available. Thumbnails use **HTTPS** URLs from your storage; the API logs a warning if a thumbnail URL still uses `http://`.

**What you must do outside the repo (DNS + Resend):**

1. **Verify the sending domain in Resend** and set **`RESEND_FROM_EMAIL`** to an address on that domain (not `onboarding@resend.dev`).
2. **Complete Resend’s DNS records** for that domain: SPF, DKIM (and optionally DMARC). The Resend dashboard shows required **TXT** and **CNAME** records — add them at your DNS host and wait for propagation.
3. **DMARC** (recommended): publish a policy at `_dmarc.yourdomain.com` (start with `p=none` while testing, then tighten).
4. **Thumbnail host**: Prefer **HTTPS** Supabase public URLs. Gmail may still hide images until the user trusts the sender — that’s normal; authentication + reputation reduce “suspicious” labeling.

**Local DNS check (diagnostics):** from the repo root:

```bash
./scripts/email-dns-check.sh yourdomain.com
```

This prints **SPF**, **DMARC**, and common **Resend DKIM** hostnames so you can compare with the Resend dashboard. Empty or missing records usually mean DNS was not added yet or hasn’t propagated.
