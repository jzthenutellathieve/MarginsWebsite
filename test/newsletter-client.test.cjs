const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../newsletter-client.js'), 'utf8');

function setup(replies) {
  const calls = [];
  let onSubmit;
  let nativeSubmits = 0;
  let statusText = '';
  const input = { value: 'reader@example.com' };
  const button = { textContent: 'Subscribe →', disabled: false };
  const status = { children: [], focus() {}, appendChild(child) { this.children.push(child); },
    get textContent() { return statusText; },
    set textContent(value) { statusText = value; this.children = []; } };
  const form = { dataset: { mjConfigured: 'true' }, target: '_blank',
    querySelector: () => button, reportValidity: () => true,
    setAttribute() {}, removeAttribute() {},
    addEventListener(name, callback) { onSubmit = callback; },
    requestSubmit() { return onSubmit({ preventDefault() {} }); } };
  const window = { listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } };
  const document = { querySelector: () => form,
    getElementById: id => id === 'mj-subscribe-email' ? input : status,
    createElement: () => ({ listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } }) };
  vm.runInNewContext(source, { document, window, AbortController, setTimeout, clearTimeout,
    HTMLFormElement: { prototype: { submit() { nativeSubmits++; } } },
    fetch: async (url, init) => {
      calls.push({ url, init });
      const next = replies.shift();
      assert.ok(next, 'Unexpected browser request');
      if (next.error) throw new Error('Unavailable');
      return new Response(JSON.stringify(next.body), { status: next.status || 200,
        headers: { 'content-type': 'application/json' } });
    } });
  return { calls, input, button, status, window, form,
    get nativeSubmits() { return nativeSubmits; },
    submit: () => form.requestSubmit() };
}

test('backend success displays requested status and a repeated click does not resubmit', async () => {
  const app = setup([{ body: { ready: true } }, { status: 202,
    body: { status: 'requested', message: 'Welcome email requested.', retryAfter: 300 } }]);
  await app.submit();
  assert.equal(app.status.textContent, 'Welcome email requested.');
  assert.equal(app.nativeSubmits, 0);
  assert.equal(app.button.disabled, false);
  await app.submit();
  assert.equal(app.calls.length, 2);
  assert.match(app.status.textContent, /Please wait/);
});

test('a static host or disabled backend falls back to the original Mailchimp form', async () => {
  for (const reply of [{ body: { ready: false } }, { error: true }]) {
    const app = setup([reply]);
    await app.submit();
    assert.equal(app.nativeSubmits, 1);
    assert.equal(app.form.target, '_self');
    assert.equal(app.calls.length, 1);
  }
});

test('after hosted confirmation, returning to the tab rechecks status before requesting a welcome email', async () => {
  const app = setup([{ body: { ready: true } },
    { body: { status: 'confirmation_required', message: 'Please confirm.' } },
    { status: 202, body: { status: 'requested', message: 'Welcome email requested.', retryAfter: 300 } }]);
  await app.submit();
  const link = app.status.children[0];
  assert.equal(link.href, 'https://eepurl.com/FCQRQWoPvn');
  assert.equal(link.target, '_blank');
  link.listeners.click();
  app.window.listeners.focus();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.status.textContent, 'Welcome email requested.');
  assert.equal(app.calls.length, 3);
});

test('provider errors are shown without a success message or a second native submission', async () => {
  const app = setup([{ body: { ready: true } }, { status: 502, body: { error: 'Could not confirm request.' } }]);
  await app.submit();
  assert.equal(app.status.textContent, 'Could not confirm request.');
  assert.equal(app.nativeSubmits, 0);
  assert.equal(app.button.disabled, false);
});

test('shared client scripts parse and the native signup fallback is configured', () => {
  for (const name of ['newsletter-client.js', 'public/site.js', 'public/legacy-routes.js']) {
    new vm.Script(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'));
  }
  const form = fs.readFileSync(path.join(__dirname, '../templates/newsletter.html'), 'utf8');
  assert.match(form, /data-mj-configured="true"/);
  assert.match(form, /action="https:\/\/themarginsjournals\.us13\.list-manage\.com\/subscribe\/post"/);
  assert.match(form, /name="MERGE0"/);
  assert.match(form, /name="id" value="1a86cc1618"/);
});
