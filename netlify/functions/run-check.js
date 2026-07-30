// netlify/functions/run-check.js
//
// HTTP-invokable twin of the daily cron. NOT scheduled, so it stays reachable
// over HTTP for manual runs and diagnostics:
//   GET /.netlify/functions/run-check          → run the check now (send due pushes)
//   GET /.netlify/functions/run-check?test=1    → send one test push
//   GET /.netlify/functions/run-check?debug=1   → dump stored state (read-only)
//
// Single-user personal app: these hooks only ever act on the one stored
// subscription, so leaving them open is low-risk.

const core = require('../../lib/check-core');

exports.handler = async (event) => {
  const q = (event && event.queryStringParameters) || {};

  if (q.test === '1') {
    return core.sendTest();
  }

  if (q.debug === '1') {
    const state = await core.getState();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(core.debugInfo(state), null, 2),
    };
  }

  const summary = await core.performCheck();
  return { statusCode: 200, body: summary };
};
