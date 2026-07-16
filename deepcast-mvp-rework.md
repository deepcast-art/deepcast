# Deepcast MVP Rework — Sharing & Invite Flow

Tracker for the invite/share overhaul. Work top to bottom within each phase; Phase 1 is the compelling-MVP core, Phase 2 is fast-follow.

---

## Phase 1 — Core (makes the MVP compelling)

### A. Link-based claim flow (replaces email-first invites)

- [ ] **A1. Shareable claim link generation**
  Sharer taps "share," enters invitee's **first name only**, gets link instantly.
  URL format: `deepcast.art/{firstname}-{4char}` (e.g. `deepcast.art/joe-h4k2`).
  Suffix guarantees uniqueness and avoids route collisions. Lowercase, sanitized.
  No email entry at share time.

- [ ] **A2. Claim-bind logic**
  - Link is single-claim: first non-sharer to open and claim it becomes the invitee; dead afterward.
  - Sharer opening their own link does NOT claim it. Identify sharer via their authenticated session (they created the link while logged in). Logged-out opens on sharer's own device are an accepted edge case for MVP.
  - Invite record needs: `token`, `invitee_first_name`, `created_by`, `claimed_by`, `claimed_at`, `status`.
  - **Amendment (2026-07-06) — sharer identity, widened.** Lineage is a unified model: `parent_invite_id` is populated the same way for new-flow and old-flow invites, so a new claim link's `parent_invite_id` = the invite its sharer claimed through. This means "sharer" isn't only an account holder — a person can share **at credits-end (C3) with no account at all**, right after watching. So sharer identity for link creation is EITHER an authenticated session (account holders) OR a valid claimed invite, referenced client-side (cookie/local storage) from that person's own claim. The accountless credits-end sharer has no session; their claim IS their identity. `claimed_by` (the user-id side) stays nullable and Phase 2-only — nothing in Phase 1 identity resolution depends on it.

- [ ] **A3. Personalized landing page (pre-claim)**
  Invitee lands and immediately sees their name — the page is custom on arrival, not after acceptance.
  Contents, in order:
  1. Greeting with invitee's first name
  2. Standard sharer line: "**[Sharer's name]** watched this and thought of you."
  3. Platform-concept line (the constraint, stated plainly): "Films here can't be searched, streamed, or subscribed to. They can only be passed from one person to another." (final copy TBD by Ien — two sentences max)
  4. Film title + one-line transmission hook (short version of C1)
  5. "14 minutes. Headphones recommended."
  6. Single CTA: **Accept your invite**
  **Amendment (2026-07-16, walkthrough review):** the page is the CLOSE-UP of the two-beat arrival (letter register; the post-claim graph reveal is the WIDE SHOT of the same object). Additions: a **lineage thread** between the sharer line and the film title — minimal horizontal chain of first-named nodes from `parent_invite_id` ancestry; depth ≤ 4 renders all names, depth ≥ 5 collapses the middle to "⋯ N hands ⋯" keeping three anchors (origin, direct sharer, you); no "passed through N hands" prose anywhere. Plus one quiet line near the film title: "You are the Nth person to be invited to watch this film." (N = real invite count; the ONLY written statistic permitted on the page). Legacy multi-word sharer names trim to first word on this page only.

- [ ] **A4. Email capture at claim**
  On accepting, invitee enters their email. This is the claim action.
  This email is the channel for the reminder (B3) and any future account linkage.
  Keep it to one field. No password, no full signup at this step (pending A6 findings).

- [ ] **A5. Demote email invites**
  Remove email as the first-touch invite mechanism. Archive/disable current invite email templates. Email is post-claim only (reminder, receipts, future "new film" notices).

- [ ] **A6. Auth/playback dependency check** *(do this before A4 build decisions)*
  Trace: watch page → MUX playback URL. Is a Supabase session required?
  - If playback IDs are public → invitee can watch immediately after claim, no session needed.
  - If signed URLs require auth → implement lightweight session at claim (email from A4 as magic-link-lite or guest token).
  Prompt for Claude Code: "Trace the path from the watch page to the MUX playback URL generation. Is a Supabase authenticated session required anywhere in that chain?"

### B. Viewing flow

- [ ] **B1. Post-claim → watch page**
  After claim, land directly on the film page. Minimal steps: claim → watch. No forced account creation before first play (contingent on A6).

- [ ] **B2. Length/conditions line**
  On landing page and film page: "14 minutes. Headphones recommended." Nothing more.

- [ ] **B3. Single reminder email**
  If claimed but unwatched after 48h, send ONE email: "Your film is still waiting."
  One email total. No sequence, no drip. Uses email captured in A4.

### C. Reason to share

- [ ] **C1. Transmission story — text surfaces**
  Per-film story-behind-the-story (context, stakes, why it exists) as short text:
  - 2–3 line version on the claim/landing page
  - Fuller version (director's-note length) on the film page, pre-play
  Note: the intro video inside the film does NOT cover this — it's only seen after commitment. These text surfaces are what give the sharer a sentence to say and the invitee a reason to trust. Content task (Ien writes), not just build task.
  **Amendment (2026-07-16):** hook slot + demo copy shipped — `films.transmission_hook` (nullable; landing page renders nothing when NULL), demo text set on "A Sacred Pause" only. REAL hook and director's note for each real film are Ien-authored content, owner: Ien, required before any non-demo film ships. The fuller director's-note slot on the watch page remains unbuilt, pending that content.

- [ ] **C2. Lineage visibility**
  Surface the existing graph mechanism: invitee can see the chain of hands the film traveled through to reach them; sharing extends the chain.
  ~~MVP version: simple ancestor chain on the film page ("This film reached you through: Dan → Sarah → you"), not full graph viz.~~
  First names only. Revisit purpose mechanism (patronage/finite seats) after feedback.
  **Amendment (2026-07-16, supersedes the struck line):** the ancestor-walk slice is pulled forward into A3's lineage thread (pre-claim, close-up), and the full-graph reveal IS now in scope post-claim (wide shot) — see D1.

- [ ] **C3. Post-film share moment**
  At credits end, prompt: "Who is this film for?" → inline first-name entry → generates claim link (A1) right there. This is the primary share surface; any menu-based share button is secondary.

### D. Copy pass

- [ ] **D1. Post-claim welcome = the graph reveal** *(amended 2026-07-16 — replaces the text-welcome concept)*
  ~~Plainspoken, warm, brief. No ceremony, no manifesto. Philosophy is discovered through the films, not announced.~~
  After a successful claim there is NO text welcome. The invitee sees the existing NetworkMap/NetworkGraph view with their own node newly added, connected to their sharer, their lineage path visually highlighted within the full network — the WIDE SHOT of the landing page's thread. Brief and non-blocking: one tap or short moment to continue to the watch flow, never a gate.

- [ ] **D4. Clean test/seed accounts from the production graph before the graph-reveal welcome ships** — the wide shot only works if the network looks real.

- [ ] **D2. First-touch copy audit**
  Landing page + all claim-flow copy: exclusivity framed as gift-from-a-friend, not institution-granting-access. Kill anything that "announces the sacred."

- [ ] **D3. Update CLAUDE.md**
  Rewrite the invite-flow sections to reflect the new design: link-based claim flow, first-name-only, email demoted to post-claim. Remove/revise the "last name required on every send path" rule. Stale conventions get faithfully rebuilt by future sessions — this doc is load-bearing.

---

## Phase 2 — Fast follow (after Phase 1 ships + first feedback round)

- [ ] **E1. Full funnel audit** — instrument or manually walk every step link-tap → first play; kill remaining system-serving steps.
- [ ] **E2. Account creation post-first-film** — proper signup prompt after viewing ("save your seat / library"), informed by A6 findings.
- [ ] **E3. Editable sharer message** — upgrade B-standard line to optional custom note in sharer's voice.
- [ ] **E4. Purpose mechanism revisit** — evaluate lineage's effect on sharing; consider patronage framing if/when economics are real.
- [ ] **E5. Reserved-name/route guard** — blocklist for URL slugs (app routes, offensive terms) if not handled in A1.
- [ ] **E6. Evaluate signed MUX playback URLs once claim flow is stable** — playback is currently public-policy; exclusivity is page-layer only.
- [ ] **E7. Rotate service-role, Resend, and MUX secrets** (exposed to local transcript 2026-07-06).
- [ ] **E8. Set up proper pg_dump backup path (DB password + libpq) before user count grows.**

---

## Explicitly out of scope

- Shortening or re-editing the films. Not on the table.
- Multi-email drip campaigns of any kind.
- Gamified share counts, progress bars, referral rewards.

---

## Decisions log

| Decision | Choice | Date |
|---|---|---|
| URL format | `deepcast.art/{firstname}-{4char}` | 2026-07-06 |
| Who types invitee name | Sharer, first name only, at share time | 2026-07-06 |
| Claim action | Invitee enters email | 2026-07-06 |
| Sharing purpose mechanism | Lineage (existing graph); revisit later | 2026-07-06 |
| Reminder | Single email at 48h, via claim-captured email | 2026-07-06 |
| Origin story format | Intro video in-film + text transmission story upstream | 2026-07-06 |
| Platform idea at first touch | Single constraint line on landing page ("can't be searched... only passed person to person") | 2026-07-06 |
| names-piece2 (profile last-name) | Parked — superseded by first-name-only design | 2026-07-06 |
| Legacy last-name invite collection | Surfaces retired with email flow; DB columns left dormant | 2026-07-06 |
| Bulk email-invite tool | Retired — all invite creation moves to link-only; legacy `/i/:token` acceptance path (and its email templates) stays untouched indefinitely | 2026-07-06 |
| `claimed_by` field design | Split: `claimed_email`/`claimed_at` capture identity at claim (Phase 1, no account required); `claimed_by` stays a nullable user reference, backfilled by email match only if an account is created later (Phase 2, E2) | 2026-07-06 |
| Slug storage | New column, `link_slug` — does not overload `token`; legacy `token` keeps its unguessable-by-design property, slug is guessable-by-design with its own lifecycle | 2026-07-06 |
| Slug spec | Routing only, never a display source. Unicode-normalize/strip diacritics/lowercase/`a-z`-only/max 20 chars, falls back to "invite"; 4-char unambiguous-alphabet suffix (excludes 0,o,1,l,i); retry suffix ×3 then widen to 5 chars; profanity filtering beyond the reserved-route blocklist deferred to Phase 2 (E5) | 2026-07-06 |
| Resend endpoints | Kept, unchanged — invariant is creation vs. delivery; A5 retires creation of new email invites, resend re-delivers existing ones as part of the protected legacy machinery | 2026-07-06 |
| Lineage model | Unified — new flow populates `parent_invite_id` exactly as the old flow does, invite-to-invite; sharer identity widened to session-OR-claimed-invite (see A2 amendment above) | 2026-07-06 |
| Arrival experience | Two-beat: close-up letter (landing page, with lineage thread) → wide-shot full-graph reveal post-claim; supersedes C2's "not full graph viz" note and D1's text welcome | 2026-07-16 |
