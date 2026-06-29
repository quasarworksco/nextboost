/**
 * NextBoost — Cloudflare Worker proxy for JustAnotherPanel API
 *
 * This worker sits between the browser and JAP so the API key
 * never leaves Cloudflare's servers.
 *
 * Deploy: wrangler deploy
 * Set secret: wrangler secret put JAP_API_KEY
 *
 * Your panel calls:  POST https://api.nextboost.io/v2
 * Worker forwards:   POST https://justanotherpanel.com/api/v2
 */

const JAP_URL = 'https://justanotherpanel.com/api/v2';

export default {
  async fetch(request, env) {
    // ── CORS preflight ──────────────────────────────
    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }));
    }

    // ── Only accept POST ────────────────────────────
    if (request.method !== 'POST') {
      return cors(new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405, headers: { 'Content-Type': 'application/json' }
      }));
    }

    // ── Read body sent by NextBoost panel ───────────
    let body;
    try {
      body = await request.formData();
    } catch {
      return cors(new Response(JSON.stringify({ error: 'Invalid body' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      }));
    }

    // ── Inject the real JAP API key ─────────────────
    // env.JAP_API_KEY is set via: wrangler secret put JAP_API_KEY
    const params = new URLSearchParams();
    params.set('key', env.JAP_API_KEY);

    for (const [k, v] of body.entries()) {
      if (k !== 'key') params.set(k, v); // never let client override the key
    }

    // ── Forward to JAP ──────────────────────────────
    let japRes;
    try {
      japRes = await fetch(JAP_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    params,
      });
    } catch (e) {
      return cors(new Response(JSON.stringify({ error: 'Provider unreachable: ' + e.message }), {
        status: 502, headers: { 'Content-Type': 'application/json' }
      }));
    }

    const data = await japRes.text();
    return cors(new Response(data, {
      status:  japRes.status,
      headers: { 'Content-Type': 'application/json' },
    }));
  }
};

// ── Add CORS headers to any response ───────────────
function cors(res) {
  res.headers.set('Access-Control-Allow-Origin',  '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}
