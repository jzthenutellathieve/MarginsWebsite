const fs = require('node:fs');
const path = require('node:path');
const {createStore} = require('./view-store.cjs');
const MAX_BODY_BYTES = 512;
const EVENT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function articleIds() {
  return new Set(fs.readdirSync(path.join(__dirname, '../content/articles'))
    .filter(file => file.endsWith('.json')).map(file => file.slice(0, -5)));
}

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (Number(req.headers['content-length'] || 0) > MAX_BODY_BYTES) throw new Error('Body too large');
  if (req.body !== undefined) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
    if (Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw)) > MAX_BODY_BYTES) throw new Error('Body too large');
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new Error('Body too large');
  }
  return JSON.parse(text);
}

function createHandler({env = process.env, store = createStore({env}), ids = articleIds(), now = Date.now} = {}) {
  const origins = new Set((env.VIEWS_ALLOWED_ORIGINS || 'https://themarginsjournals.com,https://www.themarginsjournals.com')
    .split(',').map(value => value.trim()));
  // Preview builds must not add test traffic to the production database.
  const enabled = store.ready && (!env.VERCEL_ENV || env.VERCEL_ENV === 'production');
  return async function views(req, res) {
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return reply(res, 405, {error:'Method not allowed'});
    }
    if (req.method === 'GET') {
      const id = new URL(req.url, 'https://themarginsjournals.com').searchParams.get('id');
      if (!id) return reply(res, 200, {ready:enabled});
      if (!ids.has(id)) return reply(res, 404, {error:'Unknown article'});
      if (!enabled) return reply(res, 200, {ready:false});
      try { return reply(res, 200, {ready:true, ...await store.read(id)}); }
      catch { return reply(res, 503, {error:'Views are temporarily unavailable'}); }
    }
    if (!origins.has(req.headers.origin)) return reply(res, 403, {error:'Use the article page'});
    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return reply(res, 415, {error:'JSON required'});
    }
    let body;
    try { body = await readBody(req); }
    catch { return reply(res, 400, {error:'Invalid request'}); }
    if (!body || !ids.has(body.id) || !EVENT_ID.test(body.eventId || '')) {
      return reply(res, 400, {error:'Invalid article or page-load ID'});
    }
    if (!enabled) return reply(res, 200, {ready:false});
    // Best-effort filtering only; this counter is not a unique-human metric.
    if (/bot|crawler|spider|headless|preview/i.test(req.headers['user-agent'] || '') ||
        /prefetch|prerender/i.test(`${req.headers.purpose || ''} ${req.headers['sec-purpose'] || ''}`)) {
      return reply(res, 200, {ready:false});
    }
    try {
      return reply(res, 200, {ready:true, ...await store.increment(body.id, body.eventId, new Date(now()).toISOString())});
    } catch { return reply(res, 503, {error:'Views are temporarily unavailable'}); }
  };
}

module.exports = {createHandler, articleIds};
