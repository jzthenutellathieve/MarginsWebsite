// Run privately with the database credentials. Never invoked by a site build.
const fs = require('node:fs');
const {createStore} = require('../server/view-store.cjs');
const {articleIds} = require('../server/article-views.cjs');

function validateImport(entries, ids, now = Date.now()) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('Provide an array of historical article totals');
  const seen = new Set();
  return entries.map(entry => {
    if (!entry || !ids.has(entry.id) || seen.has(entry.id)) throw new Error('Unknown or repeated article ID');
    seen.add(entry.id);
    if (!Number.isSafeInteger(entry.views) || entry.views < 0) throw new Error('Views must be a nonnegative integer');
    const through = new Date(entry.through);
    if (typeof entry.through !== 'string' || !Number.isFinite(through.getTime()) || through.getTime() > now) {
      throw new Error('Historical totals need a valid past reporting cutoff');
    }
    if (typeof entry.source !== 'string' || !entry.source.trim() || entry.source.length > 500) {
      throw new Error('Record the analytics report or export supporting this total');
    }
    return {...entry, through:through.toISOString(), source:entry.source.trim()};
  });
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node --env-file=.env.local scripts/import-article-views.cjs historical-views.json');
  const entries = validateImport(JSON.parse(fs.readFileSync(file, 'utf8')), articleIds());
  const store = createStore();
  if (!store.ready) throw new Error('Configure the private Redis REST URL and token first');
  for (const entry of entries) {
    const result = await store.importHistory(entry.id, entry.views, entry.through, entry.source);
    console.log(`${entry.id}: ${result.historicalViews} historical + ${result.recordedViews} newly recorded = ${result.views} views`);
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {validateImport};
