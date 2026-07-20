# Ticket expiry refund — APPROVED SPEC, NOT YET BUILT

**Status: parked.** Decided by Ien on 2026-07-21. This is settled product
design — do not re-debate it in future sessions; build it as written when
it is scheduled.

## The rule

- After **14 days unclaimed**, the sender's ticket is **automatically
  refunded** (their per-film balance goes up by one; their "given" count
  goes down by one).
- **The link itself never dies.** A late claim still works at any time —
  invite links never expire (existing standing rule) — and a late claim
  does **not** re-charge the sender.
- The refund arrives with a gentle notice to the sender, verbatim:

  > "Your ticket for [name] was returned — the invitation stays open if
  > they ever come to it."

## Notes for the future builder

- This is a refund of the ticket ECONOMY only; nothing about the link's
  claimability, slug, or ticket number changes. Ticket numbers are
  immutable (CLAUDE.md): the link keeps its number through refund and any
  late claim.
- Unlimited-ticket senders have no balance to refund — skip the
  arithmetic, but the notice may still be sent (builder's judgment with
  Ien's approval on copy delivery).
- No scheduling infrastructure exists yet. The decided delivery shape for
  timed work (from the B3 reminder-email item) is: ONE authenticated
  internal endpoint + ONE external daily cron, all email through the
  `deliverEmail` dispatcher.
- Relationship to the duplicate-claim rule (built 2026-07-21): a claim
  refused because the email already holds the film VOIDS the link and
  refunds immediately — that path is live. Expiry refund differs: the link
  stays claimable forever; only the ticket comes back after 14 quiet days.
