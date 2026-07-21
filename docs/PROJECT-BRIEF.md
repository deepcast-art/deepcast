# Deepcast — Project Brief

*Written 22 July 2026, the night the redesigned dashboard shipped. For strategic advisors: decisions and reasoning, not implementation.*

## What Deepcast is

Deepcast optimizes for depth over reach. It is an invite-only network where substantive films spread through trusted relationships — no feed, no algorithm, no public link. A film travels only because one person chose one other person and handed them a ticket; trust built person to person carries it through trusted networks toward deep impact and resonance. Deepcasting, not broadcasting. Depth is the heart of the platform — the tickets, the constellation, and invite-only itself all exist to serve it. Founded and built by Ien Chi, a filmmaker who helped grow a YouTube channel to five million subscribers and a billion views, and watched platform incentives bend everything toward clickbait; Deepcast is the counter-bet.

## The product tonight (live)

Two films are live: **The New Narrative** (the designated test film) and **A Sacred Pause** (public-facing, directed by Jon Bregel). Every user — whether they signed up months ago or claimed a ticket five minutes ago — sees the same dashboard: their name and ticket number, tickets remaining and given, a one-line journey sentence, a "constellation" star map of the film's whole network with their own gold path through it, the list of tickets they've shared, and the full menu (About, Contact, name edit, sign out). Sharing happens by generating a personal link for one named person. Claiming that link with an email is the entire onboarding: it creates the account, signs the person in, and seats them in the film — no password, no confirmation email, no second step.

## Decisions made, and why

- **Shares are custom unique links, not emails.** The sender types only a first name and gets a link to deliver personally — the delivery *is* the human moment. The old email-invite system is retired (links already sent keep working forever; nothing new is created by it).
- **Every ticket has a permanent number.** Numbers are per film, issued in the order links are created, and **immutable**: a deleted ticket leaves a gap forever, and nothing ever renumbers. Reasoning: a ticket number is an artifact — "I was №7" only means something if it can never be reshuffled. **The filmmaker always holds №1** on their own film (stored, and shown on the creator's film cards; the constellation itself displays no numbers); invitees start at №2. Current holders: A Sacred Pause — Jon №2; The New Narrative — Trace №2, Austin №3, Tina №4, Georgie №5.
- **Claiming signs you in.** A new claimant becomes a full signed-in user instantly. Security boundary held deliberately: instant sign-in happens only when the claim just *created* the account — typing an email can never open an account that already exists.
- **One claim per person per film.** Claiming a second ticket to a film you already hold voids that link, automatically returns the sender's ticket, and tells you, verbatim: *"You already hold this film."* The sender's list keeps the row as history: *"Already held this film — ticket returned."* Reasoning: people are people, not rows — a person should exist once in the network, and a sender shouldn't pay for a duplicate.
- **One definition of "who exists."** Every surface — the star map, the counts, the ticket lists, the admin view, the numbering — reads a single shared rule for which tickets are real. Voided tickets count nowhere; the fifty seeded demo "ghosts" per film appear only on the filmmaker's admin surfaces and are never numbered. Reasoning: the surfaces once disagreed (a removed person still haunting a count), and the fix was structural, not case-by-case: new surfaces must read the shared rule, never invent their own.
- **The journey sentence counts your whole downstream.** *"This film has reached [X] people. [Y] of them received it because of you."* — where Y includes your invitees' shares, and theirs, to any depth, so your number grows when the film travels beyond you. With nothing shared yet: *"This film has reached [X] people. Grow that number by sharing the film."* Numbers are always numerals. (This deliberately counts tickets issued, not tickets watched — the older "reach" stat that counts only opened invites survives on legacy surfaces; the difference is documented, not accidental.)
- **Copy, approved verbatim:** the sidebar aside — *"This film reached you because someone thought of you. No algorithm, no feed. Films here spread by private invite & real humans only."*; the tickets heading *"Tickets you've shared"* with empty state *"No tickets given yet."*; ticket statuses *Unopened / Opened / Watched / Shared to N people*; the first-name box refuses emails with *"Just their first name — no email needed."*; an email address is never displayed as a person's name (the placeholder is *"Someone"*).
- **Texture choices:** the film-grain overlay was removed — the dashboard sits on the same solid near-black the watch page uses. The star map is draggable immediately and zooms at the pointer.

## The people

Real people on the network: **Ien** (founder/filmmaker), **Jon** (director of A Sacred Pause), **Trace, Tina, Austin, Georgie**. Everything else ever created was test data and was removed in the July 20–22 cleanup.

## Parked (approved, waiting — do not re-debate)

- **Ticket expiry refund:** after 14 days unclaimed, the sender's ticket returns automatically; the link itself never dies, and a late claim never re-charges. Notice to the sender, verbatim: *"Your ticket for [name] was returned — the invitation stays open if they ever come to it."*
- **Unifying the constraint-line wording:** the share surfaces still say "…pass through human hands only."; the sidebar says "…spread by private invite & real humans only." One of them will win, on Ien's word.
- **Server region move** (Oregon → Virginia, closer to the database): approved direction, unscheduled.
- **Session-based duplicate detection:** if a signed-in user merely opens a claim link for a film they already hold, treat it as a duplicate immediately — recognition message, void the link, refund the sender — extending the existing duplicate machinery with a second trigger. Detecting duplicates by IP address or by name was considered and explicitly rejected: false positives, and a membership privacy leak.

## How the work runs

Ien (non-technical) directs; an AI coding agent builds. The rules that keep that safe: the agent **commits but never pushes** — Ien pushes, and production deploys from that; **no production change of any kind** — migration, data write, anything — **without Ien's explicit approval in that session** (a permissions prompt is not approval; the agent stops mid-task and asks in plain English); diagnose before fixing, one logical change per commit, every commit verified by the full test suite before it lands. Testing happens only on The New Narrative — A Sacred Pause never receives test data — and a local test run writes to the real production database, so a "test" claim mints a real, permanent ticket number.
