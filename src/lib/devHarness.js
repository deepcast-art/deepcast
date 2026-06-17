// Dev-only test-harness gate.
//
// Leads with `import.meta.env.DEV` so a production `vite build` statically replaces it
// with `false` and dead-code-eliminates every branch guarded by it — the /dev route, the
// lazy DevHarness chunk, and the ?devStage effect in InviteScreening never enter the
// production bundle. FAILS CLOSED: when VITE_ENABLE_DEV_HARNESS is missing or anything
// other than the exact string 'true', the harness stays disabled even in a dev build.
export const DEV_HARNESS_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_HARNESS === 'true'
