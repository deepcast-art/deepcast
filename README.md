# deepcast

The project is for a social network to share media through word of mouth.

## Git branches

- **`main`** — production (merge here when you want to release).
- **`staging`** — push works-in-progress here; merge to `main` when ready so production doesn’t deploy on every push.

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full workflow and hosting notes.

Design tokens and `.dc-*` utilities live in **`src/index.css`** (see also `src/styles/deepcast-branding-tokens.css` for the branding spec reference).

The wordmark **`public/Deepcast_Logo_Transparent.svg`** is used in-app via **`src/components/DeepcastLogo.jsx`** (same artwork; `currentColor` for light/dark).
