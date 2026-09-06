const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createHandler } = require('../server/newsletter.cjs');

const env = {
  NEWSLETTER_ENABLED: 'true',
  MAILCHIMP_API_KEY: 'mock-key-us13',
  MAILCHIMP_SERVER_PREFIX: 'us13',
  MAILCHIMP_LIST_ID: '1a86cc1618'
};

function fixture(replies, options = {}) {
  const calls = [];
  const handler = createHandler({ env, ...options, fetchImpl: async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    const next = replies.shift();
    assert.ok(next, 'Unexpected provider request');
    if (typeof next === 'function') return next();
    return new Response(next.status === 204 ? null : JSON.stringify(next.body || {}), { status: next.status });
  }});
  return { calls, handler };
}

async function submit(handler, overrides = {}) {
  const request = { method: 'POST', headers: {
    origin: 'https://themarginsjournals.com', 'content-type': 'application/json'
  }, body: { email: 'reader@example.com', consent: true }, ...overrides };
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = JSON.parse(value); } };
  await handler(request, response);
  return response;
}

test('a new subscriber is added once and gets an event using their normalized address', async () => {
  const { handler, calls } = fixture([
    { status: 404 }, { status: 200, body: { status: 'subscribed' } }, { status: 204 }
  ]);
  const result = await submit(handler, { body: { email: ' Reader@Example.com ', consent: true } });
  assert.equal(result.statusCode, 202);
  assert.equal(result.body.status, 'requested');
  assert.deepEqual(calls.map(call => call.method), ['GET', 'PUT', 'POST']);
  assert.deepEqual(calls[1].body, { email_address: 'reader@example.com', status_if_new: 'subscribed' });
  const hash = createHash('md5').update('reader@example.com').digest('hex');
  assert.ok(calls[2].url.endsWith(`/members/${hash}/events`));
  assert.equal(calls[2].body.name, 'margins_welcome_requested');
});

test('an existing subscriber can request again after the cooldown without rewriting consent', async () => {
  let time = 1000000;
  const { handler, calls } = fixture([
    { status: 200, body: { status: 'subscribed' } }, { status: 204 },
    { status: 200, body: { status: 'subscribed' } }, { status: 204 }
  ], { now: () => time });
  assert.equal((await submit(handler)).statusCode, 202);
  const duplicate = await submit(handler);
  assert.equal(duplicate.statusCode, 429);
  assert.equal(duplicate.body.retryAfter, 300);
  time += 301000;
  assert.equal((await submit(handler)).statusCode, 202);
  assert.deepEqual(calls.map(call => call.method), ['GET', 'POST', 'GET', 'POST']);
});

test('unsubscribed, pending and cleaned contacts receive a confirmation route without mutation', async () => {
  for (const status of ['unsubscribed', 'pending', 'cleaned']) {
    const { handler, calls } = fixture([{ status: 200, body: { status } }]);
    const result = await submit(handler);
    assert.equal(result.body.status, 'confirmation_required');
    assert.equal(result.body.signupUrl, 'https://eepurl.com/FCQRQWoPvn');
    assert.deepEqual(calls.map(call => call.method), ['GET']);
  }
});

test('a contact who unsubscribes during creation is never overwritten or sent an event', async () => {
  const { handler, calls } = fixture([{ status: 404 }, { status: 200, body: { status: 'unsubscribed' } }]);
  const result = await submit(handler);
  assert.equal(result.body.status, 'confirmation_required');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.status, undefined);
});

test('a welcome API failure does not claim the email was requested and a retry can recover', async () => {
  const { handler } = fixture([
    { status: 200, body: { status: 'subscribed' } }, { status: 500 },
    { status: 200, body: { status: 'subscribed' } }, { status: 204 }
  ]);
  const result = await submit(handler);
  assert.equal(result.statusCode, 502);
  assert.match(result.body.error, /could not confirm the welcome email request/);
  assert.equal((await submit(handler)).statusCode, 202);
});

test('overlapping submissions produce only one welcome event in this function instance', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { handler, calls } = fixture([
    () => gate.then(() => new Response(JSON.stringify({ status: 'subscribed' }))), { status: 204 }
  ]);
  const first = submit(handler);
  // Allow the first request to reach the provider before submitting again.
  await new Promise(resolve => setImmediate(resolve));
  const second = await submit(handler);
  assert.equal(second.statusCode, 429);
  release();
  assert.equal((await first).statusCode, 202);
  assert.equal(calls.length, 2);
});

test('disabled configuration and rejected requests never reach Mailchimp', async () => {
  const disabled = fixture([], { env: { ...env, NEWSLETTER_ENABLED: 'false' } });
  assert.equal((await submit(disabled.handler, { method: 'GET' })).body.ready, false);
  assert.equal((await submit(disabled.handler)).statusCode, 503);
  const enabled = fixture([]);
  assert.equal((await submit(enabled.handler, { headers: { origin: 'https://other.example' } })).statusCode, 403);
  assert.equal((await submit(enabled.handler, { body: { email: 'invalid', consent: true } })).statusCode, 400);
  assert.equal((await submit(enabled.handler, { body: { email: 'reader@example.com' } })).statusCode, 400);
  assert.equal((await submit(enabled.handler, { body: 'invalid json' })).statusCode, 400);
  assert.equal((await submit(enabled.handler, { body: { email: 'reader@example.com', consent: true, extra: 'x'.repeat(3000) } })).statusCode, 400);
  assert.equal(enabled.calls.length + disabled.calls.length, 0);
});
