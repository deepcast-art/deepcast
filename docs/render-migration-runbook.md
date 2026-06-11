# Render migration runbook — move the API to US East (Virginia)

**Why:** the Supabase database lives in AWS us-east-1 (Virginia). The current Render service is
in a different US region, so every single database query costs a cross-country round trip
(~150–300 ms). Moving the API next to the database makes those round trips ~1–2 ms, which speeds
up every page of the app. Plan and price stay the same (Starter).

**Approach:** create a brand-new Render service in Virginia, test it fully while the old one
keeps serving production, then switch traffic with a one-line change. The old service stays
alive as an instant rollback.

> **Note on "zero code changes":** the backend URL lives in `vercel.json`, and Vercel does not
> support environment variables in that file. So the switch itself is one line in `vercel.json`
> (Claude can make that commit when you say go). Everything else is clicking in dashboards.

---

## Step 1 — Collect the environment variables from the old service

Render dashboard → your existing **deepcast** service → **Environment** (left sidebar).
Click the eye icon next to each value to reveal it. You will copy these to the new service:

| Variable | What it is | If it's missing from Render, find it at |
|---|---|---|
| `SUPABASE_URL` | Database address | Supabase dashboard → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server's database key (secret!) | Supabase → Project Settings → API → service_role key |
| `RESEND_API_KEY` | Email sending key | Resend dashboard → API Keys |
| `RESEND_FROM_EMAIL` | "From" address on invite emails | Should be `Deepcast <invites@deepcast.art>` |
| `MUX_TOKEN_ID` | Video service key (id) | Mux dashboard → Settings → Access Tokens |
| `MUX_TOKEN_SECRET` | Video service key (secret) | Mux dashboard → Settings → Access Tokens |
| `APP_URL` | Public website address used inside emails | Your production site origin (e.g. `https://deepcast.art`) — copy exactly what the old service has |
| `INVITE_CTX_SECRET` | Encrypts names in invite links | Copy from old service — must match the `VITE_INVITE_CTX_SECRET` set in Vercel |

Optional — copy **only if they exist** on the old service: `INVITE_EXPIRY_DAYS`,
`SUPABASE_ANON_KEY`. (`INVITE_ENFORCE_EXPIRY` and `SKIP_INVITE_EXPIRY_CHECK` are obsolete —
invite links never expire in the MVP; leave them out.)

Do **not** set `PORT` — Render provides it automatically.

Easiest method: on the old service's Environment page there is an "… " / bulk edit option that
shows all variables as text — copy that text into a note, then paste it into the new service's
bulk editor in Step 2.

## Step 2 — Create the new service in Virginia (old one untouched)

1. Render dashboard → **New +** (top right) → **Web Service**.
2. Connect the same GitHub repository you deploy from today (the deepcast repo), branch **main**.
3. **Name:** `deepcast-virginia` (the test URL becomes `https://deepcast-virginia.onrender.com`).
4. **Region:** choose **Virginia (US East)**. ← the entire point of this exercise.
5. **Build command / Start command:** open the OLD service → **Settings** → "Build & Deploy" in
   another tab and copy exactly what it shows (expected: build `npm install`, start
   `node server/index.js`). Mirror whatever the old service has.
6. **Instance type:** Starter (same as today).
7. Before clicking create, open the **Environment Variables** section and paste in everything
   from Step 1.
8. Click **Create Web Service** and wait until the deploy log ends with the service marked
   **Live** (a few minutes).

## Step 3 — Test the new service BEFORE any traffic touches it

Open these in your browser (replace the name if you chose a different one):

1. `https://deepcast-virginia.onrender.com/api/health`
   → must show `{"ok":true,"service":"deepcast-api",...}`. Proves the server runs.
2. `https://deepcast-virginia.onrender.com/api/team/invite-info?token=migration-test`
   → must show `{"error":"Invitation not found"}`. Proves it can reach the database with the
   right keys (a wrong/missing Supabase key shows a different error).

If either fails, nothing is broken — production still runs on the old service. Fix the env vars
on the new service (Environment → edit → it redeploys) and retest. You can also ask Claude to
run a fuller check against the new URL at this point.

## Step 4 — Switch traffic (the one-line change)

Tell Claude "switch vercel.json to the new Render URL" (or edit it yourself): in `vercel.json`,
change

```
"destination": "https://deepcast.onrender.com/api/$1"
```
to
```
"destination": "https://deepcast-virginia.onrender.com/api/$1"
```

then push to `main`. Vercel redeploys the site in ~1 minute. There is **no downtime**: both
backends are live during the deploy, so every request lands on a working server regardless of
which version of the file serves it.

## Step 5 — Verify production

- Open the live site, log into the filmmaker dashboard — it should load (and feel faster).
- Open an invite link and start it.
- Send yourself a test invite and confirm the email arrives.

## Step 6 — Rollback (if anything looks wrong)

Two clicks, no code: Vercel dashboard → your project → **Deployments** → find the deployment
from just before the switch (it will be the second newest) → "…" menu → **Instant Rollback**.
That restores the old `vercel.json`, which points at the old Oregon service — still running,
completely unchanged. (Equivalent alternative: revert the one-line commit and push.)

## Step 7 — Clean up (only after a few good days)

Keep the old service running for ~3–7 days as a safety net. Then: Render dashboard → old
**deepcast** service → **Settings** → scroll down → **Suspend** (stops billing, keeps it
restorable) or **Delete**. From that point you pay for one Starter service again.

---

## Everything else that mentions the Render URL (checked 2026-06-10)

- **`vercel.json`** — the switch itself (Step 4). Only live reference.
- **`DEPLOYMENT.md` and `CLAUDE.md`** — documentation mentions of `deepcast.onrender.com`;
  cosmetic, update after the migration settles.
- **CORS** — the server accepts requests from any origin (`app.use(cors())`); nothing to change.
- **Resend webhooks** — none exist in the code. Glance at Resend dashboard → Webhooks to confirm
  the list is empty; if anything there points at `deepcast.onrender.com`, update it.
- **Mux webhooks** — none; the app polls Mux for status. Confirm Mux dashboard → Settings →
  Webhooks is empty.
- **Supabase Auth redirect URLs** — these point at the *frontend* (your site domain), not
  Render. Unaffected; nothing to change.
- **`APP_URL` env var** — points at the public site, not Render. Copy unchanged.
