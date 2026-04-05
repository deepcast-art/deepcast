# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Deepcast** is a social video-sharing platform where creators upload films and share them via invite links. The core mechanic is word-of-mouth propagation: viewers can re-invite others, forming an invite chain visualized as a radial network graph. The platform tracks how content spreads through personal networks.

## Commands

```bash
npm run dev           # Start both client (Vite :5173) + server (Express :3001) in parallel
npm run dev:client    # Vite only
npm run dev:server    # Express only
npm run build         # Production build → dist/
npm run lint          # ESLint
npm run preview       # Preview production build locally
npm run deploy:staging  # Deploy to Vercel staging preview
```

Vite proxies `/api/*` to `http://localhost:3001` in dev. Copy `.env.example` to `.env` and fill in secrets before running locally.

## Architecture

### Stack
- **Frontend:** React 19, React Router v7, Vite 7, Tailwind CSS 4
- **Backend:** Node.js + Express 5 (runs separately on port 3001)
- **Database/Auth:** Supabase (PostgreSQL + RLS + Auth)
- **Video:** Mux (direct browser upload + HLS streaming via `@mux/mux-player-react`)
- **Email:** Resend (transactional invite emails)

### Auth Flow
`AuthProvider` (`src/lib/auth.jsx`) wraps the entire app and manages session + user profile state. On mount it restores the Supabase session from localStorage and fetches the matching `public.users` row. `ProtectedRoute` in `App.jsx` gates all creator/viewer pages. Supabase JWT is sent with API calls via `src/lib/api.js`.

### Video Upload & Invite Flow
1. Creator → `Upload.jsx` → `POST /api/mux/upload` → Mux returns upload URL → browser uploads directly to Mux
2. Express polls `GET /api/mux/asset/:id` to detect readiness; film row saved to `public.films`
3. Creator invites via `InviteForm.jsx` → `POST /api/invites/send` → Express stores invite token in `public.invites` + sends email via Resend
4. Recipient opens `/i/:token` (`InviteScreening.jsx`) → validates token → watches via `MuxPlayer` → can re-share (creates child invite with `parent_invite_id`)

### Network Graph
`NetworkGraph.jsx` renders a radial ring layout using pure SVG/canvas — no graph library. Rings represent invite chain depth (creator at center, first invitees in ring 1, etc.). Used on the Landing page, Dashboard, and standalone `NetworkMap.jsx`.

### Database Tables
| Table | Purpose |
|-------|---------|
| `public.users` | Accounts; `role` = `creator`/`viewer`/`team_member`; `team_creator_id` for team members |
| `public.films` | Uploaded videos with Mux asset/playback IDs and `status` (`processing`/`ready`) |
| `public.invites` | Invite tokens; `parent_invite_id` (self-referential) tracks the chain |
| `public.watch_sessions` | Per-viewer watch progress (`watch_percentage`, `completed`) |
| `public.team_invites` | Pending creator→teammate invites before acceptance |

All tables use Supabase RLS. The Supabase **service role key** is only used server-side (Express) — never in client code. Client uses the anon key (`src/lib/supabase.js`).

### Key Files
- `src/App.jsx` — route definitions (lazy loaded), ProtectedRoute logic
- `src/lib/auth.jsx` — AuthContext, useAuth hook
- `src/lib/api.js` — all `/api/*` endpoint wrappers
- `server/index.js` — all Express routes (Mux, invites, team, email)
- `src/components/NetworkGraph.jsx` — 830-line radial graph renderer
- `src/pages/Dashboard.jsx` — creator hub (~47 KB)
- `src/pages/InviteScreening.jsx` — viewer screening page (~39 KB)

### Deployment
- **Frontend:** Vercel (auto-deploys `main`; `vercel.json` rewrites `/api` to Render)
- **Backend:** Render (`deepcast.onrender.com`; holds all secrets)
- **Branching:** `main` = production, `staging` = integration, feature branches PR into `staging`

See `DEPLOYMENT.md` for full env var checklists and Render/Vercel configuration.

### Style System
Tailwind CSS 4 + custom `.dc-*` utility classes defined in `src/index.css`. Dark sections use `.theme-inverse`. Grain texture uses `.dc-tactile-grain`. Design token reference: `src/styles/deepcast-branding-tokens.css`.
