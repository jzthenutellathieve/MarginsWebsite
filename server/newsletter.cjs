const { createHash } = require('node:crypto');

const SIGNUP_URL = 'https://eepurl.com/FCQRQWoPvn';
const EVENT_NAME = 'margins_welcome_requested';
const COOLDOWN_SECONDS = 300;
const MAX_BODY_BYTES = 2048;

class ProviderError extends Error {
  constructor(status) {
    super('Mailchimp request failed');
    this.status = status;
  }
}

function configFrom(env) {
  const key = (env.MAILCHIMP_API_KEY || '').trim();
  const server = (env.MAILCHIMP_SERVER_PREFIX || 'us13').trim();
  const listId = (env.MAILCHIMP_LIST_ID || '1a86cc1618').trim();
  const origins = (env.NEWSLETTER_ALLOWED_ORIGINS || 'https://themarginsjournals.com,https://www.themarginsjournals.com')
    .split(',').map(value => value.trim()).filter(Boolean);
  const ready = env.NEWSLETTER_ENABLED === 'true' &&
    /^[a-z]{2}\d+$/.test(server) && /^[a-f0-9]+$/i.test(listId) &&
    key.length > server.length + 1 && key.endsWith(`-${server}`);
  return { key, server, listId, origins, ready };
}

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const length = Number(req.headers['content-length'] || 0);
  if (length > MAX_BODY_BYTES) throw new Error('Body too large');
  if (req.body !== undefined) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
    if (Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw)) > MAX_BODY_BYTES) {
      throw new Error('Body too large');
    }
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  let body = '';
  let bytes = 0;
  for await (const chunk of req) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_BODY_BYTES) throw new Error('Body too large');
    body += chunk;
  }
  return JSON.parse(body);
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  return email;
}

function createHandler({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  // This cache coalesces double-clicks in a warm function. Mailchimp's own
  // five-minute re-entry rule must also be enabled: it applies across instances.
  const recent = new Map();
  const inFlight = new Set();

  return async function newsletter(req, res) {
    const config = configFrom(env);
    if (req.method === 'GET') {
      return reply(res, 200, {
        ready: config.ready,
        cooldownSeconds: COOLDOWN_SECONDS,
        signupUrl: SIGNUP_URL
      });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return reply(res, 405, { error: 'Use the subscription form to submit your request.' });
    }
    if (!config.origins.includes(req.headers.origin)) {
      return reply(res, 403, { error: 'Please submit the form on The Margins website.' });
    }
    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return reply(res, 415, { error: 'Please use the website subscription form.' });
    }
    if (!config.ready) {
      return reply(res, 503, {
        error: 'Please complete your subscription using the Mailchimp form below.',
        signupUrl: SIGNUP_URL
      });
    }

    let body;
    try { body = await readBody(req); }
    catch { return reply(res, 400, { error: 'Please check your email address and try again.' }); }
    const email = normalizeEmail(body && body.email);
    if (!email || body.consent !== true) {
      return reply(res, 400, { error: 'Enter a valid email address and submit the subscription form.' });
    }
    if (body.website) {
      return reply(res, 400, { error: 'Please use the subscription form on the website.' });
    }

    const hash = createHash('md5').update(email).digest('hex');
    const timestamp = now();
    for (const [id, expires] of recent) if (expires <= timestamp) recent.delete(id);
    const remaining = Math.ceil(((recent.get(hash) || 0) - timestamp) / 1000);
    if (inFlight.has(hash) || remaining > 0) {
      const seconds = remaining > 0 ? remaining : 10;
      res.setHeader('Retry-After', String(seconds));
      return reply(res, 429, { status: 'wait', retryAfter: seconds,
        error: 'A request for this address was just received. Please wait before requesting another email.' });
    }
    inFlight.add(hash);

    const api = async (path, method = 'GET', data) => {
      const response = await fetchImpl(`https://${config.server}.api.mailchimp.com/3.0${path}`, {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Basic ${Buffer.from(`margins:${config.key}`).toString('base64')}`,
          'Content-Type': 'application/json'
        },
        body: data === undefined ? undefined : JSON.stringify(data),
        signal: AbortSignal.timeout(7000)
      });
      if (!response.ok) throw new ProviderError(response.status);
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    };

    let memberWasSubscribed = false;
    try {
      const path = `/lists/${config.listId}/members/${hash}`;
      let member;
      try { member = await api(path); }
      catch (error) {
        if (!(error instanceof ProviderError) || error.status !== 404) throw error;
        // Only set the status of a NEW contact. Never overwrite an existing
        // unsubscribe, pending confirmation, or cleaned address, including races.
        member = await api(path, 'PUT', {
          email_address: email,
          status_if_new: 'subscribed'
        });
      }
      if (!member || typeof member.status !== 'string') throw new Error('Invalid member response');
      if (member.status !== 'subscribed') {
        return reply(res, 200, { status: 'confirmation_required', signupUrl: SIGNUP_URL,
          message: 'Please complete or renew your subscription on Mailchimp. After confirming, return to this tab to finish your welcome email request.' });
      }
      memberWasSubscribed = true;

      // Events are posted for both new and already-subscribed contacts. A flow
      // with Event API = margins_welcome_requested must be active in Mailchimp.
      await api(`${path}/events`, 'POST', {
        name: EVENT_NAME,
        properties: { source: 'themarginsjournals.com', request_type: 'welcome_email' }
      });
      if (recent.size >= 2000) recent.delete(recent.keys().next().value);
      recent.set(hash, now() + COOLDOWN_SECONDS * 1000);
      return reply(res, 202, { status: 'requested', retryAfter: COOLDOWN_SECONDS,
        message: 'Thanks. Your subscription is active, and your welcome email has been requested. Please check your inbox and spam folder. Allow five minutes between requests.' });
    } catch (error) {
      // Avoid exposing addresses, credentials, request bodies or provider details.
      console.error('newsletter_request_failed', {
        providerStatus: error instanceof ProviderError ? error.status : null,
        stage: memberWasSubscribed ? 'welcome_event' : 'subscription'
      });
      const providerStatus = error instanceof ProviderError ? error.status : 0;
      const status = providerStatus === 429 ? 429 : 502;
      if (status === 429) res.setHeader('Retry-After', '60');
      return reply(res, status, { status: 'error', retryAfter: status === 429 ? 60 : undefined,
        error: memberWasSubscribed
          ? 'Your subscription is active, but we could not confirm the welcome email request. Please wait five minutes before trying again.'
          : 'We could not confirm your subscription. Please try again, or use the Mailchimp form below.',
        signupUrl: SIGNUP_URL });
    } finally {
      inFlight.delete(hash);
    }
  };
}

module.exports = { createHandler };
