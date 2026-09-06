const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { escapeText, pages, articlePath } = require('../scripts/site-utils.cjs');
const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, ['scripts/build.cjs'], { cwd: root });
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const articles = fs.readdirSync(path.join(root, 'content/articles')).map(name => JSON.parse(read(`content/articles/${name}`)));
const paths = [...Object.values(pages).map(page => page.path), ...articles.map(articlePath)];
const output = url => read(`dist${url}index.html`);

test('each URL contains its own complete HTML and all local links resolve', () => {
  for (const url of paths) {
    const html = output(url);
    assert.equal((html.match(/data-mj-page=/g) || []).length, 1, url);
    assert.ok(!html.includes('id="mj-article-data"'), url);
    assert.match(html, new RegExp(`rel="canonical" href="https://themarginsjournals.com${url}"`));
    assert.match(html, /src="\/newsletter-client\.js" defer/);
    assert.ok(!/href="#\//.test(html), url);
    for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
      const target = path.join(root, 'dist', match[1]);
      assert.ok(fs.existsSync(target), `${url} links to missing ${match[1]}`);
    }
  }
});

test('article bodies and citations are present without JavaScript', () => {
  for (const article of articles) {
    const html = output(articlePath(article));
    assert.ok(html.includes(`<h1>${escapeText(article.title)}</h1>`));
    for (const block of article.content) {
      for (const key of ['text', 'number', 'label', 'attribution', 'caption', 'source', 'alt']) {
        if (block[key]) assert.ok(html.includes(escapeText(block[key])), `${article.id}: missing ${key}`);
      }
    }
    for (const citation of article.citations) assert.ok(html.includes(escapeText(citation.text)));
    if (article.award) assert.ok(html.includes(escapeText(article.award)));
    if (article.correctionNote) assert.ok(html.includes(escapeText(article.correctionNote)));
    for (const other of articles.filter(a => a.id !== article.id)) {
      assert.ok(!html.includes(escapeText(other.content.find(b => b.type === 'paragraph').text)));
    }
  }
  const water = output('/articles/tehg-uv-water-access/');
  assert.match(water, /youtube\.com\/embed\/mozEaIGmTiw/);
  assert.match(water, /data-mj-collaboration/);
  assert.match(water, /TEHG-UV schematic/);
});

test('legacy bookmarks reach the matching page, ordinary anchors stay on the page', () => {
  const html = output('/');
  const map = html.match(/id="legacy-routes" type="application\/json">([^<]+)</)[1];
  const code = read('public/legacy-routes.js');
  for (const [hash, expected] of [
    ['#/reporting/sand-cartels-southeast-asia', '/articles/sand-cartels-southeast-asia/?ref=test'],
    ['#water', '/projects/water/?ref=test'], ['#/', '/?ref=test'],
    ['#laboratory-video', null], ['#/https://example.com', null], ['#unknown', null]
  ]) {
    let destination = null;
    vm.runInNewContext(code, {
      window: { location: { hash, search: '?ref=test', replace: url => { destination = url; } } },
      document: { getElementById: () => ({ textContent: map }) }
    });
    assert.equal(destination, expected);
  }
});

test('unknown URLs are not rewritten to the home page', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.rewrites, undefined);
  assert.match(read('dist/404.html'), /Page not found/);
  const feed = read('dist/feed.xml');
  for (const article of articles) {
    assert.ok(feed.includes(`https://themarginsjournals.com${articlePath(article)}`));
    assert.ok(feed.includes(`urn:the-margins:article:${article.id}`));
  }
});
