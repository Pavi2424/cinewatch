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
  const store = getStore('cinewatch-state', {
    siteID: process.env.NETLIFY_BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN
  });
  const state = await store.get(USER_KEY, { type: 'json' });

  if (!state || !state.subscription || !state.watchlist) {
    return { statusCode: 200, body: 'No state to check yet' };
  }

  const { subscription, watchlist, cheapWaitDays = 14 } = state;
  const notified = state.notified || {};
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');

  const toSend = [];

  for (const movie of watchlist) {
    if (movie.watched) continue;
    const release = new Date(movie.release_date + 'T00:00:00');

    if (movie.mode === 'release') {
      const key = `${movie.id}-release`;
      if (daysBetween(today, release) <= 0 && !notified[key]) {
        toSend.push({
          key,
          title: 'In theaters today 🎬',
          body: `${movie.title} just released in Ecuador.`,
        });
      }
    }

    if (movie.mode === 'cheap') {
      const cheapDate = new Date(release.getTime() + cheapWaitDays * 86400000);
      const key = `${movie.id}-cheap`;
      if (daysBetween(today, cheapDate) <= 0 && !notified[key]) {
        toSend.push({
          key,
          title: 'Cheap day ready 💸',
          body: `${movie.title} is now in its cheap pricing window.`,
        });
      }
    }
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
