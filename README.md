# deepcast

The project is for a social network to share media through word of mouth.

**Current product truth (2026-07-22):** the V5 viewer dashboard is live — one dashboard for every user, shares are custom unique links only (the email-invite system is retired; legacy `/i/:token` links still resolve), and per-film ticket numbers are live and immutable (filmmaker №1, invitees from №2). Engineering rules and full current state: **[CLAUDE.md](./CLAUDE.md)**. Plain-English product briefing: **[docs/PROJECT-BRIEF.md](./docs/PROJECT-BRIEF.md)**.

## Git branches

- **`main`** — production (merge here when you want to release).
- **`staging`** — push works-in-progress here; merge to `main` when ready so production doesn’t deploy on every push.

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full workflow and hosting notes.

Design tokens and `.dc-*` utilities live in **`src/index.css`** (see also `src/styles/deepcast-branding-tokens.css` for the branding spec reference).

The wordmark **`public/Deepcast_Logo_Transparent.svg`** is used in-app via **`src/components/DeepcastLogo.jsx`** (same artwork; `currentColor` for light/dark).
