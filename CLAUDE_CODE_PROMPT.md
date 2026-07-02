# CineWatch EC — Claude Code project prompt

Paste everything below into Claude Code in your project folder (after unzipping the scaffold)
to pick up where this chat left off.

---

## Project context

I'm building **CineWatch EC**, a personal mobile-first PWA that solves a specific problem: I
love going to the movies in Quito, Ecuador, but I don't want to pay full price right after
release — I prefer waiting ~2 weeks for "cheap day" pricing ($2.60 on weekdays). The problem is
I forget which movies I wanted to watch and when they become cheap. This app tracks that for me.

**Core mechanics:**
- Movies come from a live feed (TMDB API, filtered to Ecuador release dates) — I never manually
  add a movie, I just browse confirmed releases and tap to track one
- For each movie I track, I choose one of two modes:
  - **Watch on release** — I want to go opening week, full price
  - **Wait for cheap day** — I'll wait; the app should tell me once it's past the 2-week mark
- I need **real push notifications**, including on iOS, that fire even when the app/phone is
  closed — not just in-app badges

**Key constraint discovered during planning:** iOS only supports Web Push for PWAs installed to
the Home Screen via Safari (iOS 16.4+), never inside a regular browser tab. Real push requires a
backend that stores subscriptions and sends notifications via a daily scheduled job — it can't be
a fully client-only app.

**Architecture decided on:**
- Frontend: single-page PWA (vanilla HTML/CSS/JS, no framework) with a "ticket stub" / cinema
  marquee visual identity (warm near-black background, marquee gold accent, jade-teal for
  "cheap day ready" status, Bebas Neue display font for marquee-style headers, IBM Plex Mono for
  dates/countdowns)
- Data source: TMDB API (`/discover/movie?region=EC&with_release_type=2|3...`), free for
  non-commercial use, requires the user's own free API Read Access Token
- Backend: Netlify Functions
  - `save-state.js` — stores the push subscription + watchlist in Netlify Blobs (single-user app,
    fixed storage key)
  - `scheduled-check.js` — Netlify Scheduled Function (cron, runs daily) that reads the stored
    watchlist, figures out which movies just hit release day or cheap-day-ready, and sends a real
    Web Push notification via the `web-push` npm package using VAPID keys
- Hosting: Netlify (same platform as my other personal projects), entirely on the free tier —
  this app's usage is negligible relative to the 300 credits/month free allowance
- No subscriptions or paid services anywhere: TMDB is free, Netlify free tier covers this easily,
  Web Push is an open protocol with no Apple/Google fee (unlike native push, which would require
  a $99/year Apple Developer account)

## What's already scaffolded (in this folder)

- `index.html` — full frontend: Discover tab (live TMDB feed, tap to add to watchlist in either
  mode), My List tab (ticket-stub cards grouped into "Ready now" / "Tracking", with day countdowns
  and remove buttons), first-run TMDB key setup screen, iOS install banner, push-enable banner
- `manifest.json` — PWA manifest with `display: standalone` (required for iOS push eligibility)
- `sw.js` — service worker handling offline caching, `push` events (always calls
  `showNotification` inside `event.waitUntil`, since iOS revokes subscriptions that receive a
  push without showing a notification), and `notificationclick` (focuses or opens the app)
- `netlify/functions/save-state.js` — receives `{ subscription, watchlist, cheapWaitDays }` via
  POST, stores it in Netlify Blobs, preserves notification history to avoid duplicate sends
- `netlify/functions/scheduled-check.js` — daily cron (currently `0 14 * * *` UTC = 9am Ecuador
  time, EC has no DST), computes which tracked movies just crossed into "release day" or
  "cheap day ready," sends push via `web-push`, marks them as notified, and drops dead
  subscriptions on 410/404 errors
- `netlify.toml` — functions directory config + SPA redirect
- `package.json` — declares `@netlify/blobs` and `web-push` as dependencies
- `README.md` — full setup walkthrough (TMDB key, VAPID key generation, Netlify deploy, iOS
  install steps)
- `icons/` — placeholder 192x192 and 512x512 PNG icons (simple gold-outlined squares — **replace
  these with a real icon**)

## What you need to do

1. **Read through the existing files first** to understand the current implementation before
   changing anything — don't regenerate from scratch.

2. **Generate real VAPID keys** (`npx web-push generate-vapid-keys`), wire the public key into
   `index.html` (replace `PASTE_YOUR_VAPID_PUBLIC_KEY_HERE`), and guide me through setting the
   private key + contact email as Netlify environment variables (never commit the private key).

3. **Design a real app icon** that fits the ticket-stub/marquee visual identity already
   established (warm near-black `#15120F` background, marquee gold `#F2B84B` accent) — generate
   or help me create proper 192x192 and 512x512 PNGs to replace the placeholders.

4. **Set up the git repo and Netlify deploy**:
   - Initialize git if not already done
   - Connect to Netlify (CLI or dashboard) and get this deployed to a real URL
   - Confirm Netlify Blobs is working on the deployed site (it should work automatically, but
     verify by checking function logs)

5. **Test the full push flow end-to-end on my actual iPhone**:
   - Walk me through installing via Safari → Add to Home Screen
   - Confirm the notification permission prompt appears correctly from inside the installed app
   - Help me manually trigger `scheduled-check` (via `netlify functions:invoke` or similar) using
     a test movie with today's date, so I can confirm a real notification arrives on my lock
     screen without waiting for the daily cron
   - Debug any issues that come up — iOS web push is known to be finicky (dead subscriptions,
     missed notifications, permission prompt not appearing) — check Netlify function logs and the
     Safari remote inspector (Mac required for inspecting an installed iOS PWA) as needed

6. **Sanity-check the TMDB query logic** — confirm the `discover` endpoint with
   `region=EC&with_release_type=2|3` is actually returning theatrical Ecuador release dates
   correctly (not falling back to US/worldwide dates), and adjust the date range/sort if results
   look off once I'm testing with real data.

7. **Polish pass once the core flow works**:
   - Loading states while TMDB fetches
   - Error handling if the TMDB key is invalid or the API is down
   - Confirm the cheap-day math (release date + 14 days) matches what I actually want once I'm
     using it for a couple of weeks
   - Anything that feels rough on a real iPhone screen vs. how it looked in a desktop browser

## Things to preserve

- Keep this a single-user app (no auth/login) — that's intentional, not a missing feature
- Keep the visual identity (ticket-stub cards, marquee header, the gold/jade/red color roles) —
  don't restyle it generically
- Keep everything on free tiers — flag clearly if any change would risk that

Let's start with step 1–2 (review the code, then get VAPID keys generated and wired in).
