# Watch Page Redesign — Implementation Prompt

You are implementing the finalized redesign of the Deepcast watch page (`/watch/{slug}`) into the existing React app (`src/pages/ClaimWatch.jsx` and related files). The design is FINAL and founder-approved through ~30 iteration rounds. Your job is faithful translation, not design improvement.

**Ground truth:** `design-refs/watch-page_24.html` — a fully standalone, self-contained replica. Every measurement, color, spacing value, and SVG in that file is intentional. The screenshots in `design-refs/` show the approved renders. When this document and the HTML file disagree on a pixel value, the HTML file wins. When either is silent, match the file's existing patterns rather than inventing.

**Replica-only elements to discard during translation:** the monospace "Handoff specimen" label, the detached State-2 specimen block at the bottom of the file, the `<script>` block (a review shim — reimplement per the behavior spec below, don't port it), and all `{curly}` HTML comments (they mark dynamic-value seams for you).

---

## 1. Fonts — read this before touching anything

Two families, already in the app (`src/fonts.css`, binaries in `public/fonts/`):

- **Phoenix** (`--font-sans`) — Light 300, Regular 400, Semi Bold 600.
- **Garamond Premier Pro Italic** (`--font-serif`) — a single, already-italic cut.

**⚠ DO NOT "fix" the Garamond double `@font-face` registration.** The file is registered under BOTH `font-style: normal` and `font-style: italic` deliberately. Without the italic registration, browsers synthesize an oblique skew ON TOP of the already-italic glyphs — a real shipped bug, fixed 2026-07-21. The replica preserves both registrations and a warning comment; keep both, verbatim.

**Weight law (new, from this redesign):** Phoenix **Light (300) is reserved for body text at reading sizes** (the story body, ~17px). Every small caps-label on the page — tier label, milestones, tickets line, conditions line, buttons, footer/header links, lineage name labels — uses **Regular (400)**. Light at whisper sizes reads frail on ink and was a root cause of the old page feeling cheap. If you see 300 on anything under ~1rem, it's a bug.

**Voice system (which font means what):**
- **Garamond italic** = the film's and the platform's voice: film title, ~~rule line~~ (withdrawn 2026-09-09), creed statements, the modal charge, reveal copy, input placeholder, the generated link, story epigraph. (The story sign-off was cut 2026-07-25 — the filmmaker's name lives in the header now.)
- **Phoenix tracked caps (400)** = the interface whispering: eyebrows, labels, buttons, metadata, link-buttons.
- **Phoenix sentence-case (300)** = information at reading size: story body only.

Never invert these assignments. A line that "looks off" is almost always wearing the wrong voice.

---

## 2. Color tokens & the color law

Existing tokens (Tailwind `@theme` in `src/index.css`):

| Token | Value | Role |
|---|---|---|
| `--color-bg-page` (ink) | `#080c18` | the one page background — solid, no gradient, no grain |
| warm | `#dddddd` | primary text |
| paper | `#e8dfd3` | the generated ticket link only |
| accent | `#b1a180` | gold — see gold law below |
| muted | `#a89f94` | ⚠ warm-beige — see caution below |
| error | `#b84233` | inline form errors |

**New tokens added by the redesign (add to the theme):**
- `--tint-track: rgba(221, 221, 221, 0.08)` — the tier bar's empty track, nothing else.
- `--tint-scrim: rgba(8, 12, 24, 0.82)` — the modal scrim (film faintly visible behind).
- Shared hairline: `rgba(221, 221, 221, 0.15)` — every 1px rule and border on the page uses this exact value. One rule weight, no exceptions.

**⚠ The muted token caution:** `#a89f94` is a warm beige and reads *gold-ish* on ink. It was deliberately RETIRED from all rail stat labels, hallmark numbers, and the rule line during the redesign. It survives only in: the conditions line, eyebrows (including the story header), tickets line, footer/header links. (The story sign-off, a former holdout, was cut 2026-07-25.) Rail/stat text uses **neutral warm-alpha grays** instead:

| Value | Used for |
|---|---|
| `rgba(221,221,221,0.9)` | modal reveal copy base (via existing class) |
| `rgba(221,221,221,0.8)` | tier label, milestones label pairs with 0.6, creed statements, charge base |
| `rgba(221,221,221,0.75)` | hallmark numbers, lineage name labels |
| `rgba(221,221,221,0.65)` | ~~rule line text~~ (the rule line was withdrawn 2026-09-09; the path's names use warm at 0.70) |
| `rgba(221,221,221,0.6)` | milestones "Milestones passed" label, reveal terms-tier items |

If these neutral grays spread further, promote `rgba(221,221,221,0.65)`-family to a proper token and have the muted-vs-neutral conversation app-wide.

**The gold law (strict):** accent gold appears ONLY as *act* or *mark*:
- Acts: the "Pass it on" CTA (solid fill), "Create their invitation" / "Create another invitation" (gold outline; the invitation vocabulary since 2026-09-09 — they read "Share it with them" / "Share another ticket" from 2026-07-25, and "Create their invitation" / "Create another invitation" before that), the tier bar's fill, input focus underline, hover states.
- Marks: ticket stubs, ✦ hallmarks, creed mark glyphs, the lineage's gold path/nodes.
- Approved copy-emphasis exceptions (the ONLY colored words inside copy lines — this overrides the old README's "one uniform type style" rule, founder-approved): ~~`"or its last."` in the rule line~~ (the rule line was withdrawn 2026-09-09, amendment 11), `"you"` in creed line 2, `"needs"` in the modal charge.

Gold never appears on labels, eyebrows, or informational text. No pure `#fff` or `#000` in UI (the player well's black is the video surround, not UI).

**Reward, never extract (FOUNDER REVERSAL, 5 September 2026 — replaces the former "no engagement mechanics of any kind" law; the old wording is kept struck through in §9, item 8).** Any mechanic on this page is judged by five tests, all of which it must pass: (1) would it exist if nobody ever came back; (2) does it invite or pressure; (3) is every number true; (4) is the bottom rung dignified; (5) does the wary person feel seen or watched. Streaks, urgency, loss framing, guilt, variable rewards, pull-back notifications, and comparison that shames stay banned. (The concrete styling bans that expressed the old law — no pulsing, badges, red dots, percentage labels, confetti, urgency colors — all still fail the tests above and remain out.)

---

## 3. Page structure (desktop ≥900px)

Top to bottom:

1. **Header** — wordmark `deepcast` (Phoenix 600, 1.5rem, lowercase, warm @0.9) top-left; `Your dashboard →` link top-right (whisper caps, muted, warm on hover). `justify-content: space-between`.
2. **Masthead** (full-width, centered): film title in Garamond, `font-style: italic` set EXPLICITLY (safe due to double registration; also makes font-fallback italicize), `clamp(1.5rem, 2.2vw, 1.75rem)`. Beneath: the conditions line — headphones glyph + `14 minutes. Headphones recommended.` — 10px caps, 0.26em tracking, muted. Runtime is per-film (`screeningConditions.js` + `runtime.js`). Nothing else in the masthead. (A film-type suffix and a synopsis line were both tried here and REMOVED — do not add them.)
3. **Hero grid**: shell `max-width: 80rem`, padding-inline `clamp(1rem, 4vw, 3rem)`. Grid: `minmax(0,1fr) 24rem`, `column-gap: 3.5rem`, `align-items: stretch`. Left = player. Right = the rail.
4. **Creed band** (full-width): hairline rules top and bottom, three columns, `column-gap: 4rem`.
5. **Story** — its own centered region below the band, `max-width: 42rem`, internally left-aligned.
5b. **Comments** (founder addition 2026-09-09, §3e) — the same 42rem column, below the story, before the footer. Renders NOTHING for anyone but a signed-in claimant of this film or its creator.
6. **Footer** — centered `Your dashboard →`.

The trio band's top edge must crest inside a 1440×900 viewport (it lands ~600px with these values). If any future change pushes it below ~730px, that's a regression.

### 3a. The player
The Mux player (`@mux/mux-player-react`), 16:9, **flat on ink — no drop shadow**. `accentColor="#b1a180"` prop (note: this colors ALL Mux chrome — play, scrubber, buffered bar).

**⚠ Poster frames are mandatory product policy from this redesign:** every film must ship a `poster` still. A black pre-play well is not acceptable in production; it distorted design judgment throughout this process and will do worse to viewers.

**The poster rule (`src/content/filmStory.js`, `POSTER_OVERRIDES` / `filmPosterUrl`):** the default is Mux's auto-thumbnail of the film's CURRENT playback id at `?time=1`; a hand-picked frame is one explicit line per film. **Circles (FOUNDER DECISION, 9 September 2026):** the poster is a frame from the cut that is ACTUALLY PLAYING — the third cut — at `time=5`, chosen by the founder on rendered frames: `https://image.mux.com/QDUEUyF7WDjjsOtMfeVfqh6M2NVM02arzLHK3IJnwYC00/thumbnail.png?time=5`. The pin is explicit — the source playback id (`CIRCLES_POSTER_SOURCE`) and the time (`CIRCLES_POSTER_TIME`) are both named in the module — so a future playback-id swap re-keys the story entry but cannot silently move the frame: the founder re-chooses the time on the new cut, or keeps this source. (History: from 2026-07-24 to 2026-09-09 the poster was pinned to the ORIGINAL upload's playback id `4HnHRG3N…` through four swaps; that dependency on the original Mux asset is gone.) The LANDING page's full-bleed still is a different thing — `films.poster_url`, data the founder sets himself — and is not governed here.

### 3b. The rail (the record, the act, the law)
A single left-aligned cluster, **vertically centered against the player**: `.rail { display:flex; flex-direction:column; justify-content:center; height:100% }` inside the stretched grid column. **FOUNDER AMENDMENT 2026-07-23 — optical lift: the centered flex additionally carries `padding-bottom: 2.5rem` (desktop only), so the cluster's mass sits a touch above geometric center; verified with the milestones block present AND absent.** ⚠ This centering is currently "against the grid row," which equals the player only because nothing else is in the left column. If anything is ever added below the player, the rail must center against the **player's box specifically** — implement accordingly (e.g., measure the player, or keep the left column player-only).

Internal order and spacing (two-tier rhythm: tight *within* a fact, wide *between* facts and before the act — the same 1.75rem for both since the founder's rail-spacing decision of 9 September 2026; with the milestones block absent, the gap before the act is still the column's widest):

1. **The tier bar** — 2px track (`--tint-track`), squared ends (no border-radius, ever), fill in **solid accent**. Fill width = `shares_count / next_tier` as a percentage (847/1000 → 84.7%), set inline/computed. The bar ALWAYS shows progress toward the NEXT tier only. **FOUNDER METRIC SWITCH 2026-07-25: the counted number is TICKETS SHARED (film-wide non-void generated links, `filmSharesCount`, shared rule `countFilmShares`), replacing the claims count. The ladder itself is unchanged — 100 stays the first rung.**
2. `margin-top: 1.125rem` → **the count**: `{shares_count}` — Phoenix 600, 2.25rem, warm, `letter-spacing: 0.01em`, line-height 1.
3. `margin-top: 0.5rem` (bonded) → **the label**: `Tickets shared of {next_tier} goal` → renders `TICKETS SHARED OF 1,000 GOAL` — Phoenix 400, 0.8125rem, caps, 0.18em, warm@0.8. Number formatted with comma. (Was `Viewers reached of {next_tier} goal` until the 2026-07-25 metric switch.)
4. `margin-top: 1.75rem` → **`Milestones passed`** (Phoenix 400, 0.8125rem, caps, 0.18em, warm@0.6) and `margin-top: 0.5rem` → the **hallmarks**: `✦ 100   ✦ 250   ✦ 500` — 0.8125rem, 0.14em, numbers warm@0.75, ✦ in accent@0.5. **FOUNDER AMENDMENT 2026-07-23: NO interpunct separators — the groups are separated by spacing alone (~1.25em gap). Do not restore the dots.** Renders every crossed tier (`crossed_tiers`).
5. `margin-top: 1.75rem` (FOUNDER, 9 September 2026 — was 2.25rem, the replica's value; measured on production the gap from the tier label's glyphs down to the button was ~39px against ~31px from the button down to the path's dots, so the CTA's margin dropped one step to 28px and both read 31px. **Rail spacing rule: the gap above the CTA equals the gap below it, measured glyph-to-button and button-to-dots** — "above" meaning from whatever sits directly above the button: the tier label on a film below its first milestone (Circles today), or the hallmarks row once a milestone has been crossed (the hallmarks' half-leading adds ~1–2px; still equal to the eye). The path's own 1.25rem offset is untouched; below 900px the CTA keeps its `mt-6`) → **the CTA**: `Pass it on` — full rail width, min-height 52px, ink text, caps 0.8125rem/0.28em. **Resting keyline (FOUNDER DECISION 2026-07-25, superseding both the original seamless-solid rest and the same-day hover-only keyline stamp — do not "fix"):** the button ALWAYS wears the printed-ticket double frame — a 1px solid-accent border (the keyline) around a slightly deeper gold fill, on all devices. Fills are explicit precomputed solids (no alpha compositing): rest fill `#9d8f74` (= accent at 88% over ink), hover fill `#a7987a` (= accent at 94% over ink — a ~7% brightness step); the keyline stays through hover. No other motion, no scale, no shadow (the no-engagement-mechanics law held at the time; since 5 September 2026 the same conclusion follows from "reward, never extract" — §2). Focus-visible: 1px accent outline, 3px offset. Still the page's ONLY solid-filled object. Opens the modal. (History: the ring began as an alpha-compositing accident of the original hover, was stamped deliberate-on-hover earlier on 2026-07-25, then promoted to the resting design the same day.)
5b. ~~The lineage chain between the CTA and the rule line~~ — **BUILT AND WITHDRAWN BY THE FOUNDER, 9 September 2026, pending a design pass** (the design pass produced THE PATH, item 6, the same day)**:** the landing letter's chain (`LineageChain.jsx`, same rule and type, ending "→ Who’s next?") was placed here in the `story-links-and-copy` batch and rejected on sight; the rail's CTA → rule-line spacing is exactly as before (`margin-top: 1.25rem`). The shared component and the landing page's use of it (with `(filmmaker)`) stay.
6. `margin-top: 1.25rem` → **THE PATH (FOUNDER DESIGN, 9 September 2026 — from the canvas; replaces the rule line, which is REMOVED, amendment 11).** Exactly where the rule line sat — 1.25rem below the CTA, nothing else between — one inline SVG, full rail width: `viewBox="0 0 384 66"`, `width="100%"`, `preserveAspectRatio="xMinYMid meet"`; no hover, no motion, not a link; absent on the filmmaker's own page (depth 0), as the rule line was. `src/components/RailPath.jsx` draws it; the rule is `src/lib/railPath.js` (unit-tested). **Data:** the chain's first names, origin first, from the same rule the landing chain and the emblem use (`chainHands`), then `you`, then a final next-slot. More than three hands → only the first, a single collapsed entry labelled `{n} OTHERS` (n = hands − 2; founder label pass 2026-09-09 — uppercase, no ellipsis marks), and the last — the row never wraps. Nodes evenly spaced on y=14 with a 30px inset on both sides. **Segments — one stroke for the whole path (founder line rule, 2026-09-09, superseding the canvas's brightening ramp):** every segment is the same stroke, 1px in accent `#b1a180` at 0.55 opacity, no ramp along the path; the final run from `you` to the next slot is the same colour, weight and opacity, distinguished only by its dash `2 4` — it is no longer grey. Nodes unchanged. **Nodes:** each hand and the collapsed entry r=2.6, fill accent at 0.85; `you` r=3.2, fill accent solid; the next slot r=3.2, no fill, 1px accent stroke. **Labels** on y=41, centred under their node, Phoenix 400, uppercase, letter-spacing 1.8px: hands 10px in warm `#dddddd` at 0.70; the collapsed entry `{n} OTHERS` the SAME 10px caps, tracking and colour as the names (founder label pass 2026-09-09 — never a smaller size, never the muted beige); `YOU` 10px in full warm; the next slot a bare `?` 11px in accent. Under the first node only, on y=56, centred: `(FILMMAKER)` in Phoenix 400, 8px, letter-spacing 1.6px, warm at 0.70 (suppressed over the server's "The filmmaker" fallback, as on the landing chain). **Colour law — one grey for every label but you and the next slot (founder, 2026-09-09):** names, the collapsed entry and the caption all read warm at 0.70, never gold, never the muted beige; the only labels that differ are `YOU` (full warm) and `?` (accent). Gold appears only as the path, the nodes and the `?`, which are marks. The SVG carries the accessible sentence the rule line used to (`role="img"`; aria-label = the founder's landing label `How this reached you` + `: ` + the stops joined by ` → ` — the joined form is the builder's, PENDING §7). The collapsed entry's label was settled by the founder on 2026-09-09 after the first pass: `{n} OTHERS` (a first `⋯ {n} others ⋯` at 9px muted was tried; the e2e still asserts the five-node row never overlaps and prints the measured gap). The builder set `overflow="visible"` on the SVG so a long first or last name spills into the gutter rather than clipping at the 30px inset. **THE ONWARD SEAT (FOUNDER DESIGN, 9 September 2026, second pass — amendment 12):** the hollow `?` is the EMPTY seat. Once the viewer has created at least one invitation for this film, that seat becomes the people they shared with DIRECTLY, as one node, and the path ends there — no `?` after it, ever. One person → their first name as the sharer typed it, shown from the moment the invitation is created, before they claim (never `1 PERSON`); two or more → `{n} PEOPLE` (the word is PEOPLE, not OTHERS). The label is the names' style exactly — 10px Phoenix caps, 1.8px tracking, warm at 0.70. The node (r=3.2, the seat the `?` occupied) and the run to it — **FOUNDER AMENDMENT, 9 September 2026, late:** hollow dot + dashed run `2 4` ONLY when the seat is a single named person who has not yet claimed; solid dot + solid run once that person claims; a GROUP seat (`{n} PEOPLE`, n ≥ 2) is ALWAYS solid, whatever the claims — the count records the sharer's act, not an arrival — the same stroke, weight, colour and opacity as the rest of the path (`RAIL_PATH_STROKE_OPACITY`), only fill and dash change (`onwardSeatSolid`, `src/lib/railPath.js`). The collapse past three hands applies to the hands BEFORE `you` only; the onward node is never collapsed or counted — five nodes at most: origin · `{n} OTHERS` · last · `YOU` · onward (label clearance at five nodes measured on real text boxes: 17.9px at 1440, 16.7px at 390 — well over the 6px rule). Depth 0 (the filmmaker's own page) still has no path — one hop only; deeper is the constellation's job. **Data:** `GET /api/invites/link/:slug` carries `onward: [{ firstName, claimed }]` — this invite's direct children that EXIST (the who-exists rule: voids never, ghosts per `show_ghosts`), oldest first; `firstName` through the display-name rule (an email fragment is never a name); `claimed` = the shared claimed-stage rule (claimed / watched); nothing else about those people leaves the server (`buildOnward`, `server/watchPayload.js`, unit-tested). The film-scoped route serves `onward: []`. The page adds the invitations created in the visit to the seat the moment `create-link` succeeds (`createdOnward` in `ClaimWatch.jsx`; the payload is never refetched, so nothing doubles). An older payload without the field reads as nobody — the `?` — byte-identical to before (the slug-path baseline in `e2e/creator-watch-page.spec.js` holds without re-recording). Rule in `src/lib/railPath.js` (`onwardLabel`, `onwardPeople`), drawn by `RailPath.jsx`, e2e in `e2e/rail-path.spec.js`. The aria-label appends the seat's label and, while unclaimed, ` (not yet claimed)` — builder's wording, PENDING §7.

**The tier ladder (fixed):** 100 / 250 / 500 / 1,000 / 2,500 / 5,000 / 10,000 / 25,000 / 50,000 / 100,000 / 250,000 / 500,000 / 1,000,000. `next_tier` = the smallest ladder value > `shares_count`. `crossed_tiers` = all ladder values ≤ `shares_count`. Numerals always; NO percentages displayed anywhere; no countdowns; no goal-met celebration states.

⚠ The `✦` glyph (U+2726) may not exist in Phoenix — verify the rendered glyph; if the system substitutes badly, replace with a tiny inline SVG four-point star matching the `.hm` sizing.

### 3c. The creed band
Three centered columns, each: a small gold mark (accent, opacity 0.45, in a fixed-height flex slot so the text rows stay level) above a Garamond-italic statement (**1.125rem — FOUNDER AMENDMENT 2026-07-23, up from the replica's 1.0625rem**, line-height 1.7, warm@0.8, max-width 22rem). Marks, left to right (all in the replica, copy exactly):
1. **The hand-off**: two solid nodes, one flat horizontal line.
2. **The fan**: two solid nodes, then three lines fanning right to three HOLLOW nodes (node grammar: solid = arrived, hollow = possible — same grammar as the lineage).
3. **The ticket stub** (the original stub path).

### 3d. The story
**Link icons (FOUNDER ADDITION, 9 September 2026):** two inline-SVG icon links — Instagram, and a globe for the website — 16px, hairline stroke 1.2, currentColor muted, warm on hover, `target="_blank"` with `rel="noopener noreferrer"`, on their own row ABOVE the eyebrow's caps line, 14px above it, horizontally centred over the word `Filmmaker` (absolute, so the eyebrow's baseline on the photo's edge never moves). `src/components/FilmmakerLinks.jsx`; URLs per film in `src/content/filmStory.js` (`links`; a film without them renders no icons). The same two icons sit beside the founder's name on the About page. No third-party widget, no tracking.
`Filmmaker · {filmmaker_name} · {filmmaker_location}` eyebrow (11px caps, 0.32em, **muted**; **header restructure 2026-07-25** — was `From the filmmaker · {location}`, and the name moved up from the retired sign-off; each `· phrase` is one unbreakable NBSP-bound unit so narrow screens break only at the `·` boundaries) with a **3.5rem circular photo frame** to its left (`.story-byline`: flex, `align-items: flex-end`, 1rem gap; eyebrow gets `padding-bottom: 0.3125rem` optical lift so the caps sit on the circle's base). The circle is 1px hairline border + `--tint-track` fill — swap in the filmmaker's `<img>` (`{filmmaker_photo}`), keep the frame. Then: serif-italic epigraph (`clamp(1.25rem, 2vw, 1.4375rem)`, warm@0.9), body paragraphs in **Phoenix Light 300, 1.0625rem, line-height 1.85, warm@0.82, max-width 62ch, left-aligned** (the ONE place Light is correct). **The sign-off (`— {filmmaker_name}, director`) is CUT (2026-07-25)** — the section ends with the body text. Story copy is per-film.

### 3e. Comments — "Join the conversation" (FOUNDER ADDITION, 9 September 2026)

`src/components/WatchComments.jsx`, mounted by `ClaimWatch.jsx` inside the main column after the story section and before the footer — **never above the player, never on the landing page.** Rules server-side in `server/commentRules.js` (unit-tested); routes `GET`/`POST /api/films/:filmId/comments` and the owner-only `POST /api/admin/comments/remove`; table `comments` (migration `20260910_comments.sql`, service-role-only: RLS on, zero policies, anon/authenticated grants revoked).

**Who sees it.** Claimants of THIS film, signed in, read and write; the film's creator too (his number is `films.creator_ticket_no`). A visitor without a claim on this film sees no section at all — the component fetches only when a session token AND the film id exist, and renders only after the server answered 200. No placeholder, no spinner; an older API or any failure leaves the page as before. **The recorded slug-path baseline (a stash-only, signed-out viewer) therefore holds without re-recording.**

**Product rules.** Text only, up to 1,000 characters (client check + server + database constraint). One level of replies rendered; `parent_comment_id` always points at a top-level comment — a reply to a reply attaches to that reply's top-level comment, so every thread is flat and ordered by time. Oldest first, always. No sorting, votes, reactions, notifications, or photos (decided for later; not scaffolded). No polling: the list loads with the page and refreshes after the viewer posts. Owner-only soft delete (`deleted_at` + `deleted_by`, the `ADMIN_USER_ID` pin): a removed comment disappears for everyone, its replies with it. Identity from the verified session token only; first names resolved at read time through `safeFirstName` and the ticket number from the claimant's invite on this film — nothing else about a person leaves the server, and no second copy of any name is stored. Rate limit, server-side: 10 comments per 10 minutes per person. Timestamps relative, numerals always (`src/lib/relativeTime.js`): "2 hours ago", "Yesterday", "3 days ago"; after seven days, the date. A failed post shows the inline message in `--color-error` under the field, the way name-rule errors read in the share modal; nothing is lost from the field.

**Visual spec** (chosen in the 9 September design pass; only values that already exist on this page — no new colours, weights, or fonts):
- Section: top hairline `border-warm/15`, `pt-10`; heading in the story-header eyebrow style (Phoenix 400, 11px caps, 0.32em, muted).
- Composer first: a 40px hairline circle (the filmmaker photo's frame — `border-warm/15`, `bg-tint-track`) holding the commenter's initial in Garamond italic warm/60; beside it a single-line textarea that grows, bottom hairline `border-warm/20` (accent on focus), Phoenix Light 17px, placeholder in serif italic warm/40 reading `Write a comment`; beneath, left: `You’ll appear as {FirstName} · Ticket No. {n}` (Phoenix 400, 11px caps, 0.24em, muted); right: the gold-outline `Post` box (border accent/60, accent text, 0.8125rem caps, 0.28em, min-h 48; `One moment…` while busy). **Gold appears nowhere else in the section.**
- Each comment: the same 40px circle with the initial — the creator's comments show his portrait from `filmStory.js` instead; name line `SOFIA · Ticket No. 41 · 2 hours ago` — the name in Phoenix 400 12px caps 0.26em warm/90, the rest muted (the ticket segment absent when the claim has no number); body Phoenix Light 17px, line-height 1.85, warm/80, max-width 62ch, newlines kept; then `Reply` as bare tracked-caps text (11px, 0.24em, muted, warm on hover) and, for the owner only, `Remove` beside it — **two clicks (founder, 9 September 2026): the first turns the text to `Confirm remove`, the second removes (soft delete), and clicking anywhere else (or Escape) resets it.** Comments 36px apart.
- `Reply` reveals the same composer at the end of that thread (32px circle, its own `You’ll appear as` line, focused); pressing `Reply` again hides it. Replies do not offer `Reply` (one level rendered).
- Replies indent 56px under their parent on a left hairline `border-warm/10`, with a 32px circle, 24px apart.
- Phone: the same anatomy in the 42rem column; nothing new.

**Affordance-law amendment (founder, 9 September 2026):** an in-place action on a comment is bare tracked-caps text, as the landing chain's expander already is. The §4b law ("a box means act here; an arrow means go there") otherwise stands — `Post` is still a box.

---

## 4. The modal — full spec

Opened by the CTA. This REPLACES the old always-docked panel (a deliberate founder override of the original product decision — see §8 README amendments).

**Surface & chrome:** centered dialog, `max-width: 30rem`, ink background, hairline border, padding `2.75rem 2.5rem 3rem`, `max-height: calc(100dvh - 2rem)` with internal scroll. Close **×**: 1px-stroke glyph, warm@0.6 (warm on hover), absolutely positioned top-right, 44px hit target. Scrim: `--tint-scrim`, no blur.

**Motion:** scrim enters with the existing `.dc-fade-in` (400ms), dialog with `.dc-result-rise` (0.7s rise). Both have `prefers-reduced-motion` overrides already defined — keep them. The replica retriggers animations by toggling `hidden` (display change restarts CSS animations); if React keeps the dialog mounted, re-apply the classes on open or the entrance dies after first use.

**Behavior (reimplement, don't port the shim):** open → focus the first-name input; focus trapped within the dialog (⚠ the trap must RE-QUERY focusables after the reveal renders, or the reveal's buttons escape it); close on ×, Esc, and **`mousedown` on the scrim itself** (mousedown, not click — so a text-selection drag ending outside doesn't dismiss); focus returns to the CTA on close; body scroll locks while open. `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → the eyebrow; the CTA carries `aria-haspopup="dialog"` and `aria-controls`. Strongly consider native `<dialog>` (free focus containment + Esc; style `::backdrop` with `--tint-scrim`).

### 4a. State 1 — before creating a ticket
Order, all centered:
1. Eyebrow: `Pass it on` (11px caps, 0.32em, muted; "Make an impact." cut by the founder 2026-07-25 — the eyebrow stays the dialog's `aria-labelledby` target)
2. **The lineage graph** (spec in §5)
3. **Ticket stubs**: 5 stub SVGs, `data-stub="used"` ones at opacity 0.22, **spent newest-first (rightmost stubs dim first)**, 400ms opacity transition (none under reduced motion). Decorative, `aria-hidden`.
4. `{tickets_remaining} invitations left.` — whisper caps line (0.75rem/0.24em, muted; invitation vocabulary 2026-09-09).
5. **The charge**: `Who needs to see this? Not anyone — the one it will matter to.` — Garamond italic, **1.125rem (FOUNDER AMENDMENT 2026-07-23, up from the replica's 1.0625rem)**, warm@0.8, with `needs` in accent. Bind `anyone — the` with `&nbsp;` before the dash.
6. **The form**: input (centered text, hairline bottom border warm@0.2 → accent on focus; placeholder `Their first name` in serif italic warm@0.4; sr-only label; maxlength 50) and the button `Create their invitation` (label 2026-09-09 — the invitation vocabulary; was `Share it with them` 2026-07-25–09-09, and `Create their invitation` before that; gold outline: border accent@0.6, accent text, caps 0.8125rem/0.28em, min-height 48px; hover/focus fills accent with ink text). Name validation errors render inline in `--color-error` between input and button (`firstNameRule.js`) — state not shown in replica but carried over from the original.

### 4b. State 2 — after creating a ticket (THE REPLACEMENT MODEL)
⚠ Post-creation, the modal **transforms — it does not grow**. The charge line and the form are REPLACED by the reveal, so the link renders where the field was: **no scrolling required to see the ticket link**. The lineage updates (§5), the stubs dim one more, the count line updates. Full State-2 order:

1. Eyebrow (unchanged)
2. Lineage — the `?` slot now shows the recipient's name, node **stays hollow** (ticket sent, not yet claimed)
3. Stubs — one more dimmed
4. `{tickets_remaining} invitations left.` (decremented)
5. **The reveal** (rises in with `.dc-result-rise`; hairline top rule, `padding-top: 1.75rem`):
   - `Here’s {recipient_name}’s invitation link — it admits one person only. Send it to them with why they came to mind.` — serif italic 1.0625rem warm@0.85 (FOUNDER 2026-09-09; ONE shared rule for BOTH share surfaces, `src/lib/revealSentence.js`, so the dashboard modal reads the SAME sentence; was `Here’s {name}’s ticket link. Send it to them with why they came to mind.`)
   - **The bare link** — serif, `clamp(1.1875rem, 3vw, 1.4375rem)`, paper@0.9, `word-break: break-all`. Handed over BARE — no pre-written message, ever (product law).
   - `Copy their invitation link` (label 2026-09-09; was `Copy their ticket link` 2026-07-25–09-09, `Copy their invitation` before) — warm-outline button (border warm@0.2, warm text; accent border/text on hover), min-height 44px. Copies the link.
   - `1.75rem` → `{tickets_remaining} invitations left. Who else needs it?` — whisper caps, muted (`revealTicketsLine.js`, invitation vocabulary 2026-09-09)
   - `0.875rem` (bonded) → **`Create another invitation`** (label 2026-09-09; was `Share another ticket` 2026-07-25–09-09) — a GOLD-OUTLINE link-button (same affordance family as the form's create button: border accent@0.6, accent text, fills gold on hover, min-height 44px, caps 0.6875rem/0.26em). Action: swap the form state back in — field cleared, charge line restored. The modal cycles.
   - `2rem` (separated) → `See your impact →` (2026-09-09; was `See where your ticket went →`) — muted arrow-link, warm on hover. Destination: the dashboard (the live share graph — the "big reveal" lives THERE, deliberately last as the exit).

**The affordance law (why the above looks the way it does):** on this page, **a box means "act here"; an arrow means "go there."** Buttons are outlined or filled rectangles; navigation is a text link with `→`. Never style an action as bare text and never put an arrow on an in-place action. **Founder amendment, 9 September 2026:** an in-place action on a comment (`Reply`, `Remove`) is bare tracked-caps text, as the landing chain's expander already is (§3e).

**Zero state** (all tickets spent — from the original app, keep it): the count line + form are replaced by `You’ve used all your invitations for this film.` (2026-09-09; was `You've shared all your tickets for this film.` from 2026-07-25 — `NO_TICKETS_MESSAGE` in `src/lib/ticketRules.js`, the one source the server's refusal reads too); stubs remain, all dimmed. Apply the same replacement model.

**Count collision (resolved by design):** the top count line and the reveal's `…invitations left. Who else needs it?` would state the count twice in State 2. Per the design, in State 2 the reveal's line is authoritative — hide the standalone top count line OR accept the echo; preferred: hide it post-creation.

---

## 5. The lineage graph — geometry template + dynamic names

A `<figure>` in the modal, `max-width: 25rem`, full-width SVG `viewBox="0 0 400 160"`, `aria-hidden="true"` (the rail's path carries the accessible fact since 2026-09-09; before that, the rule line). **The geometry is a FIXED, hand-composed template — identical for every viewer of every film. Only the text labels (names) and element visibility are dynamic.** This is a string-substitution render; no layout engine.

Copy the SVG from the replica exactly. Its layers and their rules:

| Layer | Elements | Data condition |
|---|---|---|
| **Far field** | 5 tiny dots, r1.2, warm@0.13, unconnected | Purely aesthetic atmosphere ("distant tree"). ALWAYS rendered. Never wire to data. |
| **Near branches** | faint forks off the named hands + pre-frame entry forks; lines warm@0.1 (0.8w); junction dots r1.6 @0.22; twig-end dots r1.3 @0.18 | Each fork = "that hand made at least one other share." Render only if TRUE. Never invent people — creed line 1 makes fabricated humans a brand violation. **LIVE since 2026-07-23: the link route sends `lineageForks: boolean[]` (parallel to lineageNames, origin first; who-exists rules, id-verified creator sends — src/lib/lineageForks.js); the emblem lights the replica fork cluster per shown hand, and the pre-frame entry forks only when a hand deeper than the shown three verifiably forked.** |
| **Gold path** | entry stroke @0.3 (implies the deeper chain), then 3 segments brightening 0.45 → 0.55 → 0.65 toward YOU | Entry stroke renders only when `chain_length > 3`. |
| **Chain nodes** | 3 predecessors growing r2.2/2.4/2.6 (opacity 0.7/0.78/0.85), then **YOU**: r3.6 solid + halo ring r7 @0.35 | Predecessors shown = last `min(3, chain_length)` hands. |
| **The next** | dashed line (3 3, accent@0.5) → hollow node r3.2 (stroke accent@0.8, 1.2w) | Always present while tickets remain. |
| **Labels** | 9px, 0.15em tracking, `text-anchor: middle`, Phoenix (400); predecessor names warm@0.75; `YOU` in accent; the next-slot label in accent@0.85 | Names = REAL first names from the viewer's actual chain (`chain_names`), uppercase. |

**Node grammar (sacred):** solid = a person who has claimed/arrived · hollow = a ticket not yet claimed. **The `?` sits in the NAME SLOT above the hollow node** — the place a name will go — not inside the circle.

**State 2 change:** exactly one substitution — the `?` label becomes the recipient's first name (e.g. `MAYA`). The node **remains hollow** until she actually claims. (When a prior recipient has claimed, their node renders solid — the same grammar extends naturally if you later show multiple sent tickets; v1 shows only the single "next" slot. Past shares live in the stubs and the dashboard, not here.)

**Chain-length toggle table:**

| Situation | Render |
|---|---|
| First circle (filmmaker → viewer) | 1 predecessor (the filmmaker's name) → YOU → hollow `?`. No entry stroke, no forks unless real. Sparse = honest = correct. |
| 2–3 hands | that many named predecessors, no entry stroke until depth > 3 |
| 4+ hands (any depth) | exactly 3 named predecessors + entry stroke; the rail's path shows the collapsed entry's count (hands − 2) |
| Forks/canopy | per-hand booleans, as above |

**Name length:** labels cap at ~8 characters (truncate with a mid-dot, or ease tracking per-label). VERITY fits; ALEXANDRA collides with YOU if unhandled.

**INTERIM (owner direction 2026-07-23, pending the sparse-composition design-ref):** for chains SHORTER than 3, the rendered constellation group (gold path, nodes, labels, forks, the next slot) is horizontally centered in the 400×160 canvas by a pure translate of the fixed geometry — no new composition, no new elements; the far-field dots stay put (full-canvas atmosphere). Full chains keep the replica's exact placement. The sparse state's real redesign arrives as a design-ref update and replaces this translate.

**Adjacent product note:** the LIVE, full share graph (real topology, interactive) is the DASHBOARD's feature, reached via "See where your ticket went →". This emblem is its fixed preview. Do not attempt live topology here.

---

## 5b. The dashboard constellation — "A BRANCH'S LENGTH IS ITS REACH" (founder, 10 September 2026) under the law "nothing competes" (9 September)

*Recorded here at the founder's direction; the implementation notes live in CLAUDE.md's constellation paragraphs. The live, full share graph — the viewer dashboard's constellation and the creator dashboard's "See network graph" modal — is ONE drawing (`src/lib/constellationLayout.js` + `src/components/ConstellationMap.jsx`): layout, geometry, dot sizes, type sizes, spacing and label placement are identical on every surface at a given canvas width. The ONLY per-viewer differences are (1) which segments, dots and labels are gold, and (2) on a phone, where the camera opens. Nothing else may vary by viewer or surface. This section supersedes the 9 September layout (v4: fans on generation rings, stepping outward a level when crowded) and records the rejection of v5 (PR #10, rings-as-generations — less cohesive than v4); the drawing rules v5 got right are kept and listed below.*

**The layout rule (approved on a drawing of Circles' real rows, 10 September).**

1. **The first ring is exactly v4:** the filmmaker's own invitations evenly spaced around the full circle in ticket order (first ticket at 12 o'clock, clockwise); the centre emblem and its two labels unchanged; a ring too crowded for its names moves outward as a whole, still even (`R0` 118, `RING_BUMP` 46).
2. **Reach:** every other person sits BEYOND the person who gave them the film, inside a fan centred on that parent's outward direction (from the centre through a first-ring parent; for a deeper parent, the direction from their own parent through them). Distance from the parent = `REACH_BASE + REACH_K × √(size of the person's own subtree)` — themselves and everyone below — with `REACH_BASE` = 30 and `REACH_K` = 18 map units (a leaf sits 48 units from its sharer; Krist, subtree 16, sits 102 from Arielle before any fan move). Someone who shared with nobody sits close to their sharer; someone whose branch grew sits further out, so a big sharer's branch reads as a long limb: on Circles Ien → Arielle → Krist → Alexander is one limb, and Marcus, Jan and the two Evans stay close to Ien. K 16 first read Arielle → Krist about 20% shorter than the founder's sketch (85px / 104px at his desktop); the evening amendment asked for both limbs a tiny bit longer (targets ~95–100 / ~115–120): the first ring's radius is v4's, so its painted length is set by the base canvas — height 715 instead of 800 paints it at 95px — and K 18 is the value at which Circles settles with every name shown; Arielle → Krist then reads 155px at 10.5px names, past the ~115–120 target, because with lines whole and names moved beside their dots Arielle's seven need her fan 90 units further out (reported, not hidden).
3. **Within a fan,** siblings spread only as far as the clearance rules require — 6px between real rendered name boxes, name-vs-dot (a hollow dot's stroke included), name-vs-line — each adjacent pair's gap on its own; a fan is never wider than `FAN_MAX_SPAN` (~120°); if a fan cannot fit within that, the whole fan moves outward from its parent (`extra`, reported per node) until it does. Fans of different parents that would collide are separated by the LEAST MOVEMENT — each turns about its own parent, the two equally, damped, until the rule holds — never by changing anyone's distance rule. v4's "step out to the next level" is gone. **The triggers of a fan's outward move (`extra`) — every one "this fan cannot fit where it is", named so the founder can strike any (red-team finding, 10 September; two of the four went with the evening amendment):** (a) its own names need more than ~120°; (c) a sharer's branch is WEDGED between that sharer's own siblings and the outer fan has already spread to its cap — the outer fan moves, so the same angular gaps span more room. Nothing else changes a distance. On Circles the override is real: Krist's ten sit 48 + 150 units from him (trigger a), Arielle's seven 48 + 90, Alexander's five 48 + 30 — the reach ORDER inside every fan survives (Krist further from Arielle than her leaves; Alexander further from Krist than his). Every clearance rule of v4/v5 stays, measured on real rendered boxes. **LINES CONNECT DOT TO DOT (founder amendment, 10 September evening):** every segment runs from the centre of the parent's dot to the centre of the child's dot, full length, on every surface — no trimming, notching or clipping around a name, ever (the segment-clip rule and the Charles → Jacob clip fix are gone). A name still never sits on a line — six px clear of a line it is not attached to, never touching its own incoming or outgoing line — and the remedy is MOVING THE NAME, never the line: in order the outward side, the inward side, then above or below the dot (perpendicular to the limb, 16 to 52 units out — the smallest distance that clears), the side away from the node's own fan first (a person who shared onward has lines along both out and in by construction, so their name goes perpendicular — Arielle, Krist and Alexander in the sketch: name beside the dot, fan on the other side; the fan may lean away from the name up to the limit that keeps every child beyond the parent). Only when no side clears does the existing safety net hide the name until zoom or explore — recorded on the node (`hidden`) and in `plan.hidden`, and reported per film.
4. **One drawing on every surface.**

The generation rings are DROPPED: under the reach rule a radius means nothing. THE CANVAS is FITTED to the drawing (every name box and dot plus the film node, with room), never mirrored about the filmmaker: a reach drawing is lopsided by nature, and a mirrored canvas left half the reference view empty. A small drawing is centred inside the base 900×800 canvas.

**The drawing rules kept from v5 (founder, 10 September).**

- **The line law:** a SOLID line is a connection that has arrived (the recipient claimed); a DOTTED line is still in flight — the same fact as the dot at its end (every edge carries `arrived`). A viewer's thread is solid gold to YOU; their own in-flight invitations hang off YOU as dashed gold runs to hollow gold dots; everything else follows the same rule in grey.
- **"Nothing competes":** off-thread painted first, the thread last; the recede is PER ELEMENT (each off-thread person and segment carries `opacity`, nothing re-mounts on hover, the gold fade survives); an explored lineage paints at full strength while explored.
- **OFF-THREAD ON A VIEWER'S DASHBOARD IS FAINT — the pinned value:** the base greys are v4's (a line `LINE_ALPHA` = 0.16, a name 0.45, a dot 0.7) and the recede is `RECEDE_OPACITY` = 0.5, so a non-thread line paints at 0.16 × 0.5 = 0.08 alpha, a name at 0.225, a dot at 0.35 — exactly the live v4 look, NOT v5's half strength (v5 had raised the line to 0.5).
- **Lines never vanish:** every edge is a screen-pixel stroke (`vector-effect: non-scaling-stroke`, the dash in screen px) at least one device pixel wide at any zoom, its grey never below `LINE_ALPHA`; the 1:1 phone view reads as connected dots.
- **The Charles → Jacob clip fix:** a segment is trimmed around a name box adjacent to its end (within the label offset plus the gap), not only around a box containing the dot; a hollow dot's stroke counts as part of the obstacle (`PERSON_DOT_OBSTACLE_R`).
- **The cameras:** the creator's phone opens on the film and the whole first ring, centred on the filmmaker, at the legible scale (`firstRingFrame`); a viewer's phone opens on their thread as in v4 (`threadFrame`); every desktop opens on the whole graph; every surface has + / − / 1:1, pinch and drag; 1:1 = the whole graph fitted.

**Name size.** Names paint at the readability floor on every surface, against the map's TRUE scale: **10.5px** — under the evening amendment (lines dot to dot, names moved beside their dots) the largest size at which Circles settles with every name shown on both Circles-shaped trees (10.75 settles on the fixture alone; 11 hides Alexander; 11.5 hides Oliver). The founder's instruction: stop at the size, don't shrink the limb — so 11 → 10.5, and both sizes are reported.

**YOU's label never yields**, on any surface: it is always on, placed by the same rule as every other name (the layout measures the viewer's real name).

**Dense films.** When a film outgrows what its reference view can hold under the rules at the legible size, the layout reports it (`plan.settled = false`) and the map falls back to hiding the names that would touch, zoom revealing them — the existing safety net, and the ONLY whole-graph name policy (founder, 10 September: the opening view for large films is decided later, with real numbers). Measured on Circles' next realistic shares at 11px: Stacy sharing three, four quiet first-ring people sharing four each, and Krist's other nine sharing two each all fall back (at 9.5px the first two settle).

## 5c. One ground: ink (founder, 10 September 2026)

The founder liked the graph on pure ink (`#080c18`, the `ink` / `bg-page` token). The two extra shades that sat on it are gone from these surfaces: the constellation map box (`ConstellationMap.jsx`), the viewer dashboard's screening cards (`ViewerDashboardV5.jsx`) and the creator dashboard's film cards and its "Network impact" graph box (`Dashboard.jsx`) all sit on ink and keep their existing hairline borders; the graph modal's map is ink with its hairline. The map's + / − / 1:1 buttons (`bg-ink/80`) are unchanged. Login, Profile, Signup and ResetPassword fields that use `bg-card` are NOT in scope; `--color-ink-2` stays defined because `AboutModal`, `ShareLinkModal` and the dev emblem harness still use it. Nothing else moved: type, spacing, gold, table, controls.

---

## 6. Responsive spec

**< 900px** (single column — natural DOM order, no CSS reordering): masthead → player → rail → creed → story → footer.
- Shell `max-width: 44rem`.
- Breathing (mobile has no fold to win): masthead `padding-top: 1.75rem`, conditions `margin-top: 0.625rem`, grid `margin-top: 2rem`.
- **Player full-bleed**: `width: 100vw; margin-inline: calc(50% - 50vw)`. ⚠ This REQUIRES `overflow-x: hidden` on body (already present) — the pair travels together or the page scrolls sideways on scrollbar-gutter browsers.
- Rail: back to natural block flow (no flex centering), CTA `margin-top: 1.5rem` restored, whole cluster `max-width: 26rem` centered.
- Creed: single column, `row-gap: 2.75rem`.
- The grid's `display: contents` flattening in the replica is a replica mechanism — in React, just render the order conditionally.

**< 540px:** header centers the wordmark, the header dashboard link is hidden (footer covers phones), modal goes full-width with side borders dropped, scrim padding `0.5rem 0`. The app's existing phone fullscreen/rotate-on-play behavior is unchanged.

---

## 7. Copy ledger — every user-facing string and its status

"LOCKED" = original founder-approved verbatim, unchanged. "FOUNDER" = founder-authored/approved during this redesign, verbatim. "PENDING" = designed-in but awaiting the founder's explicit stamp — build it, flag it.

| String | Status |
|---|---|
| `deepcast` / `Your dashboard →` | LOCKED |
| `{film_title}` | per-film |
| `14 minutes. Headphones recommended.` | LOCKED (runtime dynamic) |
| `Tickets shared of {next_tier} goal` | FOUNDER (2026-07-25, replacing `Viewers reached of {next_tier} goal`) |
| `Milestones passed` | FOUNDER |
| `Pass it on` (CTA) | FOUNDER |
| ~~`This film passed through {chain_length} pairs of hands to reach you. You are its newest link — or its last.`~~ | WITHDRAWN by the founder 2026-09-09 (amendment 11) — the rule line no longer renders; replaced by the path (§3b item 6). `pairsOfHandsPhrase` in `handsChain.js` is dormant |
| The path's labels: first names uppercase · `{n} OTHERS` · `YOU` · `?` · `(FILMMAKER)` | FOUNDER design 2026-09-09 (§3b item 6; the collapsed label settled by the founder the same day — uppercase, no ellipsis marks, the names' size and grey) |
| The path's aria-label: `How this reached you: {stops joined by →}` | the founder's landing label; the joined sentence is the builder's — **PENDING** |
| The onward seat's labels: `{first name}` (one person) · `{n} PEOPLE` (two or more) | FOUNDER design 2026-09-09, second pass (§3b item 6, amendment 12 — the word is PEOPLE, never `1 PERSON`) |
| The onward seat in the aria-label: `… → you → {label}` with ` (not yet claimed)` appended while nobody has claimed | builder's wording — **PENDING** |
| Creed 1: `Films here spread by private invite and real humans only. No algorithms.` | FOUNDER |
| Creed 2: `This film won't reach anyone new, unless you pass it on.` | FOUNDER (`you` in accent) |
| Creed 3: `Share intentionally. Each ticket admits one person only.` | FOUNDER (second sentence revised 2026-07-25) |
| `Filmmaker · {filmmaker_name} · {filmmaker_location}` | FOUNDER (2026-07-25, replacing `From the filmmaker · {location}`; the sign-off `— {name}, director` is cut) |
| Story epigraph/body | per-film placeholder |
| Modal eyebrow: `Pass it on` | FOUNDER (2026-07-25; "Make an impact." cut) |
| `{n} invitations left.` | FOUNDER (2026-09-09 — the invitation/ticket split; was `{n} tickets left.`, the founder-directed whittle) |
| Charge: `Who needs to see this? Not anyone — the one it will matter to.` | FOUNDER (`needs` in accent) |
| `Their first name` (placeholder) / `Create their invitation` / `Copy their invitation link` | FOUNDER (2026-09-09 — the invitation/ticket split, replacing `Share it with them` / `Copy their ticket link` of 2026-07-25; the placeholder unchanged) |
| Reveal: `Here’s {recipient_name}’s invitation link — it admits one person only. Send it to them with why they came to mind.` | FOUNDER (2026-09-09; ONE shared rule for both share surfaces — `src/lib/revealSentence.js`; supersedes the PENDING 2026-07-23 line and the dashboard modal's own `…ticket. Deliver it with your own words…`) |
| `{n} invitations left. Who else needs it?` / `That was your last invitation for this film.` / `Who else needs it?` (unlimited) | FOUNDER (2026-09-09, `revealTicketsLine.js` — "Who else needs it?" alone unchanged; was `{n} tickets left…` / `That was your last ticket…`) |
| `Create another invitation` | FOUNDER (2026-09-09, replacing `Share another ticket` of 2026-07-25) |
| `See your impact →` | FOUNDER (2026-09-09, replacing the LOCKED `See where your ticket went →`) |
| Zero state: `You’ve used all your invitations for this film.` | FOUNDER (2026-09-09; was `You've shared all your tickets for this film.` 2026-07-25). The same constant (`NO_TICKETS_MESSAGE`) is the server's refusal on `create-link` AND on the legacy email `send` route — so the creator-only Upload/Profile forms and old `/i/:token` letters read it too (red-team note, unlisted but harmless) |
| First-name validation message | LOCKED (`firstNameRule.js`) |
| Lineage labels: real first names, `YOU`, `?` | by rule (§5) |
| ~~Rail lineage chain: first names, `(filmmaker)`, `you`, `Who’s next?`~~ | BUILT AND WITHDRAWN by the founder 2026-09-09 pending a design pass (§3b 5b); `(filmmaker)` lives on the landing chain |
| Story header link icons: `Instagram` / `Website` (aria-labels) | FOUNDER (2026-09-09 — two 16px inline-SVG links above the eyebrow, `src/components/FilmmakerLinks.jsx`, URLs in `src/content/filmStory.js`) |
| Comments heading: `Join the conversation` | FOUNDER (2026-09-09) |
| Comments placeholder: `Write a comment` | FOUNDER (2026-09-09) |
| `You’ll appear as {FirstName} · Ticket No. {n}` | FOUNDER (2026-09-09; the ticket segment absent when the claim has no number) |
| `Post` / `Reply` / `Remove` → `Confirm remove` (owner only; two clicks) | FOUNDER (2026-09-09) |
| Comment name line: `{NAME} · Ticket No. {n} · {relative time}` | FOUNDER (2026-09-09) |
| Relative times: `Just now` / `{n} minute(s) ago` / `{n} hour(s) ago` / `Yesterday` / `{n} days ago` / the date after seven days | FOUNDER examples 2026-09-09 (`2 hours ago`, `Yesterday`, `3 days ago`, numerals always); the under-a-minute `Just now`, the minute forms, and the date's day-month form (year only when it differs) are the builder's — **PENDING** |
| `One moment…` (Post, while busy) | reused from the share button |
| Failed post — empty: `Write something first.` · over the cap: `Comments are limited to 1,000 characters.` · rate-limited: `You’ve posted 10 comments in the last 10 minutes. Please wait a little.` | **PENDING** (built and flagged 2026-09-09; `src/lib/commentBody.js`, `server/commentRules.js`) |
| Failed post — server: `Something went wrong on our side. Please try again in a moment.` | reuses the approved error-state lines |
| Failed post — refusals a viewer could read inline: `This conversation belongs to the people who hold this film` (no claim on this film) · `That comment is no longer here` (reply to a removed comment) · `Film not found` · `Not authenticated` / `Invalid session` (the session lapsed) | **PENDING** (red-team finding 3, 2026-09-09; `server/commentRules.js`, `server/index.js`) |

Retired/removed copy (do NOT resurrect): the personalized constraint line ("Alex, this film reached you because Dan thought of you…" — see §9), "every one by hand", "Documentary short.", the synopsis line, the lineage caption, "One person, once." stamp, the share-suggestion line.

---

## 8. Dynamic variable registry

| Variable | Source | Where it renders |
|---|---|---|
| `shares_count` | film-wide non-void generated links (`filmSharesCount`; metric switch 2026-07-25) | count numeral; bar fill numerator |
| `next_tier` | ladder (§3b) | tier label; bar fill denominator |
| `crossed_tiers` | ladder | hallmarks row |
| `chain_length` / the hands | viewer's claim chain (`chainHands`) | the path (§3b item 6); the emblem's tail |
| `chain_names` | last `min(3, chain_length)` first names in the viewer's chain | lineage gold-path labels |
| `recipient_name` | the name typed into the form | lineage next-slot label (State 2); reveal copy |
| `tickets_remaining` | `ticketRules.js` (grant = 5, `INITIAL_CLAIMANT_TICKETS`) | count lines; stub dim states (newest-first) |
| ticket URL | ticket creation | the bare reveal link |
| `{film_title}`, runtime | film data | masthead |
| `{filmmaker_name}`, `{filmmaker_location}`, `{filmmaker_photo}`, story copy | film data | story section |

First names only, everywhere, always (platform display law).

---

## 9. README / product-decision amendments (update the design docs or someone will "fix" these backward)

1. The pass-it-on panel is NO LONGER always-open/docked — it is a modal opened by the rail CTA. Founder override of the original constraint.
2. Color emphasis inside copy lines is permitted in exactly three approved instances (§2). The blanket "one uniform type style" rule is amended, not deleted.
3. The trio/creed copy was shortened and revised by the founder (see ledger).
4. The personalized constraint line (`constraintLine.js`) is CUT from this page. **Personalization currently lives nowhere** — its designated future home is the claim/invitation flow (the page Maya opens), not the watch page. The lib stays; the surface moved.
5. `revealTicketsLine.js` output changed (pending stamp, §7).
6. The bar/goal display uses the word "goal" by explicit founder choice.
7. Everything else in the original constraints list still binds: bare link, ticket vocabulary, first-names-only, no gradients/grain, solid ink background, the Garamond double registration.
8. **FOUNDER REVERSAL, 5 September 2026 (recorded 9 September):** the §2 law ~~**No engagement-mechanic styling anywhere:** no pulsing, badges, red dots, percentage labels, confetti, urgency colors. Ever.~~ is replaced by **"reward, never extract"** with five tests — (1) would it exist if nobody ever came back; (2) does it invite or pressure; (3) is every number true; (4) is the bottom rung dignified; (5) does the wary person feel seen or watched. Streaks, urgency, loss framing, guilt, variable rewards, pull-back notifications, and comparison that shames stay banned. This is the founder's own reversal, in his words as summarised to the builder on 9 September; the framework it belongs to lives in Cowork's project docs and is summarised in `docs/PROJECT-BRIEF.md` ("5 September — the north star").

9. **FOUNDER ADDITION, 9 September 2026 — comments.** §3e adds "Join the conversation" below the story; the affordance law gains the in-place-action-as-bare-text amendment (§4b); the copy ledger gains its strings, the inline error messages PENDING the founder's stamp.
10. **FOUNDER DECISION, 9 September 2026 — the invitation/ticket vocabulary split**. The invitation is the act and the link you make; the ticket is the numbered seat the receiver holds — `Ticket No. {n}` stays everywhere it appears. Changed on this page: `Create their invitation`, the reveal sentence (now the one shared rule `src/lib/revealSentence.js` for both share surfaces), `Copy their invitation link`, `Create another invitation`, `See your impact →`, `{n} invitations left.`, `You’ve used all your invitations for this film.`, and `revealTicketsLine.js`. The viewer dashboard followed (`Invitations remaining` / `Invitations sent` / `Invitations you've sent` / `No invitations sent yet.` / the mobile identity line / `Copy their invitation link`), and — founder decision at the merge, 9 September — so did the CREATOR surfaces (`CreatorLinkPanel`: `Create their invitation` / `Copy their invitation link`; the people table's `Copy their invitation link`; `NetworkGraphModal`'s `No invitations sent yet.`). DELIBERATELY UNCHANGED: the rail label `Tickets shared of {goal} goal`, creed line 3 `Share intentionally. Each ticket admits one person only.`, every `Ticket No. {n}`, and the landing's `By private invitation only`. The 2026-07-25 vocabulary ruling ("ticket" the noun, "shared" the verb) is superseded on these strings and only these. Same day: the story header gained its two link icons (§3d); the rail's lineage chain (§3b 5b) was built in the same batch and WITHDRAWN by the founder on sight, pending a design pass — the CTA → rule-line spacing is unchanged.
11. **FOUNDER DECISION, 9 September 2026 — the rule line is REMOVED and the path takes its place.** The rail's rule line ~~`This film passed through {chain_length} pairs of hands to reach you. You are its newest link — or its last.`~~ (FOUNDER, 2026-07-23, with the approved `or its last.` emphasis) no longer renders anywhere; in its exact place — 1.25rem under "Pass it on", nothing else between — sits the path, the founder's canvas design of the same day (§3b item 6): the film's hands as one row of nodes, origin first with `(FILMMAKER)` beneath, collapsed beyond three, then `YOU`, then the hollow `?`. The approved copy-emphasis exceptions (§2) drop to two — `you` in creed 2 and `needs` in the charge. The earlier same-day lineage chain (5b) was the withdrawn first attempt; this is the design pass it waited for. Absent at depth 0, as the rule line was. The recorded slug-path baseline was re-recorded deliberately for it (stated in the spec file's header).
12. **FOUNDER DECISION, 9 September 2026 (evening) — the path after you share, and the poster from the cut that plays.** (a) The path's hollow `?` is the empty seat: once the viewer has created an invitation for this film, the seat becomes the people they shared with directly — one node, their first name or `{n} PEOPLE`, a single person hollow + dashed until they claim, solid + solid after, a group seat always solid (the founder's late amendment the same night: the count records the sharer's act, not an arrival) — and the path ends there (§3b item 6; branch `rail-onward`; the link route's new `onward` field). (b) The Circles player poster moves off the original upload to the LIVE cut at `time=5`, pinned explicitly by source id and time (§3a). The slug-path baseline holds without re-recording: a payload without `onward` renders exactly as before.
## 10. Adjacent product notes (out of scope here, but decided during this work)

- **Poster frames are mandatory** per film (Mux `poster`).
- **The film synopsis/logline belongs on the invitation page**, not the watch page (tried twice here, cut).
- **The dashboard owns the live share graph** — the reveal's "See where your ticket went →" is its front door; the lineage emblem is its preview.
- The `Mux accentColor` prop governs all player chrome; any future play-glyph color change is a prop change with full-chrome consequences.

## 11. Final self-checks before you call it done

1. Load with fonts present AND absent — the title must render italic in both (explicit `font-style: italic` on it).
2. 1440×900: creed band top edge visible without scrolling.
3. Rail cluster optically centered against the player; the path sits 1.25rem under the CTA on one line, never wrapping (collapsed middle beyond three hands).
4. Modal: open → focus in field; create → link visible with ZERO scrolling; Tab cycles through the reveal's buttons; Esc/scrim/×/focus-return all work; reduced-motion kills the rise.
5. Lineage: chain of 1, 3, and 47 all render correctly per the toggle table; long name truncates.
6. ~600px width: player edge-to-edge, no horizontal scroll; <540px: wordmark centered, modal edge-to-edge.
7. No Phoenix Light below 1rem anywhere; no muted beige on rail stats; no gold on any label; every 1px line is the shared hairline value; every button is a box, every nav link has an arrow.
