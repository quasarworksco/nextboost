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
    const url = new URL(request.url);

    // ── CORS preflight ──────────────────────────────
    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }));
    }

    // ── Analytics endpoint (GET /analytics) ─────────
    if (url.pathname === '/analytics' && request.method === 'GET') {
      return handleAnalytics(request, env);
    }

    // ── Only accept POST for the SMM provider proxy ─
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
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Analytics-Key');
  return res;
}

// ── Web Analytics via Cloudflare GraphQL ───────────
// Secrets required (wrangler secret put ...):
//   CF_API_TOKEN     — token with Account Analytics: Read
//   CF_ACCOUNT_ID    — your Cloudflare account ID
//   ANALYTICS_KEY    — shared secret the admin panel must send
//   SITE_HOSTNAME    — hostname to filter RUM events (e.g. nextboost.dgp-link.com)
async function handleAnalytics(request, env) {
  const key = request.headers.get('X-Analytics-Key');
  if (!key || key !== env.ANALYTICS_KEY) {
    return cors(new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    }));
  }

  const url  = new URL(request.url);
  const days = Math.min(parseInt(url.searchParams.get('days') || '7'), 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const until  = new Date().toISOString();

  const query = `
    query {
      viewer {
        accounts(filter: { accountTag: "${env.CF_ACCOUNT_ID}" }) {
          rumPageloadEventsAdaptiveGroups(
            limit: 1000
            filter: {
              datetime_geq: "${since}"
              datetime_leq: "${until}"
              requestHost: "${env.SITE_HOSTNAME}"
            }
          ) {
            count
            dimensions {
              date: datetimeHour
              countryName
              deviceType
            }
          }
        }
      }
    }
  `;

  let gqlRes;
  try {
    gqlRes = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${env.CF_API_TOKEN}`,
      },
      body: JSON.stringify({ query }),
    });
  } catch (e) {
    return cors(new Response(JSON.stringify({ error: 'Cloudflare API unreachable: ' + e.message }), {
      status: 502, headers: { 'Content-Type': 'application/json' }
    }));
  }

  const data = await gqlRes.json();
  if (data.errors) {
    return cors(new Response(JSON.stringify({ error: data.errors[0]?.message || 'GraphQL error' }), {
      status: 502, headers: { 'Content-Type': 'application/json' }
    }));
  }

  const groups = data?.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups || [];

  // Aggregate
  let totalVisits = 0;
  const byCountry = {};
  const byDevice  = {};
  const byDay     = {};

  groups.forEach(g => {
    const c = g.count || 0;
    totalVisits += c;
    const country = g.dimensions?.countryName || 'Desconocido';
    const device   = g.dimensions?.deviceType  || 'Desconocido';
    const day      = (g.dimensions?.date || '').slice(0, 10);
    byCountry[country] = (byCountry[country] || 0) + c;
    byDevice[device]   = (byDevice[device]   || 0) + c;
    if (day) byDay[day] = (byDay[day] || 0) + c;
  });

  const result = {
    totalVisits,
    byCountry: Object.entries(byCountry).sort((a,b) => b[1]-a[1]).slice(0, 10),
    byDevice:  Object.entries(byDevice).sort((a,b) => b[1]-a[1]),
    byDay:     Object.entries(byDay).sort((a,b) => a[0].localeCompare(b[0])),
    days,
  };

  return cors(new Response(JSON.stringify(result), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  }));
}
