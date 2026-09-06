const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { collectionPages, renderHome, searchIndex } = require('../scripts/editorial.cjs');
const read = path => fs.readFileSync(path, 'utf8');
const original = JSON.parse(read('content/articles/sand-cartels-southeast-asia.json'));
const assets = JSON.parse(read('content/assets.json'));
const templates = { reporting:read('content/pages/reporting.html'), archive:read('content/pages/archive.html') };
const fixtures = Array.from({length:25}, (_, i) => ({ ...original,
  id:`fixture-${i}`, displayTitle:`Article ${i}`, tag:i % 2 ? 'Water' : 'Displacement',
  date:`May ${i + 1}, ${i < 13 ? 2025 : 2026}`
}));

test('a growing journal has bounded pages and every article remains reachable', () => {
  const built = collectionPages(fixtures, templates, assets, 6);
  const main = built.filter(p => /^\/articles\/(?:page\/\d+\/)?$/.test(p.pathname));
  assert.equal(main.length, 5);
  const displayed = main.flatMap(p => [...p.body.matchAll(/<h2><a[^>]+href="\/articles\/(fixture-\d+)\/"/g)].map(match => match[1]));
  assert.equal(displayed.length,25);
  assert.equal(new Set(displayed).size,25);
  main.forEach(p => assert.ok((p.body.match(/data-mj-story/g) || []).length <= 6));
  const urls = new Set(built.map(p => p.pathname));
  for (const page of built) {
    for (const match of page.body.matchAll(/href="(\/(?:articles\/(?:topic\/[^/]+\/)?(?:page\/\d+\/)?|archive\/(?:\d{4}\/)?(?:page\/\d+\/)?))"/g)) {
      assert.ok(urls.has(match[1]), `Missing directory destination ${match[1]}`);
    }
  }
  assert.equal(built.filter(p => /^\/archive\/(?:page\/\d+\/)?$/.test(p.pathname)).length,3);
  const water = built.filter(p => p.pathname.startsWith('/articles/topic/water/'));
  assert.equal(water.length,2);
  assert.ok(!water.some(p => p.body.includes('Article 0</a>')));
});

test('homepage stays limited to one feature and four recent stories', () => {
  const html = renderHome(read('content/pages/home.html'), fixtures,
    {featuredArticle:'fixture-1',recentArticleLimit:4}, assets,
    {'device-video':'<p>Video</p>',collaboration:'<p>Collaboration</p>'});
  assert.equal((html.match(/data-mj-story>/g) || []).length,5);
  assert.equal((html.match(/<h1>/g) || []).length,1);
  assert.match(html, /Article 1<\/a><\/h1>/);
  assert.match(html, /data-mj-pause/);
  const index = searchIndex(fixtures,assets,6);
  assert.equal(index.articles.length,25);
  assert.equal(index.pageSize,6);
  assert.equal(index.articles[0].id,'fixture-24');
  assert.ok(index.articles.every(a => a.url && a.title && a.photo));
});
