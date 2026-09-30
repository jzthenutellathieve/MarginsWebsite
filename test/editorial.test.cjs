const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { collectionPages, renderHome, searchIndex, sortArticles } = require('../scripts/editorial.cjs');
const read = path => fs.readFileSync(path, 'utf8');
const original = JSON.parse(read('content/articles/sand-cartels-southeast-asia.json'));
const assets = JSON.parse(read('content/assets.json'));
const templates = { reporting:read('content/pages/reporting.html'), archive:read('content/pages/archive.html') };
const fixtures = Array.from({length:25}, (_, i) => ({ ...original,
  id:`fixture-${i}`, displayTitle:`Article ${i}`, tag:i % 2 ? 'Water' : 'Displacement',
  date:`May ${i + 1}, ${i < 13 ? 2025 : 2026}`
}));

test('all articles remain on one page without topic divisions as the journal grows', () => {
  const built = collectionPages(fixtures, templates, assets);
  const main = built.filter(p => /^\/articles\/(?:page\/\d+\/)?$/.test(p.pathname));
  assert.equal(main.length, 1);
  const displayed = main.flatMap(p => [...p.body.matchAll(/<h2><a[^>]+href="\/articles\/(fixture-\d+)\/"/g)].map(match => match[1]));
  assert.equal(displayed.length,25);
  assert.equal(new Set(displayed).size,25);
  assert.deepEqual(displayed, [...fixtures].reverse().map(article => article.id));
  assert.ok(built.filter(p => p.pathname.startsWith('/articles/')).every(p => !p.body.includes('md-pagination')));
  const urls = new Set(built.map(p => p.pathname));
  for (const page of built) {
    for (const match of page.body.matchAll(/href="(\/(?:articles\/(?:topic\/[^/]+\/)?(?:page\/\d+\/)?|archive\/(?:\d{4}\/)?(?:page\/\d+\/)?))"/g)) {
      assert.ok(urls.has(match[1]), `Missing directory destination ${match[1]}`);
    }
  }
  assert.equal(built.filter(p => /^\/archive\/(?:page\/\d+\/)?$/.test(p.pathname)).length,3);
  assert.ok(!built.some(p => p.pathname.startsWith('/articles/topic/')));
  assert.ok(!main[0].body.includes('md-topics'));
});

test('homepage features both selected stories and lists every article newest first', () => {
  const html = renderHome(read('content/pages/home.html').replace('{{fieldNotePreview}}', ''), fixtures,
    {featuredArticles:['fixture-24','fixture-1']}, assets,
    {'device-video':'<p>Video</p>',collaboration:'<p>Collaboration</p>'});
  assert.equal((html.match(/data-mj-story>/g) || []).length,27);
  assert.equal((html.match(/class="md-lead-story"/g) || []).length,2);
  const titles = [...html.matchAll(/<h3><a[^>]+href="\/articles\/(fixture-\d+)\/"/g)].map(match => match[1]);
  assert.deepEqual(titles.slice(0,2), ['fixture-24','fixture-1']);
  assert.deepEqual(titles.slice(2), [...fixtures].reverse().map(article => article.id));
  assert.match(html, /data-mj-pause/);
  const index = searchIndex(fixtures,assets);
  assert.equal(index.articles.length,25);
  assert.equal(index.pageSize,25);
  assert.equal(index.articles[0].id,'fixture-24');
  assert.ok(index.articles.every(a => a.url && a.title && a.photo));
});

test('publication order is newest first regardless of editing or writing dates', () => {
  const articles = [
    {...original, id:'newer', date:'September 8, 2026', writtenDate:'April 17, 2025'},
    {...original, id:'older', date:'October 7, 2025', updated:'September 26, 2026'}
  ];
  assert.deepEqual(sortArticles(articles).map(a => a.id), ['newer','older']);
  const built = collectionPages(articles, templates, assets);
  const list = built.find(p => p.pathname === '/articles/').body;
  assert.ok(list.indexOf('/articles/newer/') < list.indexOf('/articles/older/'));
  assert.match(list, /<time datetime="2026-09-08">Published September 8, 2026<\/time>/);
  assert.ok(!list.includes('April 17, 2025'));
  assert.ok(!list.includes('September 26, 2026'));
  const index = searchIndex(articles, assets);
  assert.deepEqual(index.articles.map(a => [a.id, a.date, a.isoDate]), [
    ['newer', 'Published September 8, 2026', '2026-09-08'],
    ['older', 'Published October 7, 2025', '2025-10-07']
  ]);
  assert.ok(!built.some(p => p.pathname.startsWith('/articles/page/')));
  const archive = built.find(p => p.pathname === '/archive/').body;
  assert.ok(archive.indexOf('/articles/newer/') < archive.indexOf('/articles/older/'));
});
