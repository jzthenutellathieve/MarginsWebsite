const test = require('node:test');
const assert = require('node:assert/strict');
const {createHandler} = require('../server/article-views.cjs');
const {createStore, snapshot} = require('../server/view-store.cjs');
const {validateImport} = require('../scripts/import-article-views.cjs');

const id = 'sand-cartels-southeast-asia';
const eventId = 'e9578f2e-7734-4445-9329-d7bf2be21c51';
const ids = new Set([id]);
function request(overrides = {}) {
  return {method:'POST', url:'/api/views', headers:{origin:'https://themarginsjournals.com',
    'content-type':'application/json', 'user-agent':'Mozilla/5.0'}, body:{id, eventId}, ...overrides};
}
async function call(handler, req = request()) {
  const headers = {};
  const res = {setHeader:(key, value) => {headers[key] = value;}, end:body => {res.body = JSON.parse(body);}};
  await handler(req, res);
  return {status:res.statusCode, headers, body:res.body};
}

test('valid page loads increment the selected article; reads do not increment', async () => {
  const calls = [];
  const store = {ready:true, increment:async (...args) => {calls.push(args); return {views:12};},
    read:async article => {assert.equal(article, id); return {views:12};}};
  const handler = createHandler({env:{VERCEL_ENV:'production'}, store, ids, now:() => 1800000000000});
  const result = await call(handler);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {ready:true, views:12});
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(calls, [[id, eventId, '2027-01-15T08:00:00.000Z']]);
  assert.equal((await call(handler, request({method:'GET', url:`/api/views?id=${id}`}))).body.views, 12);
  assert.equal(calls.length, 1);
});

test('unknown articles, missing origins, oversized requests and invalid event IDs cannot increment', async () => {
  const handler = createHandler({env:{}, ids, store:{ready:true, increment:() => {throw new Error('Must not increment');}}});
  for (const [req, status] of [
    [request({method:'DELETE'}), 405],
    [request({headers:{}}), 403],
    [request({headers:{origin:'https://unrelated.example', 'content-type':'application/json'}}), 403],
    [request({headers:{origin:'https://themarginsjournals.com', 'content-type':'text/plain'}}), 415],
    [request({body:{id:'unknown', eventId}}), 400],
    [request({body:{id, eventId:'not-an-id'}}), 400],
    [request({body:'x'.repeat(513)}), 400],
    [request({body:'{broken'}), 400],
    [request({method:'GET', url:'/api/views?id=unknown'}), 404]
  ]) assert.equal((await call(handler, req)).status, status);
});

test('missing configuration, previews, crawlers and prefetches produce no count', async () => {
  let increments = 0;
  const store = {ready:true, increment:() => {increments++;}};
  for (const options of [{env:{}, store:{...store, ready:false}}, {env:{VERCEL_ENV:'preview'}, store}]) {
    const handler = createHandler({...options, ids});
    assert.deepEqual((await call(handler)).body, {ready:false});
    assert.deepEqual((await call(handler, request({method:'GET'}))).body, {ready:false});
  }
  const handler = createHandler({env:{}, store, ids});
  for (const headers of [{'user-agent':'Googlebot'}, {'sec-purpose':'prefetch;prerender'}]) {
    assert.deepEqual((await call(handler, request({headers:{...request().headers, ...headers}}))).body, {ready:false});
  }
  assert.equal(increments, 0);
});

test('a database outage is not reported as a zero count or exposed as a provider error', async () => {
  const fail = async () => {throw new Error('private provider details');};
  const handler = createHandler({env:{}, ids, store:{ready:true, read:fail, increment:fail}});
  for (const req of [request(), request({method:'GET', url:`/api/views?id=${id}`})]) {
    const result = await call(handler, req);
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, {error:'Views are temporarily unavailable'});
  }
});

test('Redis commands use private authorization, stable keys and an atomic increment', async () => {
  const calls = [];
  const store = createStore({env:{KV_REST_API_URL:'https://test.example/', KV_REST_API_TOKEN:'test-only-token'},
    fetchImpl:async (url, options) => {
      calls.push([url, options]);
      return {ok:true, json:async () => ({result:['2','10','2026-09-08T00:00:00.000Z','2026-09-07T23:59:00.000Z']})};
    }});
  assert.equal((await store.increment(id, eventId, '2026-09-08T00:00:00.000Z')).views, 12);
  const [url, options] = calls[0];
  assert.equal(url, 'https://test.example');
  assert.equal(options.headers.Authorization, 'Bearer test-only-token');
  const command = JSON.parse(options.body);
  assert.equal(command[0], 'EVAL');
  assert.equal(command[2], 2);
  assert.equal(command[3], `margins:article-views:{${id}}`);
  assert.equal(command[4], `margins:article-views:{${id}}:event:${eventId}`);
  await store.read(id);
  assert.equal(JSON.parse(calls[1][1].body)[0], 'HMGET');
  assert.deepEqual(snapshot([null, null, null, null]), {
    views:0, recordedViews:0, historicalViews:0, trackedSince:null, historicalThrough:null
  });
  assert.throws(() => snapshot(['not-a-count', null, null, null]));
});

test('historical imports need documented past totals for a known article', () => {
  const entry = {id, views:123, through:'2026-09-07T00:00:00Z', source:'Analytics export through September 7'};
  const now = Date.parse('2026-09-08T00:00:00Z');
  assert.equal(validateImport([entry], ids, now)[0].through, '2026-09-07T00:00:00.000Z');
  for (const entries of [[{...entry, views:-1}], [{...entry, views:1.5}], [{...entry, source:''}],
    [{...entry, through:'2099-01-01'}], [{...entry, id:'unknown'}], [entry, entry]]) {
    assert.throws(() => validateImport(entries, ids, now));
  }
});
