const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require.resolve('../public/view-summaries.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function homepage({response = {ready:true, views:42}, visible = true} = {}) {
  const nodes = ['article-one', 'article-two', 'article-one'].map(id => ({
    dataset:{articleViewSummary:id}, hidden:true
  }));
  const requests = [], events = {};
  const on = (name, callback) => {events[name] = callback;};
  const document = {visibilityState:visible ? 'visible' : 'hidden', prerendering:false,
    querySelectorAll:() => nodes, addEventListener:on};
  vm.runInNewContext(script, {document, window:{addEventListener:on}, AbortSignal,
    fetch:async (url, options) => {
      requests.push({url, ...options});
      return {ok:true, json:async () => response};
    }});
  return {nodes, requests, document, emit:(name, data = {}) => events[name]?.(data)};
}

test('homepage cards use read-only requests, reuse totals and display the stored count', async () => {
  const page = homepage();
  await flush();
  assert.equal(page.requests.length, 2);
  for (const req of page.requests) {
    assert.equal(req.method, 'GET');
    assert.equal(req.body, undefined);
    assert.equal(req.cache, 'no-store');
  }
  assert.equal(page.requests[0].url, '/api/views?id=article-one');
  for (const node of page.nodes) {
    assert.equal(node.hidden, false);
    assert.equal(node.textContent, ' · 42 views');
  }
  page.emit('pageshow', {persisted:false});
  assert.equal(page.requests.length, 2);
  page.emit('pageshow', {persisted:true});
  await flush();
  assert.equal(page.requests.length, 4);
  assert.ok(page.requests.every(req => req.method === 'GET'));
});

test('hidden homepages wait to load totals and unavailable totals do not display fake numbers', async () => {
  const page = homepage({visible:false, response:{ready:false}});
  assert.equal(page.requests.length, 0);
  page.document.visibilityState = 'visible';
  page.emit('visibilitychange');
  await flush();
  assert.equal(page.requests.length, 2);
  assert.ok(page.nodes.every(node => node.hidden && node.textContent === undefined));
});
