# CineWatch EC — Project Handoff / Migration Guide

> **Purpose of this file:** everything needed to pick up development of CineWatch EC
> on a new computer / new Claude Code session with zero loss of context. Read this
> top to bottom and you will know the project as well as the previous session did.
> **No secrets are in this file** (the repo is public) — secret *values* live in
> `MIGRATION-SECRETS.local.md`, which is gitignored and must be carried over
> manually (see "Secrets" below).

Last updated: 2026-10-03. Current HEAD when written: `081902c` (the two commits after
`cc9d917` are this handoff and its `.gitignore` entry — no app code changed).

---

## 0. Kickoff prompt for the new session

Paste this into a fresh Claude Code session opened in the project folder:

> I'm continuing the **CineWatch EC** project on a new computer. Read `HANDOFF.md`
> in full first, then `MIGRATION-SECRETS.local.md` for the credentials. The repo is
> at https://github.com/Pavi2424/cinewatch and the live site is
> https://cinewatchec.netlify.app. Confirm you understand the architecture, the
> notification system (GitHub Actions → run-check), and the deploy procedure
> (bump the sw.js cache name whenever index.html changes), then wait for my next
> instruction. Don't change anything yet.

---

## 1. What the app is

**CineWatch EC** is a personal, single-user, mobile-first **PWA** that tracks movie
releases for a user in Quito, Ecuador. Core idea: the user doesn't want to pay full
price on opening week — they wait ~1 week for "cheap day" pricing ($2.60 weekdays) —
but they forget which movies they wanted and when they're cheap. The app tracks that
and sends **real push notifications (including on iOS, even when the app is closed)**.

- **Browse** a Discover feed of upcoming blockbusters (English-language, US theatrical
  dates used as an *estimate* for Ecuador — TMDB's EC-specific data is too sparse).
- **Track** a movie in one of three modes:
  - `release` — "watch on release" (notify at/before release day)
  - `cheap` — "wait for cheap day" (notify at/before release + N days)
  - `announce` — "notify me when a date is announced" (for films with no firm date)
- **Settings** let the user tune notification lead times and the cheap-day window.
- A daily backend job decides what to push.

It is intentionally **single-user, no auth**. All server state lives under one fixed
key in Netlify Blobs.

---

## 2. Live locations & accounts

| Thing | Value |
|---|---|
| GitHub repo (public) | https://github.com/Pavi2424/cinewatch (`main` branch) |
| Live site | https://cinewatchec.netlify.app/ |
| Netlify project name | `cinewatchec` |
| TMDB | free "Personal" (non-commercial) API tier; user's account |
| Hosting/cost | 100% free tiers (TMDB free, Netlify free, Web Push open protocol, GitHub Actions free on public repos) |
| Git author | Alvaro Aviles <avilesalvaro2004@gmail.com> |

The whole project folder also lives inside **OneDrive**
(`…/OneDrive - Opal Group/Opal Group/Notes/Project Movies/cinewatch-ec-scaffold`),
so if the new computer is signed into the same OneDrive, the folder — *including the
gitignored secret files* — may already be synced there. Otherwise, migrate manually
(see §4).

---

## 3. Secrets (values are NOT here — see MIGRATION-SECRETS.local.md)

These credentials exist. Their **values** are in `MIGRATION-SECRETS.local.md`
(gitignored) and in `.env.local` (gitignored), never in the repo:

- **TMDB API Read Access Token** — the long JWT. Entered in the app's Settings tab at
  runtime (stored in `localStorage`), and also stored server-side in Netlify Blobs so
  the daily job can check for announced dates. Needed locally only to test the feed.
- **VAPID_PUBLIC_KEY** — also hard-coded in `index.html` (public by design).
- **VAPID_PRIVATE_KEY** — secret; set as a Netlify env var. Never commit.
- **VAPID_CONTACT_EMAIL** — `avilesalvaro2004@gmail.com`.
- **NETLIFY_BLOBS_SITE_ID** / **NETLIFY_BLOBS_TOKEN** — set as Netlify env vars so
  Blobs works (see bug #6). These live in the Netlify dashboard and persist regardless
  of computer; you only need them if reconfiguring Blobs.

**Netlify environment variables that must exist** (Site configuration → Environment
variables): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`,
`NETLIFY_BLOBS_SITE_ID`, `NETLIFY_BLOBS_TOKEN`. These already exist on the live site —
a new *computer* doesn't change them.

---

## 4. New-computer setup

1. **Install tooling:** Git, Node.js LTS, and Claude Code.
   - Node on Windows was installed via `winget install OpenJS.NodeJS.LTS` (this
     project was built with Node v24.18.0). After install, a fresh shell is needed, or
     refresh PATH. `node -v` / `npm -v` to confirm.
2. **Get the code:** `git clone https://github.com/Pavi2424/cinewatch.git`
   (or use the OneDrive-synced folder).
3. **Bring the secrets over** (they are NOT in git): copy `MIGRATION-SECRETS.local.md`
   and `.env.local` into the project folder by hand (USB, password manager, or OneDrive).
   Transfer securely — do **not** paste them into the public repo or an untrusted place.
4. **(Optional) install deps for local scripts:** `npm install` (only needed if you run
   Netlify functions locally; the deployed site already has everything).
5. Open the folder in Claude Code and paste the kickoff prompt from §0.

No local build step exists — it's plain HTML/CSS/JS. Netlify serves the root directly.

---

## 5. Architecture & data flow

**Frontend** (`index.html`, one file) runs in the browser:
- Pulls the Discover feed + search + details straight from the **TMDB API** (browser →
  TMDB directly; TMDB allows CORS, so no proxy).
- Stores the watchlist + settings in `localStorage`.
- When push is enabled, POSTs `{subscription, watchlist, settings, tmdbToken}` to
  `save-state` so the server has a copy.

**Backend** (Netlify Functions, Node) runs on Netlify's servers:
- `save-state.js` — receives the POST, stores everything in **Netlify Blobs** under one
  fixed key (`primary-user`), preserving the `notified` history.
- `lib/check-core.js` — the shared notification brain: reads Blobs state, figures out
  which movies crossed a notification threshold, sends Web Push via the `web-push`
  package using the VAPID keys, marks them `notified`.
- `scheduled-check.js` — thin wrapper that calls `check-core.performCheck()`. **Scheduled**
  (daily) via `netlify.toml`. Netlify blocks public HTTP to scheduled functions (returns
  403 — that's expected and confirms it's scheduled).
- `run-check.js` — thin HTTP-invokable twin that calls the same core, plus `?test=1`
  (send one test push) and `?debug=1` (dump state). NOT scheduled, so it stays reachable
  over HTTP. **This is what the GitHub Actions cron pings.**

**The daily trigger (the important part — see bug #16):**
- **Primary:** `.github/workflows/daily-check.yml` — a GitHub Actions cron that `curl`s
  `run-check` every day at `0 14 * * *` (14:00 UTC = **9:00 AM Ecuador**, fixed UTC-5).
  Verifiable in the repo's **Actions** tab; `workflow_dispatch` allows manual runs.
- **Backup:** the Netlify schedule on `scheduled-check` (redundant; idempotent, so
  running both is harmless — each alert sends once).

**Service worker** (`sw.js`) — offline caching + receives `push` events and always shows
a notification (iOS revokes subscriptions that receive a push without showing one) +
handles notification clicks.

---

## 6. File structure

```
cinewatch-ec-scaffold/
├─ index.html                      # entire frontend (UI, TMDB, feed, search, detail,
│                                   #   settings, push opt-in, My List, carousel)
├─ sw.js                           # service worker. CACHE_NAME currently 'cinewatch-v8'
├─ manifest.json                   # PWA manifest (display:standalone — required for iOS push)
├─ netlify.toml                    # publish=".", functions dir, SPA redirect,
│                                   #   [functions."scheduled-check"] schedule
├─ lib/
│  └─ check-core.js                # shared notification logic (performCheck/sendTest/
│                                   #   debugInfo/getState)
├─ netlify/functions/
│  ├─ save-state.js                # stores {subscription,watchlist,settings,tmdbToken} in Blobs
│  ├─ scheduled-check.js           # daily cron wrapper (scheduled; 403 over HTTP)
│  └─ run-check.js                 # HTTP twin: plain run, ?test=1, ?debug=1
├─ .github/workflows/
│  └─ daily-check.yml              # GitHub Actions cron → pings run-check daily 14:00 UTC
├─ icons/
│  ├─ icon-192.png, icon-512.png   # ticket-stub app icon
│  └─ icon-source.svg              # editable source for the icon
├─ package.json / package-lock.json# deps: @netlify/blobs, web-push
├─ README.md                       # user-facing setup walkthrough
├─ CLAUDE_CODE_PROMPT.md           # the ORIGINAL project kickoff prompt (historical)
├─ HANDOFF.md                      # this file
├─ .env.local                      # GITIGNORED — VAPID keys + contact email
└─ MIGRATION-SECRETS.local.md      # GITIGNORED — all secret values for migration
```

---

## 7. Key behaviour & constants (all in index.html unless noted)

- **Discover query** (`discoverUrl`): `region=US`, `with_release_type=2|3`,
  `release_date.gte=today`, `release_date.lte=+365d`, `sort_by=popularity.desc`,
  `with_original_language=en`, `language=en-US`. Feed is **upcoming-only** and paginated
  ("Show more movies" button; a top-up loop reaches ~20–30 new per batch after filtering).
- **Blockbuster filter:** `with_original_language=en` + popularity. Do **NOT** use
  `vote_count.gte` — it surfaces old re-releases (bug #11).
- **Titles:** always display `original_title` (English). TMDB `title` can be localized.
- **Sort toggle:** Popular (TMDB order) vs "Releasing next" (by date asc).
- **Carousel:** 10 upcoming trending movies — merges `/trending/movie/week` (upcoming
  only) then tops up from popular upcoming to reach 10 (bug #: trending is mostly
  already-released).
- **TBD detection** (`isTBD`): no date, or status in {Planned, Rumored, In Production},
  or release_date > today+400d → shows "Notify me when the date is announced".
- **My List statuses:** `Waiting for streaming` (30+ days after release — top group, has
  Mark-watched + Remove) → `Ready now` → `Tracking` → `Awaiting date`. Watched items are
  hidden. `STREAMING_WAIT_DAYS = 30`.
- **Settings (synced to server):** `cheapWaitDays` (default **7**), `releaseNotifyLead`
  (default 0; user currently uses **2**), `cheapNotifyLead` (default 0). Lead = "days
  before" the event to notify; 0 = on the day.
- **Settings is a gear-button overlay**, not a tab. Only two tabs: Discover, My List.
- **Cron expression:** `0 14 * * *` (14:00 UTC = 9 AM Ecuador).
- **100% English UI** — no Spanish anywhere (bug #14/#15).

---

## 8. Deploy procedure (DO THIS EVERY TIME)

1. Make edits.
2. **If `index.html` changed, bump `CACHE_NAME` in `sw.js`** (e.g. `cinewatch-v8` →
   `v9`). This is non-negotiable — installed PWAs serve the cached `index.html`
   otherwise and users never see changes (bug #8). Current value: **`cinewatch-v8`**.
3. `git add -A && git commit && git push` to `main`. Netlify auto-deploys from `main`.
4. **Watch for credit-skipped deploys** (bug #9): if the Netlify Deploys tab shows
   "Skipped due to account credit usage exceeded", the push did NOT go live. Fix: ensure
   credits, then Netlify dashboard → **Trigger deploy → Deploy site**.
5. Confirm live: `curl https://cinewatchec.netlify.app/sw.js` and check the new
   `CACHE_NAME` is present. (The SPA redirect returns 200 + index.html for unknown
   paths, so check *content*, not just status code.)
6. On the phone: fully close the installed app and reopen to pick up the new SW.

Commit messages in this project end with:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## 9. Local testing procedure

The deployed Netlify functions can't run from `file://`, and the SW cache trap applies
locally too. The pattern that worked:

1. Serve the folder over HTTP with a tiny Node static server on port 8123 (a throwaway
   `http.createServer` script — put it in the scratchpad, not the repo). `file://` breaks
   fetch/SW.
2. Open `http://127.0.0.1:8123/index.html` in the browser (built-in Browser pane).
3. Inject the TMDB token so the feed loads:
   `localStorage.setItem('cw_tmdb_token', '<token from secrets file>')`.
4. **Before each reload after an edit:** unregister service workers and clear caches, or
   you'll test stale code:
   ```js
   (async()=>{const r=await navigator.serviceWorker.getRegistrations();for(const x of r)await x.unregister();for(const k of await caches.keys())await caches.delete(k);})()
   ```
5. Screenshots of this app sometimes time out in the preview pane (sticky header /
   backdrop-filter). Prefer DOM inspection via `javascript_tool` / `read_page` to verify.
6. `node --check <file>` to syntax-check function files before pushing.

Only `index.html` + TMDB are exercised locally; push/Blobs need the deployed site.

---

## 10. Notifications — operating & debugging

- **Send due notifications now:** `curl https://cinewatchec.netlify.app/.netlify/functions/run-check`
  → prints `Checked N movies, sent X notifications`.
- **Send a test push:** `…/run-check?test=1` → one "CineWatch test 🍿" push to the stored
  subscription.
- **Inspect server state (read-only):** `…/run-check?debug=1` → JSON of settings,
  `notified` keys, `lastCheckedAt`, and the watchlist (no subscription secret). This is
  the go-to diagnostic.
- `scheduled-check` over HTTP returns **403** — that's correct (it's scheduled); use
  `run-check`.
- **Each alert sends once** (tracked in `notified`), so a movie won't re-notify. "Sent N"
  means the push service *accepted* N; delivery is best-effort and **iOS can drop
  notifications** — not a bug.
- To confirm the cron ran: GitHub **Actions** tab (every run logged), or check that
  `?debug=1`'s `lastCheckedAt` advanced to ~14:00 UTC.

---

## 11. Full history of problems hit & how they were fixed

This is the hard-won knowledge. If something breaks, check here first.

1. **Node not installed** → `winget install OpenJS.NodeJS.LTS`; refresh PATH / new shell.
2. **VAPID keys** generated with `npx web-push generate-vapid-keys`; public → index.html,
   private+email → Netlify env vars (never committed).
3. **App icon** — placeholder squares replaced by a ticket-stub SVG, rasterized to PNG
   192/512 with `sharp` (`npm install --no-save sharp`). Source kept at
   `icons/icon-source.svg`.
4. **Git identity missing** → set locally (`git config user.name/email`).
5. **Whole site 404'd after first deploy** — the scaffold's SPA redirect in `netlify.toml`
   had `conditions = { Role = ["none"] }`, which enables Netlify Identity RBAC and gated
   *every* path behind a login the app doesn't have. **Fix:** delete that condition.
6. **`MissingBlobsEnvironmentError` on both functions** — two stacked bugs: (a) a known
   Netlify platform failure where Blobs auto-injection doesn't work, fixed by passing
   `siteID`/`token` explicitly via `NETLIFY_BLOBS_SITE_ID` / `NETLIFY_BLOBS_TOKEN` env
   vars; (b) `getStore()` takes **one** argument (a name string OR a single options
   object) — the first fix mistakenly passed two positional args, so JS silently dropped
   siteID/token. **Correct form:** `getStore({ name:'cinewatch-state', siteID, token })`.
7. **Stale release dates** — TMDB `/discover` returns a flat `release_date` that isn't
   reliably the current regional date when a film has multiple entries (festival +
   general, or a re-release). Originally fixed by fetching per-movie `/release_dates`;
   now mostly moot since the feed is US + upcoming-only.
8. **Service-worker cache trap** — the installed PWA caches `index.html`; changes never
   reach users unless `CACHE_NAME` in `sw.js` is bumped. Happens locally too. Bumped
   v1→v8 across the project. **Always bump on index.html change.**
9. **Netlify "Skipped due to account credit usage exceeded"** — deploys silently skipped
   during a credit shortfall; fixed by adding credits + manual "Trigger deploy". Watch
   for this whenever a push doesn't seem to go live.
10. **TMDB Ecuador data too sparse** — `region=EC` returned only 2–3 movies. Switched to
    `region=US` dates as an EC *estimate* (documented in the UI).
11. **Blockbuster filter trap** — `vote_count.gte` surfaces old re-releases (Endgame, V
    for Vendetta) because they have high lifetime votes. Use `with_original_language=en`
    + `popularity.desc` instead.
12. **Old re-releases polluting the feed** — old films appear because they have an
    upcoming re-release screening, but their flat `release_date` is the original premiere.
    **Fix:** the feed filters to `release_date >= today` (upcoming only), dropping them.
13. **Only 20 movies** — TMDB returns 20/page; added pagination + a "Show more movies"
    button and a top-up loop.
14. **App still in Spanish** — switched all TMDB calls to `language=en-US`, dates to
    `toLocaleDateString('en-US')`, display `original_title`. Fixed synopsis, dates, and
    even the posters (TMDB returns localized posters by `language`).
15. **Old watchlist entries stuck in Spanish** — entries saved before the English switch
    kept localized titles. Added a one-time `migrateWatchlistTitles()` (fetches
    `original_title` per entry, re-syncs; guard `localStorage.cw_titles_v==='2'`).
16. **★ THE BIG ONE — scheduled notifications never fired.** The in-code
    `exports.config = { schedule }` was **never registered** by Netlify; the cron hadn't
    auto-run for ~2 weeks (`lastCheckedAt` stuck at an old manual-run time). Every
    notification the user had ever received came from a *manual* trigger. **Fixes, in
    order:** (a) declared the schedule in `netlify.toml` → Netlify registered it (now
    returns 403 to public HTTP, which *confirms* it's scheduled); (b) that 403 broke the
    manual/`?test`/`?debug` HTTP access, so the logic was split into `lib/check-core.js`
    shared by `scheduled-check.js` (cron) and `run-check.js` (HTTP); (c) added a **GitHub
    Actions** workflow pinging `run-check` daily as the primary, *verifiable* trigger.
    Verified via a manual `workflow_dispatch` run (printed "Checked 17 movies, sent 0";
    `lastCheckedAt` advanced).
17. **"Run workflow" button missing on GitHub** — the user was simply logged out of
    GitHub; the `workflow_dispatch` button only shows to an authenticated repo owner.
18. **iOS web push is flaky** — "sent" ≠ "delivered"; iOS drops notifications sometimes,
    especially several at once. Expected, not a bug. Each event is still sent only once.

---

## 12. Known constraints & gotchas

- **Single-user, no auth** — intentional. All state under one Blobs key `primary-user`.
- **iOS push only works** for the app installed to the Home Screen via Safari (iOS
  16.4+), never in a browser tab. `manifest.json` must keep `display:standalone`.
- **GitHub Actions scheduled workflows pause after ~60 days of repo inactivity.** This
  actually happened on 2026-09-28. `daily-check.yml` now has a "Keep workflow alive"
  step that re-enables itself via the API on every run, resetting the timer. If
  notifications ever stop anyway, open the Actions tab and re-enable.
- **Blobs token can expire.** On 2026-10-03 `?debug=1` returned `BlobsInternalError 401`
  (expired `NETLIFY_BLOBS_TOKEN`). Fix: new Netlify personal access token → update the
  env var → Trigger deploy. Phone syncs fail silently meanwhile, so re-tap "Enable
  notifications" afterwards to re-sync.
- **GitHub Actions cron can be delayed** (minutes) under load — fine for a daily job.
- **Everything must stay on free tiers** — flag anything that risks that.
- **US dates are an estimate** for Ecuador; actual local release can lag or never happen.
- **`save-state` currently requires a subscription** to store anything, so the watchlist
  only syncs server-side once push is enabled.

---

## 13. Current state (as of handoff)

Fully working and self-running: English-only UI, upcoming-only paginated feed with
Popular/Releasing-next sort, search, movie detail sheet, 10-movie trending carousel,
"Waiting for streaming" group with mark-watched, Settings overlay with notification lead
times, three tracking modes, and **automated daily notifications** via GitHub Actions
(verified) + Netlify backup. Both known bugs (missing notifications, Spanish titles) are
closed.

### Possible next steps / ideas (none urgent)
- A general polish pass (loading states, error toasts for edge cases).
- Optionally expose a "mark watched" on non-streaming items too.
- Revisit the TMDB region/date logic if the user ever wants true EC dates.
- Consider removing the now-redundant Netlify schedule if GitHub Actions proves reliable
  (keep both for now — redundancy is good for a notifications app).

### Sibling projects (same user, same pattern — personal Netlify PWAs with push)
Shelf reading app (book tracker), Tally (personal finance), Album Poster Studio. Not part
of this repo, but the deploy/push/SW-cache lessons transfer directly.

**Tally now has its own `HANDOFF.md`** in `Notes/Project Finance/tally-scaffold`
(repo `Pavi2424/tally`, private). `Notes/MIGRATION-START-HERE.md` indexes both. Two
findings from Tally apply here and are **not yet fixed in CineWatch**:

- **Stale push subscriptions.** `enablePush()` here does
  `getSubscription()` and only subscribes if absent. A subscription left from a previous
  install keeps being accepted by Apple (200) while delivering nothing — indistinguishable
  from success server-side. Fix: always unsubscribe then re-subscribe on an explicit tap,
  and add a "re-register this device" button so it is recoverable from the phone.
- Netlify Blobs needing both `NETLIFY_BLOBS_*` vars is the same story as bug #6 here —
  confirmed again on a fresh site, so it is an account-wide trait, not a one-off.
