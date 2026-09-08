// Counter keys live in Redis, not in a deployment or a generated HTML file.
// Only the short-lived request IDs expire. Never expire the article totals.
const keyFor = id => `margins:article-views:{${id}}`;

const INCREMENT = `
if redis.call('SET', KEYS[2], '1', 'NX', 'EX', 86400) then
  redis.call('HSETNX', KEYS[1], 'startedAt', ARGV[1])
  redis.call('HINCRBY', KEYS[1], 'recorded', 1)
end
return redis.call('HMGET', KEYS[1], 'recorded', 'historical', 'startedAt', 'historicalThrough')
`;

const IMPORT = `
if redis.call('HEXISTS', KEYS[1], 'historical') == 1 then
  return redis.error_reply('Historical views have already been imported')
end
local started = redis.call('HGET', KEYS[1], 'startedAt')
if started and ARGV[2] > started then
  return redis.error_reply('Historical range overlaps recorded views')
end
redis.call('HSET', KEYS[1], 'historical', ARGV[1], 'historicalThrough', ARGV[2], 'historicalSource', ARGV[3])
return redis.call('HMGET', KEYS[1], 'recorded', 'historical', 'startedAt', 'historicalThrough')
`;

function configFrom(env) {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '').trim();
  let valid = false;
  try {
    const parsed = new URL(url);
    valid = parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      !parsed.search && !parsed.hash;
  } catch {}
  return {url: url.replace(/\/$/, ''), token, ready: valid && !!token};
}

function snapshot(values) {
  if (!Array.isArray(values) || values.length !== 4) throw new Error('Invalid counter response');
  const [recorded, historical] = values.slice(0, 2).map(v => v === null || v === false ? 0 : Number(v));
  const total = recorded + historical;
  if (![recorded, historical, total].every(v => Number.isSafeInteger(v) && v >= 0)) {
    throw new Error('Invalid view count');
  }
  return {views:total, recordedViews:recorded, historicalViews:historical,
    trackedSince:values[2] || null, historicalThrough:values[3] || null};
}

function createStore({env = process.env, fetchImpl = fetch} = {}) {
  const config = configFrom(env);
  async function command(parts) {
    if (!config.ready) throw new Error('View storage is not configured');
    const response = await fetchImpl(config.url, {
      method:'POST', redirect:'error',
      headers:{Authorization:`Bearer ${config.token}`, 'Content-Type':'application/json'},
      body:JSON.stringify(parts), signal:AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error('View storage is unavailable');
    const data = await response.json();
    if (data.error) throw new Error('View storage rejected the operation');
    return snapshot(data.result);
  }
  return {
    ready:config.ready,
    read:id => command(['HMGET', keyFor(id), 'recorded', 'historical', 'startedAt', 'historicalThrough']),
    increment:(id, eventId, timestamp) => command(['EVAL', INCREMENT, 2,
      keyFor(id), `${keyFor(id)}:event:${eventId}`, timestamp]),
    importHistory:(id, count, through, source) => command(['EVAL', IMPORT, 1,
      keyFor(id), count, through, source])
  };
}

module.exports = {createStore, configFrom, keyFor, INCREMENT, IMPORT, snapshot};
