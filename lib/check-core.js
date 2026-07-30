// lib/check-core.js
//
// Shared notification logic used by two Netlify functions:
//   - scheduled-check.js  → the daily cron (scheduled via netlify.toml; Netlify
//                           blocks public HTTP access to scheduled functions)
//   - run-check.js        → an HTTP-invokable trigger for manual runs, ?test,
//                           and ?debug (kept OUT of the schedule so it stays
//                           reachable over HTTP)
//
// Kept in /lib (outside netlify/functions) so Netlify doesn't turn it into its
// own endpoint; the bundler traces the relative require and includes it.

const webpush = require('web-push');
const { getStore } = require('@netlify/blobs');

const USER_KEY = 'primary-user';

webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_CONTACT_EMAIL || 'you@example.com'),
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function getBlobStore() {
  return getStore({
    name: 'cinewatch-state',
    siteID: process.env.NETLIFY_BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN,
  });
}

async function getState() {
  return getBlobStore().get(USER_KEY, { type: 'json' });
}

// Sends one push straight to the stored subscription, no thresholds or history.
async function sendTest() {
  const state = await getState();
  if (!state || !state.subscription) return { statusCode: 200, body: 'No subscription stored yet' };
  try {
    await webpush.sendNotification(
      state.subscription,
      JSON.stringify({
        title: 'CineWatch test 🍿',
        body: "Push notifications are working — you're all set.",
        url: '/',
        tag: 'cinewatch-test',
      })
    );
    return { statusCode: 200, body: 'Test notification sent' };
  } catch (err) {
    return { statusCode: 500, body: 'Test push failed: ' + (err.statusCode || err.message) };
  }
}

// Read-only snapshot of stored state (no subscription secret) for diagnostics.
function debugInfo(state) {
  if (!state) return { error: 'No state stored yet' };
  return {
    now: new Date().toISOString(),
    lastCheckedAt: state.lastCheckedAt || null,
    hasSubscription: !!state.subscription,
    settings: {
      cheapWaitDays: state.cheapWaitDays,
      releaseNotifyLead: state.releaseNotifyLead,
      cheapNotifyLead: state.cheapNotifyLead,
    },
    notified: Object.keys(state.notified || {}),
    watchlist: (state.watchlist || []).map((m) => ({
      id: m.id, title: m.title, mode: m.mode, release_date: m.release_date, watched: !!m.watched,
    })),
  };
}

// The core daily check: figure out which movies crossed a notification threshold
// and send a push for each. Safe to run any number of times — each event is sent
// once (tracked in `notified`).
async function performCheck() {
  const store = getBlobStore();
  const state = await store.get(USER_KEY, { type: 'json' });

  if (!state || !state.subscription || !state.watchlist) {
    return 'No state to check yet';
  }

  const {
    subscription,
    watchlist,
    cheapWaitDays = 7,
    releaseNotifyLead = 0, // notify this many days BEFORE the release date
    cheapNotifyLead = 0,   // notify this many days BEFORE cheap day
    tmdbToken,
  } = state;
  const notified = state.notified || {};
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');

  const toSend = [];

  for (const movie of watchlist) {
    if (movie.watched) continue;
    if (movie.mode !== 'release' && movie.mode !== 'cheap') continue; // 'announce' handled below
    const release = new Date(movie.release_date + 'T00:00:00');

    if (movie.mode === 'release') {
      const key = `${movie.id}-release`;
      // daysBetween(today, release) counts down to release; fire once it's within
      // the user's lead time (0 = on release day).
      const daysUntil = daysBetween(today, release);
      if (daysUntil <= releaseNotifyLead && !notified[key]) {
        toSend.push({
          key,
          title: daysUntil > 0 ? 'Releasing soon 🎬' : 'In theaters today 🎬',
          body: daysUntil > 0
            ? `${movie.title} releases in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`
            : `${movie.title} just released in Ecuador.`,
        });
      }
    }

    if (movie.mode === 'cheap') {
      const cheapDate = new Date(release.getTime() + cheapWaitDays * 86400000);
      const key = `${movie.id}-cheap`;
      const daysUntil = daysBetween(today, cheapDate);
      if (daysUntil <= cheapNotifyLead && !notified[key]) {
        toSend.push({
          key,
          title: 'Cheap day ready 💸',
          body: daysUntil > 0
            ? `${movie.title} hits cheap-day pricing in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`
            : `${movie.title} is now in its cheap pricing window.`,
        });
      }
    }
  }

  // Announcement tracking: for movies added as "notify me when a date is
  // announced", re-query TMDB (using the stored read-only token) to see if a
  // firm date now exists. This is the reason the token is stored server-side —
  // the phone isn't involved, so the job has to ask TMDB itself.
  const announceMovies = watchlist.filter(
    (m) => m.mode === 'announce' && !m.watched && !notified[`${m.id}-announced`]
  );
  if (announceMovies.length && tmdbToken) {
    await Promise.all(
      announceMovies.map(async (movie) => {
        try {
          const res = await fetch(`https://api.themoviedb.org/3/movie/${movie.id}?language=en`, {
            headers: { Authorization: `Bearer ${tmdbToken}`, accept: 'application/json' },
          });
          if (!res.ok) return;
          const data = await res.json();
          // A date is "announced" once the film is locked into post production
          // (or already out) AND has a concrete release_date.
          const firm =
            (data.status === 'Post Production' || data.status === 'Released') && !!data.release_date;
          if (firm) {
            const when = new Date(data.release_date + 'T00:00:00').toLocaleDateString('en-US', {
              day: 'numeric', month: 'long', year: 'numeric',
            });
            toSend.push({
              key: `${movie.id}-announced`,
              title: 'Release date announced 📅',
              body: `${movie.title} is set for ${when}. Open CineWatch to start tracking it.`,
            });
          }
        } catch (e) {
          console.error('Announce check failed for', movie.id, e.message);
        }
      })
    );
  } else if (announceMovies.length && !tmdbToken) {
    console.warn('Announce-mode movies present but no tmdbToken stored; skipping announcement checks.');
  }

  for (const item of toSend) {
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({ title: item.title, body: item.body, url: '/', tag: item.key })
      );
      notified[item.key] = true;
    } catch (err) {
      // 410/404 means the subscription is dead (uninstalled, permission revoked, etc.)
      console.error('Push failed for', item.key, err.statusCode || err.message);
      if (err.statusCode === 410 || err.statusCode === 404) {
        await store.setJSON(USER_KEY, { ...state, subscription: null });
        break;
      }
    }
  }

  await store.setJSON(USER_KEY, { ...state, notified, lastCheckedAt: new Date().toISOString() });

  return `Checked ${watchlist.length} movies, sent ${toSend.length} notifications`;
}

module.exports = { performCheck, getState, sendTest, debugInfo, USER_KEY };
