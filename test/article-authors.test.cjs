const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { byline, schemaAuthors } = require('../scripts/article-authors.cjs');
const { renderArticle } = require('../scripts/render-article.cjs');
const { collectionPages, searchIndex } = require('../scripts/editorial.cjs');

test('existing articles use the approved public author names', () => {
  for (const id of ['after-cws-orange-county', 'refugee-water-crisis-27000-problem',
    'after-wang-fuk-court', 'cws-after-the-la-fires', 'after-the-fire-before-a-lease',
    'sand-cartels-southeast-asia']) {
    assert.equal(byline({ id }), 'Xingtong Zou');
    assert.deepEqual(schemaAuthors({ id }), { '@type': 'Person', name: 'Xingtong Zou' });
  }
  assert.equal(byline({ id: 'tehg-uv-water-access' }), 'Xingtong Zou & Xingwei Wang');
  assert.deepEqual(schemaAuthors({ id: 'tehg-uv-water-access' }), [
    { '@type': 'Person', name: 'Xingtong Zou' }, { '@type': 'Person', name: 'Xingwei Wang' }
  ]);
});

test('declared authors appear consistently in the article, cards, search and structured metadata', () => {
  const article = { id: 'new-article', title: 'An article', subtitle: 'A summary', date: 'November 7, 2026',
    readTime: '3 min', authors: [{ name: 'JSON' }, { name: 'Michael', type: 'Person' }], content: [], citations: [] };
  const expected = 'JSON & Michael';
  assert.match(renderArticle(article, {}, {}), /JSON &amp; Michael · Published November 7, 2026/);
  const templates = Object.fromEntries(['reporting', 'archive'].map(name =>
    [name, fs.readFileSync('content/pages/' + name + '.html', 'utf8')]));
  assert.match(collectionPages([article], templates, {})[0].body, /JSON &amp; Michael · <time/);
  assert.equal(searchIndex([article], {}).articles[0].author, expected);
  assert.deepEqual(schemaAuthors(article), [
    { '@type': 'Person', name: 'JSON' }, { '@type': 'Person', name: 'Michael' }
  ]);
});

test('new articles do not silently inherit Jerry as author, and malformed authors fail the build', () => {
  assert.equal(byline({ id: 'new-article' }), 'The Margins');
  assert.deepEqual(schemaAuthors({ id: 'new-article' }), { '@type': 'Organization', name: 'The Margins' });
  for (const authors of [[], ['JSON'], [{ name: ' ' }], [{ name: 'JSON', type: 'Admin' }]]) {
    assert.throws(() => schemaAuthors({ id: 'new-article', authors }), /article author/);
  }
});
