// netlify/functions/scheduled-check.js
//
// Runs once a day (schedule set in netlify.toml). Reads the stored watchlist,
// figures out which movies just became "release day" or "cheap day ready",
// and sends a real push notification for each — this is what makes the
// notification arrive even if the phone/app is completely closed.

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

exports.handler = async () => {
  const store = getStore({
    name: 'cinewatch-state',
    siteID: process.env.NETLIFY_BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN
  });
  const state = await store.get(USER_KEY, { type: 'json' });

  if (!state || !state.subscription || !state.watchlist) {
    return { statusCode: 200, body: 'No state to check yet' };
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
          // A date is considered "announced" once the film is locked into post
          // production (or already out) AND has a concrete release_date.
          const firm =
            (data.status === 'Post Production' || data.status === 'Released') && !!data.release_date;
          if (firm) {
            const when = new Date(data.release_date + 'T00:00:00').toLocaleDateString('en-US', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
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
      // 410/404 means the subscription is dead (user uninstalled, permission revoked, etc.)
      console.error('Push failed for', item.key, err.statusCode || err.message);
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Drop the dead subscription so we stop trying.
        await store.setJSON(USER_KEY, { ...state, subscription: null });
        break;
      }
    }
  }

  await store.setJSON(USER_KEY, { ...state, notified, lastCheckedAt: new Date().toISOString() });

  return {
    statusCode: 200,
    body: `Checked ${watchlist.length} movies, sent ${toSend.length} notifications`
  };
};

exports.config = {
  schedule: '0 14 * * *' // 14:00 UTC = 9:00 AM Ecuador time (EC has no DST, fixed UTC-5)
};
