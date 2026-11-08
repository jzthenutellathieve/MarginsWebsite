const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { isoDate, displayDate, displayIsoDate, schemaDates, sortArticles } = require('../scripts/article-dates.cjs');
const { collectionPages, renderHome, readNext, searchIndex } = require('../scripts/editorial.cjs');
const { renderArticle } = require('../scripts/render-article.cjs');
const historical = { id: 'historical-article', title: 'Historical coverage', subtitle: 'A summary', date: 'November 7, 2026',
  coverageDate: 'August 2024', coverageMonth: '2024-08', coverageCutoff: '2024-08-31', format: 'Retrospective', readTime: '3 min', content: [], citations: [] };

test('coverage datelines show only the date while actual publication metadata stays separate', () => {
  assert.deepEqual(schemaDates(historical), { datePublished: '2026-11-07T00:00:00.000Z', temporalCoverage: '2024-08' });
  const expectedTime = '<time datetime="2024-08-31">August 31, 2024</time>';
  assert.ok(renderArticle(historical, {}, {}).includes(expectedTime));
  const templates = Object.fromEntries(['reporting', 'archive'].map(name =>
    [name, fs.readFileSync('content/pages/' + name + '.html', 'utf8')]));
  const pages = collectionPages([historical], templates, {});
  for (const page of pages) {
    assert.ok(page.body.includes(expectedTime), page.pathname);
    assert.ok(!page.body.includes('November 7'), page.pathname);
  }
  assert.ok(pages.some(page => page.pathname === '/archive/2024/'));
  assert.ok(!pages.some(page => page.pathname === '/archive/2026/'));
  const [indexed] = searchIndex([historical], {}).articles;
  assert.equal(indexed.date, 'August 31, 2024');
  assert.equal(indexed.isoDate, '2024-08-31');
  assert.deepEqual(sortArticles([{ ...historical, id: 'ordinary', date: 'October 1, 2026', coverageDate: undefined,
    coverageMonth: undefined, coverageCutoff: undefined, format: 'Essay' }, historical]).map(article => article.id), ['ordinary', 'historical-article']);
});

test('ordinary articles keep their existing datelines and only their original publication metadata', () => {
  const ordinary = { id: 'existing-article', date: 'May 28, 2025', updated: 'November 3, 2026' };
  assert.equal(displayDate(ordinary), 'Published May 28, 2025');
  assert.equal(displayIsoDate(ordinary), '2025-05-28');
  assert.deepEqual(schemaDates(ordinary), { datePublished: '2025-05-28T00:00:00.000Z' });
});

test('retrospective dates require a matching real cutoff on or before actual publication', () => {
  for (const fields of [{ format: 'Essay' }, { coverageMonth: '2024-13' }, { coverageDate: 'September 2024' },
    { coverageMonth: '2027-08', coverageDate: 'August 2027', coverageCutoff: '2027-08-31' },
    { coverageCutoff: undefined }, { coverageCutoff: '2024-8-31' }, { coverageCutoff: '2024-09-01' },
    { coverageCutoff: '2024-08-32' }, { coverageCutoff: '2024-02-30', coverageMonth: '2024-02', coverageDate: 'February 2024' },
    { coverageCutoff: '2026-11-08', coverageMonth: '2026-11', coverageDate: 'November 2026' }]) {
    assert.throws(() => schemaDates({ ...historical, ...fields }), /Invalid retrospective/);
    assert.throws(() => sortArticles([{ ...historical, ...fields }]), /Invalid retrospective/);
  }
});

test('publication dates reject impossible calendar dates instead of silently rolling over', () => {
  for (const date of ['February 29, 2025', 'June 31, 2026', 'March 0, 2026', 'Unknown 1, 2026', '2026-02-30', '', null]) {
    assert.throws(() => isoDate({ id: 'invalid', date }), /Invalid publication date/);
  }
  assert.equal(isoDate({ id: 'leap-day', date: 'February 29, 2024' }), '2024-02-29');
  assert.equal(isoDate({ id: 'iso-date', date: '2026-11-07' }), '2026-11-07');
});

test('equal displayed dates use stable article ids and do not mutate the input', () => {
  const input = [{ ...historical, id: 'zulu' }, { id: 'alpha', date: 'August 31, 2024' }, { ...historical, id: 'middle' }];
  const expected = ['alpha', 'middle', 'zulu'];
  assert.deepEqual(sortArticles(input).map(a => a.id), expected);
  assert.deepEqual(sortArticles([...input].reverse()).map(a => a.id), expected);
  assert.deepEqual(input.map(a => a.id), ['zulu', 'alpha', 'middle']);
});

test('all reader collections interleave the four retrospectives with original articles by displayed date', () => {
  const expected = ['after-cws-orange-county', 'barcelona-streets-after-the-works', 'refugee-water-crisis-27000-problem',
    'ukraine-replacement-home', 'tehg-uv-water-access', 'after-wang-fuk-court', 'cws-after-the-la-fires',
    'after-the-fire-before-a-lease', 'sand-cartels-southeast-asia', 'hong-kong-live-in-private-space', 'sunday-rooms-central'];
  const articles = expected.map(id => JSON.parse(fs.readFileSync('content/articles/' + id + '.json', 'utf8'))).reverse();
  const assets = JSON.parse(fs.readFileSync('content/assets.json', 'utf8'));
  assert.deepEqual(sortArticles(articles).map(a => a.id), expected);
  const templates = Object.fromEntries(['reporting', 'archive'].map(name =>
    [name, fs.readFileSync('content/pages/' + name + '.html', 'utf8')]));
  const pages = collectionPages(articles, templates, assets);
  const linkedIds = html => [...html.matchAll(/<h[23][^>]*><a[^>]+href="\/articles\/([^/]+)\/"/g)].map(match => match[1]);
  assert.deepEqual(linkedIds(pages.find(page => page.pathname === '/articles/').body), expected);
  assert.deepEqual(linkedIds(pages.find(page => page.pathname === '/archive/').body), expected);
  for (const year of ['2024', '2025', '2026']) {
    assert.deepEqual(linkedIds(pages.find(page => page.pathname === '/archive/' + year + '/').body),
      expected.filter(id => displayIsoDate(articles.find(a => a.id === id)).startsWith(year)));
  }
  const home = renderHome('{{featured}}{{recent}}', articles, { featuredArticles: [...expected].reverse() }, assets, {});
  assert.deepEqual(linkedIds(home), [...expected, ...expected]);
  assert.deepEqual(searchIndex(articles, assets).articles.map(a => a.id), expected);
  const newest = articles.find(a => a.id === expected[0]);
  assert.deepEqual(linkedIds(readNext(newest, articles, assets)), expected.slice(1, 3));
  for (const article of articles.filter(a => a.format === 'Retrospective')) {
    assert.equal(schemaDates(article).datePublished, '2026-11-07T00:00:00.000Z');
    assert.equal(displayIsoDate(article), article.coverageCutoff);
  }
});
