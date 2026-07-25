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
- **Garamond italic** = the film's and the platform's voice: film title, rule line, creed statements, the modal charge, reveal copy, input placeholder, the generated link, story epigraph and sign-off.
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

**⚠ The muted token caution:** `#a89f94` is a warm beige and reads *gold-ish* on ink. It was deliberately RETIRED from all rail stat labels, hallmark numbers, and the rule line during the redesign. It survives only in: the conditions line, eyebrows, tickets line, footer/header links, story sign-off. Rail/stat text uses **neutral warm-alpha grays** instead:

| Value | Used for |
|---|---|
| `rgba(221,221,221,0.9)` | modal reveal copy base (via existing class) |
| `rgba(221,221,221,0.8)` | tier label, milestones label pairs with 0.6, creed statements, charge base |
| `rgba(221,221,221,0.75)` | hallmark numbers, lineage name labels |
| `rgba(221,221,221,0.65)` | rule line text |
| `rgba(221,221,221,0.6)` | milestones "Milestones passed" label, reveal terms-tier items |

If these neutral grays spread further, promote `rgba(221,221,221,0.65)`-family to a proper token and have the muted-vs-neutral conversation app-wide.

**The gold law (strict):** accent gold appears ONLY as *act* or *mark*:
- Acts: the "Pass it on" CTA (solid fill), "Create their invitation" / "Create another invitation" (gold outline), the tier bar's fill, input focus underline, hover states.
- Marks: ticket stubs, ✦ hallmarks, creed mark glyphs, the lineage's gold path/nodes.
- Approved copy-emphasis exceptions (the ONLY colored words inside copy lines — this overrides the old README's "one uniform type style" rule, founder-approved): `"or its last."` in the rule line, `"you"` in creed line 2, `"needs"` in the modal charge.

Gold never appears on labels, eyebrows, or informational text. No pure `#fff` or `#000` in UI (the player well's black is the video surround, not UI).

**No engagement-mechanic styling anywhere:** no pulsing, badges, red dots, percentage labels, confetti, urgency colors. Ever.

---

## 3. Page structure (desktop ≥900px)

Top to bottom:

1. **Header** — wordmark `deepcast` (Phoenix 600, 1.5rem, lowercase, warm @0.9) top-left; `Your dashboard →` link top-right (whisper caps, muted, warm on hover). `justify-content: space-between`.
2. **Masthead** (full-width, centered): film title in Garamond, `font-style: italic` set EXPLICITLY (safe due to double registration; also makes font-fallback italicize), `clamp(1.5rem, 2.2vw, 1.75rem)`. Beneath: the conditions line — headphones glyph + `14 minutes. Headphones recommended.` — 10px caps, 0.26em tracking, muted. Runtime is per-film (`screeningConditions.js` + `runtime.js`). Nothing else in the masthead. (A film-type suffix and a synopsis line were both tried here and REMOVED — do not add them.)
3. **Hero grid**: shell `max-width: 80rem`, padding-inline `clamp(1rem, 4vw, 3rem)`. Grid: `minmax(0,1fr) 24rem`, `column-gap: 3.5rem`, `align-items: stretch`. Left = player. Right = the rail.
4. **Creed band** (full-width): hairline rules top and bottom, three columns, `column-gap: 4rem`.
5. **Story** — its own centered region below the band, `max-width: 42rem`, internally left-aligned.
6. **Footer** — centered `Your dashboard →`.

The trio band's top edge must crest inside a 1440×900 viewport (it lands ~600px with these values). If any future change pushes it below ~730px, that's a regression.

### 3a. The player
The Mux player (`@mux/mux-player-react`), 16:9, **flat on ink — no drop shadow**. `accentColor="#b1a180"` prop (note: this colors ALL Mux chrome — play, scrubber, buffered bar).

**⚠ Poster frames are mandatory product policy from this redesign:** every film must ship a `poster` still. A black pre-play well is not acceptable in production; it distorted design judgment throughout this process and will do worse to viewers.

### 3b. The rail (the record, the act, the law)
A single left-aligned cluster, **vertically centered against the player**: `.rail { display:flex; flex-direction:column; justify-content:center; height:100% }` inside the stretched grid column. **FOUNDER AMENDMENT 2026-07-23 — optical lift: the centered flex additionally carries `padding-bottom: 2.5rem` (desktop only), so the cluster's mass sits a touch above geometric center; verified with the milestones block present AND absent.** ⚠ This centering is currently "against the grid row," which equals the player only because nothing else is in the left column. If anything is ever added below the player, the rail must center against the **player's box specifically** — implement accordingly (e.g., measure the player, or keep the left column player-only).

Internal order and spacing (two-tier rhythm: tight *within* a fact, wide *between* facts, widest before the act):

1. **The tier bar** — 2px track (`--tint-track`), squared ends (no border-radius, ever), fill in **solid accent**. Fill width = `shares_count / next_tier` as a percentage (847/1000 → 84.7%), set inline/computed. The bar ALWAYS shows progress toward the NEXT tier only. **FOUNDER METRIC SWITCH 2026-07-25: the counted number is TICKETS SHARED (film-wide non-void generated links, `filmSharesCount`, shared rule `countFilmShares`), replacing the claims count. The ladder itself is unchanged — 100 stays the first rung.**
2. `margin-top: 1.125rem` → **the count**: `{shares_count}` — Phoenix 600, 2.25rem, warm, `letter-spacing: 0.01em`, line-height 1.
3. `margin-top: 0.5rem` (bonded) → **the label**: `Tickets shared of {next_tier} goal` → renders `TICKETS SHARED OF 1,000 GOAL` — Phoenix 400, 0.8125rem, caps, 0.18em, warm@0.8. Number formatted with comma. (Was `Viewers reached of {next_tier} goal` until the 2026-07-25 metric switch.)
4. `margin-top: 1.75rem` → **`Milestones passed`** (Phoenix 400, 0.8125rem, caps, 0.18em, warm@0.6) and `margin-top: 0.5rem` → the **hallmarks**: `✦ 100   ✦ 250   ✦ 500` — 0.8125rem, 0.14em, numbers warm@0.75, ✦ in accent@0.5. **FOUNDER AMENDMENT 2026-07-23: NO interpunct separators — the groups are separated by spacing alone (~1.25em gap). Do not restore the dots.** Renders every crossed tier (`crossed_tiers`).
5. `margin-top: 2.25rem` (the column's widest gap — the act keeps its isolation) → **the CTA**: `Pass it on` — full rail width, min-height 52px, **solid accent fill, ink text**, caps 0.8125rem/0.28em, border same accent as fill (seamless hover). Hover: fill/border to `rgba(177,161,128,0.88)`. Focus-visible: 1px accent outline, 3px offset. This is the page's ONLY solid-filled object. Opens the modal.
6. `margin-top: 1.25rem` → **the rule line**: `This film passed through {chain_length} pairs of hands to reach you. You are its newest link — or its last.` Garamond italic, **1rem (FOUNDER AMENDMENTS 2026-07-23 — raised twice from the replica's 0.875rem, via 0.9375rem; the HTML does NOT win on this one value)**, line-height 1.6, warm@0.65, left-aligned, with `or its last.` in accent. In the markup, bind the dash and closing clause with `&nbsp;` so `— or its last.` never strands at a line start. A chain of 1 reads `1 pair of hands` — singular, numeral kept (owner-approved 2026-07-23).

**The tier ladder (fixed):** 100 / 250 / 500 / 1,000 / 2,500 / 5,000 / 10,000 / 25,000 / 50,000 / 100,000 / 250,000 / 500,000 / 1,000,000. `next_tier` = the smallest ladder value > `shares_count`. `crossed_tiers` = all ladder values ≤ `shares_count`. Numerals always; NO percentages displayed anywhere; no countdowns; no goal-met celebration states.

⚠ The `✦` glyph (U+2726) may not exist in Phoenix — verify the rendered glyph; if the system substitutes badly, replace with a tiny inline SVG four-point star matching the `.hm` sizing.

### 3c. The creed band
Three centered columns, each: a small gold mark (accent, opacity 0.45, in a fixed-height flex slot so the text rows stay level) above a Garamond-italic statement (**1.125rem — FOUNDER AMENDMENT 2026-07-23, up from the replica's 1.0625rem**, line-height 1.7, warm@0.8, max-width 22rem). Marks, left to right (all in the replica, copy exactly):
1. **The hand-off**: two solid nodes, one flat horizontal line.
2. **The fan**: two solid nodes, then three lines fanning right to three HOLLOW nodes (node grammar: solid = arrived, hollow = possible — same grammar as the lineage).
3. **The ticket stub** (the original stub path).

### 3d. The story
`From the filmmaker · {filmmaker_location}` eyebrow (11px caps, 0.32em, **muted**) with a **3.5rem circular photo frame** to its left (`.story-byline`: flex, `align-items: flex-end`, 1rem gap; eyebrow gets `padding-bottom: 0.3125rem` optical lift so the caps sit on the circle's base). The circle is 1px hairline border + `--tint-track` fill — swap in the filmmaker's `<img>` (`{filmmaker_photo}`), keep the frame. Then: serif-italic epigraph (`clamp(1.25rem, 2vw, 1.4375rem)`, warm@0.9), body paragraphs in **Phoenix Light 300, 1.0625rem, line-height 1.85, warm@0.82, max-width 62ch, left-aligned** (the ONE place Light is correct), sign-off in serif italic muted: `— {filmmaker_name}, director`. Story copy is per-film.

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
4. `{tickets_remaining} tickets left.` — whisper caps line (0.75rem/0.24em, muted).
5. **The charge**: `Who needs to see this? Not anyone — the one it will matter to.` — Garamond italic, **1.125rem (FOUNDER AMENDMENT 2026-07-23, up from the replica's 1.0625rem)**, warm@0.8, with `needs` in accent. Bind `anyone — the` with `&nbsp;` before the dash.
6. **The form**: input (centered text, hairline bottom border warm@0.2 → accent on focus; placeholder `Their first name` in serif italic warm@0.4; sr-only label; maxlength 50) and the button `Create their invitation` (gold outline: border accent@0.6, accent text, caps 0.8125rem/0.28em, min-height 48px; hover/focus fills accent with ink text). Name validation errors render inline in `--color-error` between input and button (`firstNameRule.js`) — state not shown in replica but carried over from the original.

### 4b. State 2 — after creating a ticket (THE REPLACEMENT MODEL)
⚠ Post-creation, the modal **transforms — it does not grow**. The charge line and the form are REPLACED by the reveal, so the link renders where the field was: **no scrolling required to see the ticket link**. The lineage updates (§5), the stubs dim one more, the count line updates. Full State-2 order:

1. Eyebrow (unchanged)
2. Lineage — the `?` slot now shows the recipient's name, node **stays hollow** (ticket sent, not yet claimed)
3. Stubs — one more dimmed
4. `{tickets_remaining} tickets left.` (decremented)
5. **The reveal** (rises in with `.dc-result-rise`; hairline top rule, `padding-top: 1.75rem`):
   - `Here's {recipient_name}'s ticket link. Send it to them with why they came to mind.` — serif italic 1.0625rem warm@0.85
   - **The bare link** — serif, `clamp(1.1875rem, 3vw, 1.4375rem)`, paper@0.9, `word-break: break-all`. Handed over BARE — no pre-written message, ever (product law).
   - `Copy their invitation` — warm-outline button (border warm@0.2, warm text; accent border/text on hover), min-height 44px. Copies the link.
   - `1.75rem` → `{tickets_remaining} tickets left. Who else needs it?` — whisper caps, muted
   - `0.875rem` (bonded) → **`Create another invitation`** — a GOLD-OUTLINE link-button (same affordance family as the form's create button: border accent@0.6, accent text, fills gold on hover, min-height 44px, caps 0.6875rem/0.26em). Action: swap the form state back in — field cleared, charge line restored. The modal cycles.
   - `2rem` (separated) → `See where your ticket went →` — muted arrow-link, warm on hover. Destination: the dashboard (the live share graph — the "big reveal" lives THERE, deliberately last as the exit).

**The affordance law (why the above looks the way it does):** on this page, **a box means "act here"; an arrow means "go there."** Buttons are outlined or filled rectangles; navigation is a text link with `→`. Never style an action as bare text and never put an arrow on an in-place action.

**Zero state** (all tickets spent — from the original app, keep it): the count line + form are replaced by `You've shared all your tickets for this film.` (verb revised 2026-07-25); stubs remain, all dimmed. Apply the same replacement model.

**Count collision (resolved by design):** the top count line and the reveal's `…tickets left. Who else needs it?` would state the count twice in State 2. Per the design, in State 2 the reveal's line is authoritative — hide the standalone top count line OR accept the echo; preferred: hide it post-creation.

---

## 5. The lineage graph — geometry template + dynamic names

A `<figure>` in the modal, `max-width: 25rem`, full-width SVG `viewBox="0 0 400 160"`, `aria-hidden="true"` (the rule line in the rail carries the accessible fact). **The geometry is a FIXED, hand-composed template — identical for every viewer of every film. Only the text labels (names) and element visibility are dynamic.** This is a string-substitution render; no layout engine.

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
| 4+ hands (any depth) | exactly 3 named predecessors + entry stroke; the rule line's `{chain_length}` carries the true number |
| Forks/canopy | per-hand booleans, as above |

**Name length:** labels cap at ~8 characters (truncate with a mid-dot, or ease tracking per-label). VERITY fits; ALEXANDRA collides with YOU if unhandled.

**INTERIM (owner direction 2026-07-23, pending the sparse-composition design-ref):** for chains SHORTER than 3, the rendered constellation group (gold path, nodes, labels, forks, the next slot) is horizontally centered in the 400×160 canvas by a pure translate of the fixed geometry — no new composition, no new elements; the far-field dots stay put (full-canvas atmosphere). Full chains keep the replica's exact placement. The sparse state's real redesign arrives as a design-ref update and replaces this translate.

**Adjacent product note:** the LIVE, full share graph (real topology, interactive) is the DASHBOARD's feature, reached via "See where your ticket went →". This emblem is its fixed preview. Do not attempt live topology here.

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
| `This film passed through {chain_length} pairs of hands to reach you. You are its newest link — or its last.` | FOUNDER (emphasis on `or its last.` approved) |
| Creed 1: `Films here spread by private invite and real humans only. No algorithms.` | FOUNDER |
| Creed 2: `This film won't reach anyone new, unless you pass it on.` | FOUNDER (`you` in accent) |
| Creed 3: `Share intentionally. Each ticket admits one person only.` | FOUNDER (second sentence revised 2026-07-25) |
| `From the filmmaker` (+ ` · {filmmaker_location}`) | FOUNDER |
| Story epigraph/body/sign-off | per-film placeholder |
| Modal eyebrow: `Pass it on` | FOUNDER (2026-07-25; "Make an impact." cut) |
| `{n} tickets left.` | founder-directed whittle (was the longer tickets line) — treat as approved |
| Charge: `Who needs to see this? Not anyone — the one it will matter to.` | FOUNDER (`needs` in accent) |
| `Their first name` (placeholder) / `Create their invitation` / `Copy their invitation` | LOCKED |
| Reveal: `Here's {recipient_name}'s ticket link. Send it to them with why they came to mind.` | **PENDING** |
| `{n} tickets left. Who else needs it?` | **PENDING** (replaced locked `…Who else comes to mind?`) |
| `Create another invitation` | **PENDING** |
| `See where your ticket went →` | LOCKED |
| Zero state: `You've shared all your tickets for this film.` | FOUNDER (verb revised 2026-07-25; was LOCKED "given") |
| First-name validation message | LOCKED (`firstNameRule.js`) |
| Lineage labels: real first names, `YOU`, `?` | by rule (§5) |

Retired/removed copy (do NOT resurrect): the personalized constraint line ("Alex, this film reached you because Dan thought of you…" — see §9), "every one by hand", "Documentary short.", the synopsis line, the lineage caption, "One person, once." stamp, the share-suggestion line.

---

## 8. Dynamic variable registry

| Variable | Source | Where it renders |
|---|---|---|
| `shares_count` | film-wide non-void generated links (`filmSharesCount`; metric switch 2026-07-25) | count numeral; bar fill numerator |
| `next_tier` | ladder (§3b) | tier label; bar fill denominator |
| `crossed_tiers` | ladder | hallmarks row |
| `chain_length` | viewer's claim chain depth | rule line |
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

## 10. Adjacent product notes (out of scope here, but decided during this work)

- **Poster frames are mandatory** per film (Mux `poster`).
- **The film synopsis/logline belongs on the invitation page**, not the watch page (tried twice here, cut).
- **The dashboard owns the live share graph** — the reveal's "See where your ticket went →" is its front door; the lineage emblem is its preview.
- The `Mux accentColor` prop governs all player chrome; any future play-glyph color change is a prop change with full-chrome consequences.

## 11. Final self-checks before you call it done

1. Load with fonts present AND absent — the title must render italic in both (explicit `font-style: italic` on it).
2. 1440×900: creed band top edge visible without scrolling.
3. Rail cluster optically centered against the player; rule line's `— or its last.` never alone-wrapped.
4. Modal: open → focus in field; create → link visible with ZERO scrolling; Tab cycles through the reveal's buttons; Esc/scrim/×/focus-return all work; reduced-motion kills the rise.
5. Lineage: chain of 1, 3, and 47 all render correctly per the toggle table; long name truncates.
6. ~600px width: player edge-to-edge, no horizontal scroll; <540px: wordmark centered, modal edge-to-edge.
7. No Phoenix Light below 1rem anywhere; no muted beige on rail stats; no gold on any label; every 1px line is the shared hairline value; every button is a box, every nav link has an arrow.
