import { callModel } from './model.js';
import { verifyAdmin, HttpError } from './verify.js';
import { SYSTEM, buildMessages } from './prompt.js';

const j = (obj, status = 200, cors = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } });

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '',
    'Access-Control-Allow-Headers': 'authorization, x-firebase-appcheck, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    _ok: ok,
  };
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    const { _ok, ...ch } = cors;
    if (req.method === 'OPTIONS') return new Response(null, { status: _ok ? 204 : 403, headers: ch });
    const url = new URL(req.url);
    if (req.method !== 'POST' || url.pathname !== '/chat') return j({ error: 'not found' }, 404, ch);
    if (!_ok) return j({ error: 'origin not allowed' }, 403, ch);
    let admin;
    try { admin = await verifyAdmin(req, env); }
    catch (e) { return j({ error: e.message || 'unauthorized' }, e.status || 401, ch); }
    // Rate limit: 30 requests / 5 min per admin.
    const bucket = `rl:${admin.email}:${Math.floor(Date.now() / 300000)}`;
    const count = Number((await env.RATE.get(bucket)) || '0') + 1;
    if (count > 30) return j({ error: 'rate limited, slow down' }, 429, ch);
    await env.RATE.put(bucket, String(count), { expirationTtl: 360 });
    try {
      const body = await req.json();
      const text = await callModel(env, { system: SYSTEM, messages: buildMessages(body) });
      return j({ text }, 200, ch);
    } catch (e) {
      console.error('chat error:', e?.message ?? e);
      return j({ error: 'server error' }, 500, ch);
    }
  },
};
