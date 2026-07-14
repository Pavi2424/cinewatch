# CineWatch EC

Track upcoming movie releases (US theatrical dates, used as an estimate for Ecuador — TMDB's
Ecuador-specific data is too sparse to browse on its own), mark each one "watch on release" or
"wait for cheap day," and get real push notifications (including on iOS) when it's time to go.

## What's already built

- `index.html` — the PWA frontend:
  - **Discover** feed (popular English-language US theatrical releases, pulled several pages deep),
    split into "Coming soon" and a dimmed "Recently released" section, with Upcoming/All/by-month
    filter chips
  - **Search** across all of TMDB, a **trending carousel**, and a tappable **movie detail** sheet
    (backdrop, runtime, director, cast, synopsis)
  - **Notify me when the date is announced** for films with no firm date yet (shown as year / N/D),
    tracked in a "Awaiting date" group in My List
  - **My List** with ticket-stub status cards, settings, install banner, push opt-in
- `manifest.json` — installability config (`display: standalone`, required for iOS push)
- `sw.js` — service worker: offline caching + receiving/showing push notifications
- `netlify/functions/save-state.js` — stores your push subscription + watchlist (+ your read-only
  TMDB token) server-side in Netlify Blobs
- `netlify/functions/scheduled-check.js` — runs daily: sends push for movies hitting release day or
  cheap-day pricing, and re-checks "awaiting date" movies against TMDB to push once a date is announced
- `netlify.toml` / `package.json` — deploy config + backend dependencies
- `icons/` — real ticket-stub app icon (192 / 512) generated from `icons/icon-source.svg`

## Setup, step by step

### 1. Get a free TMDB API key
1. Create an account at https://www.themoviedb.org/
2. Settings → API → Request an API key (choose **"Personal"** — the free, non-commercial tier)
3. You'll use the **API Read Access Token** (long token, not the short v3 key) — paste it into
   the app's setup screen on first load. It's also stored server-side (read-only) so the daily job
   can check whether a tracked "awaiting date" movie has had its release date announced.

### 2. Generate VAPID keys (free, no account needed)
```
npx web-push generate-vapid-keys
```
This prints a public and private key.
- Paste the **public** key into `index.html`, replacing `PASTE_YOUR_VAPID_PUBLIC_KEY_HERE`
- Keep the **private** key secret — it goes into a Netlify environment variable, never into
  frontend code

### 3. Deploy to Netlify
```
npm install
netlify init       # or: connect this repo in the Netlify dashboard
netlify env:set VAPID_PUBLIC_KEY "your-public-key"
netlify env:set VAPID_PRIVATE_KEY "your-private-key"
netlify env:set VAPID_CONTACT_EMAIL "you@example.com"
# Netlify Blobs auto-injection has been unreliable in production, so we configure
# it explicitly. Site ID: Site configuration → General → Site details.
# Token: a Personal Access Token from User settings → Applications.
netlify env:set NETLIFY_BLOBS_SITE_ID "your-site-id"
netlify env:set NETLIFY_BLOBS_TOKEN "your-personal-access-token"
netlify deploy --prod
```

### 4. Install on iPhone
1. Open the deployed URL in **Safari** (must be Safari, not Chrome/Edge)
2. Tap Share → **Add to Home Screen**
3. Open CineWatch from the Home Screen icon (not from a Safari tab)
4. Add a few movies to My List, then tap **Enable** on the notifications banner
5. Confirm the system permission prompt

### 5. Test the push flow
The scheduled function runs once a day automatically. To test without waiting:
- Temporarily call the `scheduled-check` function manually via the Netlify CLI
  (`netlify functions:invoke scheduled-check`) after adding a movie with a release date of today

## Cost
Everything here runs on free tiers: TMDB API (free, non-commercial), Netlify free plan (300
credits/month — this app uses a tiny fraction), Web Push (open protocol, no subscription).

## Notes
- Single-user app by design — watchlist, subscription, and the read-only TMDB token are stored
  under one fixed key in Netlify Blobs. Fine for personal use; would need real auth to support
  multiple people.
- Movies shown use **US** theatrical dates as an estimate — TMDB's Ecuador-specific data is too
  sparse to browse. Actual Ecuador release can lag the US date, or a title may never open locally.
- iOS push only works for the installed Home Screen app, never inside a Safari tab — this is an
  Apple platform restriction, not a bug in this app.
