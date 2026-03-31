# Staging on Vercel — deploy `frontend-redesign` on your **existing** staging project

Use the Vercel project you already use for staging. Point its **production** branch at **`frontend-redesign`** so every push to that Git branch updates the same staging URL (no new Vercel project).

The app still proxies `/api` to production Render via root `vercel.json`.

---

## Point staging at this branch (recommended)

1. Open [Vercel Dashboard](https://vercel.com/dashboard) and select your **existing staging** project (not production).
2. **Settings → Git → Production Branch**
3. Set **Production Branch** to **`frontend-redesign`** (replace `staging` or whatever it was if you want this branch to own staging).
4. **Save.**
5. Deploy: push to `frontend-redesign`, or **Deployments → … → Redeploy** the latest commit on that branch.

Your staging hostname stays the same (e.g. `*.vercel.app` or the custom domain already on that project).

**Env vars:** If anything is missing on the staging project, copy from production under **Settings → Environment Variables** (Production scope). Optional client overrides:

- `VITE_LANDING_INTRO_PLAYBACK_ID`
- `VITE_LANDING_INTRO_FILM_ID`
- `VITE_LANDING_INTRO_VIDEO_URL`

**Supabase** is still wired in `src/lib/supabase.js` unless you change it on this branch.

**Invite links:** Render’s `APP_URL` still controls links in outbound email; opening `/i/:token` on the staging host works for valid tokens.

---

## If you do **not** have a staging project yet

1. [vercel.com/new](https://vercel.com/new) → import this repo → name it e.g. `deepcast-staging`.
2. Build: `npm run build`, output `dist`, framework Vite.
3. **Production Branch** → `frontend-redesign`.
4. Copy env vars from production as above.

---

## Deploy from your machine (optional)

After `npx vercel login`, link to **your existing staging** project (not production):

```bash
npx vercel link    # pick the staging project
git checkout frontend-redesign
npm run deploy:staging
```

If the repo was linked to production before, choose **Link to different project** and select staging. `.vercel/` is gitignored.

---

## Checklist

| Step | Done |
|------|------|
| Open existing **staging** Vercel project | ☐ |
| **Production Branch** = `frontend-redesign` | ☐ |
| Env vars present on staging (if needed) | ☐ |
| Push or redeploy; staging URL unchanged | ☐ |
