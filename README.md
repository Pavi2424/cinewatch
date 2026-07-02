# CineWatch EC

Track confirmed Ecuador movie releases, mark each one "watch on release" or "wait for cheap day,"
and get real push notifications (including on iOS) when it's time to go.

## What's already built

- `index.html` — the PWA frontend (Discover feed pulled live from TMDB, My List with ticket-stub
  status cards, settings, install banner, push opt-in)
- `manifest.json` — installability config (`display: standalone`, required for iOS push)
- `sw.js` — service worker: offline caching + receiving/showing push notifications
- `netlify/functions/save-state.js` — stores your push subscription + watchlist server-side
- `netlify/functions/scheduled-check.js` — runs daily, sends push notifications for movies that
  just hit release day or cheap-day pricing
- `netlify.toml` / `package.json` — deploy config + backend dependencies

## What's NOT done yet (intentionally — see the Claude Code prompt)

- App icons (`icons/icon-192.png`, `icons/icon-512.png`) are referenced but not generated
- VAPID keys are not generated/wired in
- Not yet deployed or tested end-to-end, especially the iOS push flow

## Setup, step by step

### 1. Get a free TMDB API key
1. Create an account at https://www.themoviedb.org/
2. Settings → API → Request an API key (choose "Developer")
3. You'll use the **API Read Access Token** (long token, not the short v3 key) — paste it into
   the app's setup screen on first load

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
netlify deploy --prod
```
Netlify Blobs works automatically on deployed sites — no extra setup needed.

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
- Single-user app by design — watchlist and subscription are stored under one fixed key in
  Netlify Blobs. Fine for personal use; would need real auth to support multiple people.
- iOS push only works for the installed Home Screen app, never inside a Safari tab — this is an
  Apple platform restriction, not a bug in this app.
