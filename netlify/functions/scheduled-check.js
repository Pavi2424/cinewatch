// netlify/functions/scheduled-check.js
//
// The daily cron. Scheduled via netlify.toml ([functions."scheduled-check"]).
// Netlify blocks public HTTP access to scheduled functions, so all of the logic
// lives in ../../lib/check-core.js and is also reachable through run-check.js for
// manual runs / testing.

const core = require('../../lib/check-core');

exports.handler = async () => {
  const summary = await core.performCheck();
  return { statusCode: 200, body: summary };
};
