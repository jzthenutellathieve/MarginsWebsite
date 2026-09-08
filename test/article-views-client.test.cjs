const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require.resolve('../public/article-views.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function page({visible = true, prerendering = false, fetchImpl} = {}) {
  const requests = [], timers = [], listeners = {};
  const counter = {dataset:{articleViews:'sand-cartels-southeast-asia'}, hidden:true};
  let serial = 0;
  const on = (name, callback) => {listeners[name] = callback;};
  const document = {visibilityState:visible ? 'visible' : 'hidden', prerendering,
    querySelector:() => counter, addEventListener:on};
  const window = {crypto:{randomUUID:() => `load-${++serial}`}, addEventListener:on,
    setTimeout:fn => timers.push(fn)};
  vm.runInNewContext(script, {document, window, AbortSignal, fetch:async (url, options) => {
    requests.push({url, ...JSON.parse(options.body)});
    return fetchImpl ? fetchImpl(requests.length) : {ok:true, json:async () => ({ready:true, views:requests.length})};
  }});
  return {requests, timers, counter, document, emit:(event, value = {}) => listeners[event]?.(value)};
}

test('one visible page load counts once; returning through browser history counts a new visit', async () => {
  const p = page();
  p.emit('pageshow', {persisted:false});
  p.emit('visibilitychange');
  await flush();
  assert.equal(p.requests.length, 1);
  assert.equal(p.counter.textContent, ' · 1 view');
  p.emit('pageshow', {persisted:true});
  await flush();
  assert.equal(p.requests.length, 2);
  assert.notEqual(p.requests[0].eventId, p.requests[1].eventId);
  assert.equal(p.counter.textContent, ' · 2 views');
});

test('hidden tabs and prerendered documents wait for a visible visit', async () => {
  const p = page({visible:false, prerendering:true});
  assert.equal(p.requests.length, 0);
  p.document.visibilityState = 'visible';
  p.emit('visibilitychange');
  assert.equal(p.requests.length, 0);
  p.document.prerendering = false;
  p.emit('prerenderingchange');
  await flush();
  assert.equal(p.requests.length, 1);
});

test('a lost response retries the same page-load ID instead of counting twice', async () => {
  const p = page({fetchImpl:async n => {
    if (n === 1) throw new Error('Response lost');
    return {ok:true, json:async () => ({ready:true, views:15})};
  }});
  await flush();
  assert.equal(p.timers.length, 1);
  p.timers.shift()();
  await flush();
  assert.equal(p.requests.length, 2);
  assert.equal(p.requests[0].eventId, p.requests[1].eventId);
  assert.equal(p.counter.textContent, ' · 15 views');
});

test('unconfigured storage leaves the counter hidden and does not show a fabricated zero', async () => {
  const p = page({fetchImpl:async () => ({ok:true, json:async () => ({ready:false})})});
  await flush();
  assert.equal(p.counter.hidden, true);
  assert.equal(p.counter.textContent, undefined);
  assert.equal(p.timers.length, 0);
});
