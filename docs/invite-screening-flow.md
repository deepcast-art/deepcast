# Invite Screening Flow

## 0. Cold Start — Render Server Wake-Up

On first load the Render backend may be asleep. The invite page handles this automatically:

| Attempt | Delay | Action |
|---------|-------|--------|
| 1 | Immediate | Try `validateInvite` + fire `/api/health` preflight ping |
| 2 | +1 s | Retry on network/502/503 error |
| 3 | +2 s | Retry |
| 4 | +4 s | Retry |
| 5 | +8 s | Final retry |

No page reload. After 3 s a "Still connecting…" message appears. If all retries fail, the "Can't reach the server" error is shown with a **Try again** button.

---

## Mobile Flow (< 1024px)

### 1. Landing

- Page opens full-screen (`min-h-[100dvh]`), network graph fills the background (`MobileLanding`).
- Welcome prologue fades in: "A thoughtfully curated film experience for {recipient}, gifted by {sender}."
- After prologue fades, landing appears: ordinal position, Deepcast wordmark, **"Open your invitation"** CTA.

### 2. Open Your Invitation

- User taps **"Open your invitation"**.
- Portrait: rotation gate activates — user is prompted to rotate to landscape.
- Once landscape: `requestFullscreen()` is called, pre-screening prologue plays (~11s cinematic text).
- On iOS: native video fullscreen (`webkitEnterFullscreen`) is used instead of document fullscreen.
- Prologue fades out → `mux-player` autoplays in fullscreen.

### 3. Screening (Fullscreen Video)

- Film plays **fullscreen** from the moment it starts and stays fullscreen until the user pauses.
- **"Now Screening" + film title** appear top-left on play start, fade after 5 s.
- Title reappears whenever playback resumes from pause.
- If autoplay is blocked, a **"Tap to play the film"** overlay appears.

### 4. Pause → Pass It On

- User pauses mid-playback (after > 0.01 s of progress).
- Fullscreen exits, **Pass it on** overlay fills the screen (`MobilePassItOn`).
- Layout:
  - Portrait: heading → letter form → network graph (scroll down)
  - Landscape: left col (heading + graph) | right col (letter form)
- A **"Resume Film"** bar is pinned at the top (portrait only).

### 5. Resume Film (Mobile)

- User taps **"Resume Film"** → fullscreen restored, playback continues.
- Pass it on overlay dismisses, film title resets its 5 s fade timer.

### 6. Film Ends (Mobile)

- `handleEnded` fires → fullscreen exits.
- **Logged-in recipient session:** navigated to `/dashboard` immediately.
- **Guest:** Thank-you screen shown with a **Continue** button → Pass it on form.

---

## Desktop Flow (≥ 1024px)

### 1. Landing

- Two-column sticky layout (`DesktopLanding`):
  - Left col (50%, sticky): Deepcast wordmark + **"Open your invitation"** CTA.
  - Divider line.
  - Right col (50%): ordinal count header + network graph (scrollable).

### 2. Open Your Invitation (Desktop)

- User clicks **"Open your invitation"**.
- Pre-screening prologue plays as a full-screen text overlay (~11s).
- Prologue fades out → film plays **inline** (not fullscreen — desktop always plays in the screening room overlay, never native fullscreen).

### 3. Screening (Inline Video, Desktop)

- Film plays inline inside the `fixed inset-0` screening room.
- **"Now Screening" + film title** appear top-left, fade after 5 s.
- User can pause by clicking on the video.

### 4. Pause → Desktop Pause Bar

- User pauses the film.
- A **pause bar** appears at the bottom of the screen with two options:
  - **▶ Resume Film** — continues playback.
  - **Pass it on** — navigates to the pass-it-on overlay.

### 5. Pass It On (Desktop)

- Clicking **"Pass it on"** in the pause bar sets `desktopPassItOnActive = true`.
- The pass-it-on diptych (`DesktopPassItOn`) fills the screen:
  - Left col (40%): **"Resume Film"** link (mid-film only) + shares-remaining count + "Pass it on." heading + description + network graph.
  - Divider.
  - Right col (60%): Letter of Invitation form (paper card).
- Clicking **"Resume Film"** in the left col clears `desktopPassItOnActive` and resumes inline playback.

### 6. Film Ends (Desktop)

- `handleEnded` fires → pass-it-on overlay shown with `showPostFilm = true`.
- Left col heading changes to **"Thank you for watching."** with a dashboard link.
- **Logged-in recipient session:** navigated to `/dashboard` immediately.
- **Guest:** Thank-you screen shown with a **Continue** button → Pass it on diptych.

### 7. Pass It On → Send (Both Platforms)

- User fills in recipient details and sends a letter invitation.
- On success: navigated to the in-page dashboard view.
- Viewer invite allocation is replenished for the sender every 3 completed watches.

### 8. Dashboard (post-send / logged-in)

- Shows network graph of the invite chain including the viewer's own outgoing invites.
- Watch again / Resume options available.

---

## Component Map

| Component | Renders for |
|-----------|-------------|
| `MobileLanding` | Mobile landing page (< 768px `isDesktop`) |
| `DesktopLanding` | Desktop landing page (≥ 768px `isDesktop`) |
| `MobilePassItOn` | Pass-it-on on mobile / tablet (< 1024px, `lg:hidden`) |
| `DesktopPassItOn` | Pass-it-on on desktop (≥ 1024px, `hidden lg:flex`) |
