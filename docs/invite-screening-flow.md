# Invite Screening Flow

## 0. Cold Start — Render Server Wake-Up

On first load the Render backend may be asleep. The invite page handles this automatically:

| Attempt | Delay | Action |
|---------|-------|--------|
| 1 | Immediate | Try `validateInvite` |
| 2 | +2 s | Retry on network error |
| — | — | **Auto page reload** (wakes Render) |
| 3 | +2 s | Retry after reload |
| 4 | +2 s | Retry |
| — | — | **Auto page reload** again if still failing |

No user action needed. The page reloads itself up to twice while the server wakes. If all retries fail the "Can't reach the server" error is shown.

## 1. Landing (Portrait Mobile)

- Page opens full-screen (`min-h-[100dvh]`), network graph fills the background.
- Welcome prologue fades in: "A thoughtfully curated film experience for {recipient}, gifted by {sender}."
- After prologue fades, landing appears: ordinal position, Deepcast wordmark, "Open your invitation" CTA.

## 2. Open Your Invitation

- User taps **"Open your invitation"**.
- On mobile portrait: rotation gate activates — user is prompted to rotate to landscape.
- Once landscape: `requestFullscreen()` is called, pre-screening prologue plays (~11s cinematic text).
- Prologue fades out → screening view mounts underneath → `mux-player` autoplays.
- On iOS: native video fullscreen (`webkitEnterFullscreen`) is used instead of document fullscreen.

## 3. Screening (Fullscreen Video)

- Film plays **fullscreen** from the moment it starts and stays fullscreen until the user pauses.
- **"Now Screening" + film title** appear top-left on play start, fade after **5 seconds**.
- Title reappears (resets) whenever playback resumes from pause.
- If autoplay is blocked by the browser, a **"Tap to play the film"** overlay appears.

## 4. Pause → Pass It On (Portrait)

- User pauses the film mid-playback (after meaningful progress > 0.01s).
- On narrow viewports (< 1024px): fullscreen is exited, **Pass it on** overlay slides in.
- Layout (portrait):
  - **Top:** "Pass it on." heading + description
  - **Middle:** Letter of Invitation form (recipient name, note, email, sender name/email)
  - **Bottom:** Network graph — partially visible, user scrolls down to see it
- Network graph background matches the global dark background (`#080c18`).
- A **"Resume Film"** bar is pinned at the top of the overlay.

## 5. Resume Film

- User taps **"Resume Film"** → fullscreen restored, playback continues from current position.
- Pass it on overlay dismisses, film title resets its 5s fade timer.

## 6. Film Ends

- `handleEnded` fires → `isScreeningPaused = true`, fullscreen exited on narrow viewports.
- **Logged-in user (recipient session):** navigated to `/dashboard` immediately.
- **Guest:** Thank-you screen shown ("Thank you for watching. {recipient}, this screening was held for you.") with a **Continue** button → Pass it on form.

## 7. Pass It On → Send

- Guest fills in recipient details and sends a letter invitation.
- On success: navigated to the dashboard view within the screening page.
- Viewer invite allocation is replenished for the sender every 3 completed watches.

## 8. Dashboard (post-send / logged-in)

- Shows network graph of the invite chain including the viewer's own outgoing invites.
- Watch again / Resume options available.
