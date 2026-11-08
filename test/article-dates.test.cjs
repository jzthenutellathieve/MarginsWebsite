const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { displayDate, displayIsoDate, schemaDates } = require('../scripts/article-dates.cjs');
const { collectionPages, searchIndex, sortArticles } = require('../scripts/editorial.cjs');
const { renderArticle } = require('../scripts/render-article.cjs');
const historical = { id: 'historical-article', title: 'Historical coverage', subtitle: 'A summary', date: 'November 7, 2026',
  coverageDate: 'August 2024', coverageMonth: '2024-08', format: 'Retrospective', readTime: '3 min', content: [], citations: [] };

test('retrospective coverage is visibly separate from actual publication metadata', () => {
  assert.deepEqual(schemaDates(historical), { datePublished: '2026-11-07T00:00:00.000Z', temporalCoverage: '2024-08' });
  const expectedTime = '<time datetime="2024-08">August 2024 · Retrospective</time>';
  assert.ok(renderArticle(historical, {}, {}).includes(expectedTime));
  const templates = Object.fromEntries(['reporting', 'archive'].map(name =>
    [name, fs.readFileSync('content/pages/' + name + '.html', 'utf8')]));
  const pages = collectionPages([historical], templates, {});
  for (const page of pages) {
    assert.ok(page.body.includes(expectedTime), page.pathname);
    assert.ok(!page.body.includes('November 7'), page.pathname);
  }
  assert.ok(pages.some(page => page.pathname === '/archive/2026/'));
  assert.ok(!pages.some(page => page.pathname === '/archive/2024/'));
  const [indexed] = searchIndex([historical], {}).articles;
  assert.equal(indexed.date, 'August 2024 · Retrospective');
  assert.equal(indexed.isoDate, '2024-08');
  assert.deepEqual(sortArticles([{ ...historical, id: 'ordinary', date: 'October 1, 2026', coverageDate: undefined,
    coverageMonth: undefined, format: 'Essay' }, historical]).map(article => article.id), ['historical-article', 'ordinary']);
});

test('ordinary articles keep their existing datelines and only their original publication metadata', () => {
  const ordinary = { id: 'existing-article', date: 'May 28, 2025', updated: 'November 3, 2026' };
  assert.equal(displayDate(ordinary), 'Published May 28, 2025');
  assert.equal(displayIsoDate(ordinary), '2025-05-28');
  assert.deepEqual(schemaDates(ordinary), { datePublished: '2025-05-28T00:00:00.000Z' });
});

test('historical labels cannot silently become false publication dates', () => {
  for (const fields of [{ format: 'Essay' }, { coverageMonth: '2024-13' }, { coverageDate: 'September 2024' },
    { coverageMonth: '2027-08', coverageDate: 'August 2027' }]) {
    assert.throws(() => schemaDates({ ...historical, ...fields }), /Invalid retrospective/);
  }
});
