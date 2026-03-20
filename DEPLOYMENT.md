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

## Environment

Production secrets (`RESEND_*`, `SUPABASE_*`, etc.) must be set in **Vercel** (if any client-side) and **Render** (API), not only in local `.env`.
