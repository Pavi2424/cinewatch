// netlify/functions/save-state.js
//
// Called by the frontend whenever the watchlist changes or push is (re)enabled.
// Stores { subscription, watchlist, cheapWaitDays } in Netlify Blobs so the
// scheduled function can read it without the phone being open.
//
// NOTE: this is a single-user app. Everything is stored under one fixed key.
// If you ever want multiple people using their own lists, swap `USER_KEY`
// for something derived from a login/session.

const { getStore } = require('@netlify/blobs');

const USER_KEY = 'primary-user';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { subscription, watchlist, cheapWaitDays } = payload;
  if (!subscription || !Array.isArray(watchlist)) {
    return { statusCode: 400, body: 'Missing subscription or watchlist' };
  }

  const store = getStore({
    name: 'cinewatch-state',
    siteID: process.env.NETLIFY_BLOBS_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN
  });

  // Preserve notification history so we don't re-notify for the same event.
  const existingRaw = await store.get(USER_KEY, { type: 'json' });
  const notified = (existingRaw && existingRaw.notified) || {};

  await store.setJSON(USER_KEY, {
    subscription,
    watchlist,
    cheapWaitDays: cheapWaitDays || 14,
    notified, // { [movieId-eventType]: true }
    updatedAt: new Date().toISOString()
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  };
};
