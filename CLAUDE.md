# CLAUDE.md

## Project overview

Deepcast is an invite-based social network for sharing films through word of mouth. Users receive screening invites, watch films, and pass invitations along to others, forming a network graph.

## Tech stack

- **Frontend:** React 19 + Vite 7, Tailwind CSS 4, React Router 7
- **Backend:** Express 5 (`server/index.js`), Supabase (auth + Postgres), Mux (video), Resend (email)
- **Deployment:** Vercel (frontend) + Render (API at `deepcast.onrender.com`). `vercel.json` rewrites `/api/*` to Render.

## Project structure

```
deepcast/
├── server/index.js          # Express API (Mux, Resend, Supabase service-role)
├── src/
│   ├── App.jsx              # Routes + auth guards
│   ├── pages/               # Page components (Dashboard, InviteScreening, Login, etc.)
│   ├── pages/screening/     # Desktop/Mobile screening sub-views
│   ├── components/          # Shared components (DeepcastLogo, FilmForm, NetworkGraph, etc.)
│   ├── lib/                 # Utilities (api.js, auth.jsx, supabase.js, graphLayout.js, etc.)
│   ├── styles/              # Branding tokens CSS
│   ├── index.css            # Design tokens + .dc-* utilities
│   └── fonts.css            # Font-face declarations
├── public/                  # Static assets (logo, fonts, vite.svg)
├── e2e/                     # Playwright smoke tests
├── supabase/migrations/     # SQL migrations
├── scripts/                 # Utility scripts (DNS check, DB reset)
└── docs/                    # Internal docs (invite flow, staging deploy)
```

## Key commands

```bash
npm run dev              # Start Express API + Vite dev server
npm run dev:client       # Vite only (no API)
npm run dev:server       # Express only
npm run build            # Run unit tests + Vite build
npm run lint             # ESLint
npm run test:unit        # Vitest (fast, no browser)
npm run test:e2e         # Playwright smoke tests (starts dev server automatically)
npm test                 # Unit + E2E
```

## Git workflow

- **`main`** — production. Merges here deploy the live site.
- **`staging`** — work-in-progress. Push here for Vercel preview deploys.
- Workflow: branch from `staging` (or commit directly), push to `staging`, then PR/merge `staging` → `main` for release.

## Testing

- **Unit tests:** `*.test.js` colocated with modules, uses Vitest. Run with `npm run test:unit`.
- **E2E tests:** `e2e/*.spec.js`, uses Playwright (Chromium). Run with `npm run test:e2e`.
- Build includes unit tests: `npm run build` runs `vitest run && vite build`.
- Setup for new clone: `npm install && npx playwright install chromium`.

## Code style

- ESLint flat config with React Hooks + React Refresh plugins.
- `no-unused-vars` errors, but vars starting with uppercase or `_` are ignored (`varsIgnorePattern: '^[A-Z_]'`).
- JSX files use `.jsx` extension. ES modules throughout (`"type": "module"`).
- Tailwind CSS 4 with custom design tokens in `src/index.css` and `src/styles/deepcast-branding-tokens.css`.
- Component classes use `dc-*` prefix for project-specific utilities.

## Environment

- Local dev uses `.env` (never committed). See `.env.example` for all variables.
- Key services: Supabase (URL + service role key), Resend (email), Mux (video), invite context encryption (AES-256).
- `VITE_*` prefixed vars are exposed to the client bundle. Service keys stay server-side only.

## Auth & roles

- Supabase Auth with profiles table. Roles: `creator`, `team_member`, `viewer`.
- `creator` can upload films. Protected routes enforce role checks in `App.jsx`.
- Invite screening flow at `/i/:token` — public route, no auth required.

## Important notes

- `server/index.js` shares utility code from `src/lib/` (e.g., `httpsUrl.js`, `graphLayout.js`).
- Supabase migrations are in `supabase/migrations/` — apply in order.
- Landing page is currently disabled (Login is the home page at `/`).

## Dashboard behaviour (viewer role)

### Resume & return flow
- The "Resume / Watch again" button on each film card uses React Router `navigate()` — not `window.location.href` — so the SPA stays alive and auth state is preserved.
- When a logged-in viewer pauses the screening (`?play=1` flow), `InviteScreening` saves the playback position to `localStorage` under the key `screening_position_<token>` and navigates to `/dashboard` with `location.state.screeningToken = token`.
- `loadViewerDashboard` reads `location.state.screeningToken` on mount and selects the matching film as the active film, so the same film the user clicked Resume on is highlighted when they return.
- `viewerInviteToken` is set to `tokenByFilmId[filmId]` (the token for the currently selected film), not always `uniqueRecvd[0]?.token`.

### Mobile sidebar (viewer)
- On mobile (`< lg`), the viewer dashboard has a collapsible sidebar toggled by a hamburger button in the top bar.
- Sidebar defaults to **open** on first visit (so sign-out and stats are always accessible). The open/closed state persists in `sessionStorage` under `dash_viewer_sidebar` and is restored when the user returns from a screening.
- On desktop (`lg:`), the sidebar is always visible as a left column.

### Mobile sidebar (creator / team_member)
- The creator/team_member sidebar open/closed state persists in `sessionStorage` under `dash_creator_sidebar` and is restored across navigation.

### Network graph (viewer)
- The "My network impact" graph feeds `buildGraphLayout` with **all** invites for the selected film (`viewerFilmInvites`), not just the viewer's ancestor/descendant chain. This matches the Network Map page and produces the full circular graph with the viewer's path highlighted in amber against a faded background.
- `viewerRecipientKey` and `viewerFocusInviteId` are passed to `buildGraphLayout` so `defaultActiveNodes` / `defaultActiveLinks` correctly highlight the viewer's node and their upstream/downstream chain.
- After a viewer sends an invite, the graph scrolls to centre the newly created node. `loadViewerDashboard` returns the newest sent invite ID; the Dashboard passes it as `focusNodeId` to `NetworkGraph`, which smoothly pans to that node.
- Props on the viewer NetworkGraph: `fillHeight pannable showZoomControls showLegend transparentSurface edgeFadeColor="#121a33"`. Section labels (sender names on the inner ring) are **shown** (no `hideSectionLabels`).

## Network graph component (`src/components/NetworkGraph.jsx`)

- `focusNodeId` prop: when changed to a new value, the graph smoothly scrolls to centre that node in the pan container. Uses a `lastFocusedNodeId` ref so it only fires once per new value.
- Scroll math: `scale = graphPx.w * zoom / vbW`; offset from viewBox centre `(vbW/2, viewBoxH/2)` converted to scroll pixels, added to the centred scroll position.

## Auth — password reset

- `resetPassword(email)` in `src/lib/auth.jsx` resolves the `redirectTo` URL in priority order:
  1. Caller-supplied `redirectTo` argument
  2. `VITE_PASSWORD_RESET_REDIRECT_URL` env var (set this in Vercel for production)
  3. `window.location.origin + /reset-password` (local dev fallback)
- The production URL must also be added to **Supabase → Auth → URL Configuration → Redirect URLs** or Supabase will reject it.
